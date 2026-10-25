// Libreria media: immagini del progetto (assets/img) e caricamenti (MEDIA_DIR, stessa struttura di percorsi).
// Il caricamento non si fida di nulla che venga dall'utente: il tipo si riconosce dai byte iniziali (non dall'estensione né dal Content-Type).
// JPEG/PNG/WebP: i decodificatori di libvips sono limitati a questi tre, l'immagine viene sempre ricodificata (WebP, massimo 2400 px,
// senza metadati, quindi senza posizione GPS) e il nome del file lo decide il server — la ricodifica "neutralizza" qualunque payload.
// SVG: è XML testuale, non un'immagine raster: non passa da sharp (i suoi decodificatori restano bloccati per questo formato, vedi sotto)
// e non si può "ricodificare" allo stesso modo. Si conserva così com'è, ma solo se non contiene elementi pericolosi (script, gestori di
// eventi, riferimenti a risorse esterne): vedi isDangerousSvg più sotto.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { query, one, tx, withLock, parseJson, toJson } from './db.mjs';
import { ROOT, loadEnv } from './env.mjs';
import { imageSize, svgSize } from '../render/image-size.mjs';
import { isSafeLogical } from '../render/images.mjs';
import { activeTemplate } from './template.mjs';

// Solo questi decodificatori (un HEIF, un TIFF o un SVG costruiti ad arte non arrivano al parser): resta così anche
// con l'SVG gestito a parte (saveUpload lo accetta con un controllo testuale, mai attraverso sharp).
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: ['VipsForeignLoadJpegBuffer', 'VipsForeignLoadPngBuffer', 'VipsForeignLoadWebpBuffer'] });
sharp.concurrency(2);

export class UploadError extends Error {}

export const mediaDir = () => { loadEnv(); return path.resolve(process.env.MEDIA_DIR ?? path.join(ROOT, 'media')); };
// Immagini del template attivo (nel repository del template); senza template attivo non ce ne sono.
const projectDir = () => { const t = activeTemplate(); return t ? path.join(t.assetsDir, 'img') : path.join(ROOT, '.no-template'); };
export const maxUploadBytes = () => { loadEnv(); return (+process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024; };
const MAX_PIXELS = 50e6;      // oltre, si rifiuta (una PNG di colore uniforme da 100 megapixel pesa poco ma occupa GB da decodificare)
const MAX_SIDE = 2400;

const IMAGE_EXT = /\.(jpe?g|png|webp|svg)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };

export { isSafeLogical };

// File su disco per un percorso logico: prima il progetto, poi i caricamenti.
export function findFile(logical) {
  if (!isSafeLogical(logical)) return null;
  for (const root of [projectDir(), mediaDir()]) {
    const f = path.resolve(root, logical);
    if (f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Formato dai byte iniziali.
function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (isSvg(b)) return 'svg';
  return null;
}

// SVG: è testo XML, non si riconosce da un'intestazione binaria. Si guarda l'inizio del file (BOM, dichiarazione
// XML, commenti e DOCTYPE ammessi prima del tag <svg>), non l'estensione né il Content-Type.
function isSvg(b) {
  if (b.length > 2_000_000) return false;   // un file così grande non è un logo: si esclude prima di decodificarlo come testo
  const head = b.toString('utf8', 0, Math.min(b.length, 4096)).replace(/^﻿/, '').trimStart();
  return /^(<\?xml\b[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg\b[^>]*>\s*)?<svg[\s>]/i.test(head);
}

// Elementi/attributi che un SVG caricato dal browser non può contenere: script, gestori di eventi, incorporazione di
// HTML (foreignObject), URL javascript:, iframe/embed/object, riferimenti a risorse esterne (href verso http/https).
// Non è una sanificazione completa (richiederebbe un parser XML vero, qui non c'è): un controllo mirato sull'uso
// realistico (loghi esportati da un editor grafico), non una difesa contro un SVG scritto apposta per aggirarlo.
const DANGEROUS_SVG = /<\s*script\b|\son[a-z]+\s*=|<\s*foreignobject\b|javascript:|<\s*iframe\b|<\s*embed\b|<\s*object\b|href\s*=\s*["']?\s*(https?:|data:text\/html)/i;

// Il nome originale è solo un'informazione per chi guarda la libreria: si tolgono caratteri di controllo e di markup.
const cleanName = (n) => Array.from(String(n ?? '')).filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127 && !'<>"\\/'.includes(c)).join('').slice(0, 255) || null;

import { LOCALES as LANGS } from '../render/locales.mjs';
const parseI18n = (raw) => { try { const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };

const toItem = (r) => ({
  path: r.path, width: r.width, height: r.height, bytes: r.bytes, alt: r.alt ?? '', source: r.source,
  uploadedBy: r.uploaded_by ?? null, title: r.title ?? '', caption: r.caption ?? '', description: r.description ?? '', mtime: Number(r.mtime) || 0,
  name: r.original_name || path.basename(r.path), missing: !findFile(r.path),
  i18n: parseI18n(r.meta_i18n),   // titolo, testo alternativo, didascalia e descrizione nelle altre lingue
});

// ---- caricamento ----------------------------------------------------------------------------------------------------

// Al massimo 2 elaborazioni di immagini alla volta (fino a 50 megapixel = circa 200 MB ciascuna) e un tetto di spazio per i caricamenti.
let busy = 0;
const quotaBytes = () => { loadEnv(); return (+process.env.MEDIA_QUOTA_MB || 1024) * 1024 * 1024; };

export async function saveUpload(buffer, originalName, userId) {
  if (busy >= 2) throw new UploadError('Troppi caricamenti in corso: riprova tra un momento.');
  busy++;
  try { return await saveUploadInner(buffer, originalName, userId); } finally { busy--; }
}

// Un'immagine raster (JPEG, PNG, WebP già riconosciuta dai byte) → WebP di al massimo 2400 px, senza metadati. Lancia UploadError se non va bene.
async function encodeRaster(buffer, kind) {
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata(); }
  catch { throw new UploadError("L'immagine è danneggiata o troppo grande."); }
  if (meta.format !== kind) throw new UploadError("Il contenuto del file non corrisponde a un'immagine valida.");
  if (!meta.width || !meta.height) throw new UploadError("L'immagine non ha dimensioni valide.");
  if (meta.width * meta.height > MAX_PIXELS) throw new UploadError("L'immagine ha troppi pixel (massimo 50 megapixel).");

  // .rotate() applica l'orientamento EXIF; sharp scarta tutti i metadati (posizione GPS compresa) e converte in sRGB.
  const pipeline = sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  const lossless = kind === 'png' && meta.width * meta.height <= 1_500_000;      // grafica e loghi: senza perdita
  let out;
  try { out = await pipeline.webp(lossless ? { lossless: true, effort: 4 } : { quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true }); }
  catch { throw new UploadError("Non è stato possibile elaborare l'immagine."); }
  return out;
}

async function saveUploadInner(buffer, originalName, userId) {
  if (!buffer?.length) throw new UploadError('Il file è vuoto.');
  if (buffer.length > maxUploadBytes()) throw new UploadError(`Il file supera ${Math.round(maxUploadBytes() / 1048576)} MB.`);
  const kind = sniff(buffer);
  if (!kind) throw new UploadError('Formato non supportato: usa JPG, PNG, WebP o SVG.');
  if (kind === 'svg') return saveSvgUpload(buffer, originalName, userId);

  const used = Number((await one("SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE source = 'upload'")).n);
  if (used + buffer.length > quotaBytes()) throw new UploadError(`Spazio per le immagini esaurito (${Math.round(quotaBytes() / 1048576)} MB): elimina quelle che non servono.`);
  const out = await encodeRaster(buffer, kind);

  const hash = crypto.createHash('sha256').update(out.data).digest('hex').slice(0, 10);
  const base = slug(String(originalName ?? '').replace(/\.[^.]+$/, '')) || 'immagine';
  const logical = `uploads/${base}-${hash}.webp`;
  const file = path.join(mediaDir(), logical);

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, out.data);
    fs.renameSync(tmp, file);
  }
  let row = await one('SELECT * FROM media WHERE path = ?', [logical]);   // stesso contenuto già caricato: si riusa
  if (!row) {
    await query('INSERT INTO media (path, mime, width, height, bytes, uploaded_by, source, original_name, mtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [logical, 'image/webp', out.info.width, out.info.height, out.data.length, userId ?? null, 'upload', cleanName(originalName), Math.round(fs.statSync(file).mtimeMs)]);
    row = await one('SELECT * FROM media WHERE path = ?', [logical]);
  }
  return toItem(row);
}

// SVG: si conserva il file così com'è (niente ricodifica, non è un'immagine raster), dopo il controllo sui contenuti
// pericolosi. Stesso tetto di spazio dei caricamenti raster; niente limite di "megapixel" (è un vettore).
async function saveSvgUpload(buffer, originalName, userId) {
  const used = Number((await one("SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE source = 'upload'")).n);
  if (used + buffer.length > quotaBytes()) throw new UploadError(`Spazio per le immagini esaurito (${Math.round(quotaBytes() / 1048576)} MB): elimina quelle che non servono.`);
  const text = buffer.toString('utf8');
  if (DANGEROUS_SVG.test(text)) throw new UploadError('SVG non ammesso: contiene elementi non consentiti (script, gestori di eventi o riferimenti a risorse esterne). Esportalo di nuovo dall\'editor grafico, senza script né link esterni.');

  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
  const base = slug(String(originalName ?? '').replace(/\.[^.]+$/, '')) || 'immagine';
  const logical = `uploads/${base}-${hash}.svg`;
  const file = path.join(mediaDir(), logical);

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, file);
  }
  let row = await one('SELECT * FROM media WHERE path = ?', [logical]);   // stesso contenuto già caricato: si riusa
  if (!row) {
    const dims = svgSize(buffer) ?? { width: null, height: null };
    await query('INSERT INTO media (path, mime, width, height, bytes, uploaded_by, source, original_name, mtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [logical, 'image/svg+xml', dims.width, dims.height, buffer.length, userId ?? null, 'upload', cleanName(originalName), Math.round(fs.statSync(file).mtimeMs)]);
    row = await one('SELECT * FROM media WHERE path = ?', [logical]);
  }
  return toItem(row);
}

// ---- elenco e scansione -----------------------------------------------------------------------------------------------

function* walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base); else if (IMAGE_EXT.test(e.name)) yield { file: full, rel: path.relative(base, full).split(path.sep).join('/') };
  }
}

// Allinea la tabella ai file su disco: aggiunge i nuovi e aggiorna quelli cambiati. I file spariti restano in tabella (segnalati "mancante"):
// se un'immagine sparisce e una pagina la usa, meglio vederlo che nasconderlo.
export async function syncMedia() {
  const rows = new Map((await query('SELECT path, bytes, mtime FROM media')).map((r) => [r.path, r]));
  const scan = [[projectDir(), 'project', ''], [path.join(mediaDir(), 'uploads'), 'upload', 'uploads/']];
  let changed = 0;
  for (const [dir, source, prefix] of scan) {
    for (const { file, rel } of walk(dir)) {
      const logical = prefix + rel;
      const st = fs.statSync(file);
      const known = rows.get(logical);
      if (known && known.bytes === st.size && Number(known.mtime) === Math.round(st.mtimeMs)) continue;
      const dims = imageSize(file) ?? {};
      const ext = path.extname(file).slice(1).toLowerCase();
      await query(
        `INSERT INTO media (path, mime, width, height, bytes, source, mtime) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE width = VALUES(width), height = VALUES(height), bytes = VALUES(bytes), mtime = VALUES(mtime), mime = VALUES(mime)`,
        [logical, MIME[ext] ?? 'application/octet-stream', dims.width ?? null, dims.height ?? null, st.size, source, Math.round(st.mtimeMs)]);
      changed++;
    }
  }
  return changed;
}

export async function listMedia() {
  await syncMedia();
  const rows = await query("SELECT * FROM media ORDER BY source = 'upload' DESC, IF(source = 'upload', id, 0) DESC, path");
  return rows.map(toItem);
}

// ---- uso, testo alternativo, eliminazione ------------------------------------------------------------------------------------

// Documenti che usano l'immagine, nelle bozze e nelle versioni online (una modifica non ancora pubblicata non la libera).
export async function mediaUsage(logical) {
  const needles = [JSON.stringify(logical), `/assets/img/${logical}`];   // campo immagine ("percorso") e immagine dentro un testo ricco (/assets/img/percorso)
  const has = (text) => text != null && needles.some((n) => String(text).includes(n));
  const docs = await query('SELECT kind, doc_key, draft, published FROM docs');
  return docs.filter((d) => has(d.draft) || has(d.published))
    .map((d) => ({ kind: d.kind, key: d.doc_key, inDraft: has(d.draft), online: has(d.published) }));
}

export async function updateAlt(logical, alt) {
  const text = String(alt ?? '').trim().slice(0, 300);
  const r = await query('UPDATE media SET alt = ? WHERE path = ?', [text || null, logical]);
  return r.affectedRows > 0;
}

// Titolo, didascalia, descrizione e testo alternativo di un'immagine (campi liberi: solo testo, con un tetto di lunghezza).
// `meta` è la lingua di base; `meta.i18n` ({ en: { alt, title, caption, description } }) le altre lingue.
export async function updateMeta(logical, meta) {
  const t = (v, max) => { const x = Array.from(String(v ?? '')).filter((c) => c.charCodeAt(0) > 31 || c === '\n').join('').trim().slice(0, max); return x || null; };
  const fields = (m) => ({ alt: t(m?.alt, 300), title: t(m?.title, 200), caption: t(m?.caption, 500), description: t(m?.description, 2000) });
  const i18n = {};
  for (const [l, m] of Object.entries(meta?.i18n && typeof meta.i18n === 'object' ? meta.i18n : {})) {
    if (!LANGS.includes(l)) continue;
    const f = Object.fromEntries(Object.entries(fields(m)).filter(([, v]) => v));   // solo i campi scritti
    if (Object.keys(f).length) i18n[l] = f;
  }
  const b = fields(meta);
  const r = await query('UPDATE media SET alt = ?, title = ?, caption = ?, description = ?, meta_i18n = ? WHERE path = ?',
    [b.alt, b.title, b.caption, b.description, Object.keys(i18n).length ? JSON.stringify(i18n) : null, logical]);
  return r.affectedRows > 0;
}

// ---- sostituzione e modifica (ritaglio, ridimensionamento) -------------------------------------------------------------------------

const writeAtomic = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
};
const dropThumbs = (logical) => { for (const t of thumbFiles(logical)) fs.rmSync(t, { force: true }); };
const usedBytes = async (except = null) => Number((await one("SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE source = 'upload'" + (except ? ' AND path <> ?' : ''), except ? [except] : [])).n);
const slot = async (fn) => {
  if (busy >= 2) throw new UploadError('Troppe elaborazioni in corso: riprova tra un momento.');
  busy++;
  try { return await fn(); } finally { busy--; }
};

// Sostituisce il contenuto di un caricamento tenendo lo stesso percorso: le pagine che lo usano mostrano subito la nuova immagine.
// Un raster si sostituisce con un raster (ricodificato in WebP come ogni caricamento), un SVG con un altro SVG.
export function replaceUpload(logical, buffer, originalName, userId) { return slot(() => replaceInner(logical, buffer, originalName, userId)); }

async function replaceInner(logical, buffer, originalName, userId) {
  const row = isSafeLogical(logical) ? await one('SELECT * FROM media WHERE path = ?', [logical]) : null;
  if (!row) throw new UploadError("L'immagine non esiste.");
  if (row.source !== 'upload') throw new UploadError('Le immagini del progetto non si sostituiscono da qui.');
  if (!buffer?.length) throw new UploadError('Il file è vuoto.');
  if (buffer.length > maxUploadBytes()) throw new UploadError(`Il file supera ${Math.round(maxUploadBytes() / 1048576)} MB.`);
  const kind = sniff(buffer);
  if (!kind) throw new UploadError('Formato non supportato: usa JPG, PNG, WebP o SVG.');
  const oldSvg = logical.toLowerCase().endsWith('.svg');
  if ((kind === 'svg') !== oldSvg) throw new UploadError(oldSvg ? 'Un SVG si sostituisce con un altro SVG.' : 'Questa immagine si sostituisce con un JPG, PNG o WebP (non con un SVG).');
  if (await usedBytes(logical) + buffer.length > quotaBytes()) throw new UploadError(`Spazio per le immagini esaurito (${Math.round(quotaBytes() / 1048576)} MB): elimina quelle che non servono.`);

  let data; let dims;
  if (kind === 'svg') {
    if (DANGEROUS_SVG.test(buffer.toString('utf8'))) throw new UploadError('SVG non ammesso: contiene elementi non consentiti (script, gestori di eventi o riferimenti a risorse esterne).');
    data = buffer; dims = svgSize(buffer) ?? { width: null, height: null };
  } else {
    const out = await encodeRaster(buffer, kind);
    data = out.data; dims = { width: out.info.width, height: out.info.height };
  }
  const file = path.join(mediaDir(), logical);
  dropThumbs(logical);
  writeAtomic(file, data);
  await query('UPDATE media SET width = ?, height = ?, bytes = ?, mtime = ?, original_name = ?, uploaded_by = COALESCE(?, uploaded_by) WHERE path = ?',
    [dims.width, dims.height, data.length, Math.round(fs.statSync(file).mtimeMs), cleanName(originalName) ?? row.original_name, userId ?? null, logical]);
  return toItem(await one('SELECT * FROM media WHERE path = ?', [logical]));
}

// Ritaglia e/o ridimensiona (solo riducendo). `crop`: { x, y, width, height } in pixel dell'immagine; `width`: larghezza finale.
// mode 'replace': cambia il file (stesso percorso, solo caricamenti); 'copy': crea una nuova immagine e lascia l'originale (vale anche per quelle del progetto).
// Gli SVG non si ritagliano né si ridimensionano (sono vettori).
export function editImage(logical, opts, userId) { return slot(() => editInner(logical, opts ?? {}, userId)); }

async function editInner(logical, { crop = null, width = null, mode = 'copy' }, userId) {
  const row = isSafeLogical(logical) ? await one('SELECT * FROM media WHERE path = ?', [logical]) : null;
  if (!row) throw new UploadError("L'immagine non esiste.");
  if (logical.toLowerCase().endsWith('.svg')) throw new UploadError('Gli SVG non si possono ritagliare né ridimensionare.');
  if (mode !== 'replace' && mode !== 'copy') throw new UploadError('Modo non valido.');
  if (mode === 'replace' && row.source !== 'upload') throw new UploadError('Le immagini del progetto non si modificano sul posto: salva una copia.');
  if (!crop && !width) throw new UploadError('Niente da modificare: scegli un ritaglio o una larghezza.');
  const file = findFile(logical);
  if (!file) throw new UploadError('Il file non si trova più sul server.');
  let buf = fs.readFileSync(file);
  let m;
  try { m = await sharp(buf, { limitInputPixels: MAX_PIXELS }).metadata(); } catch { throw new UploadError("L'immagine è danneggiata o troppo grande."); }
  if (m.orientation && m.orientation > 1) { buf = await sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().toBuffer(); m = await sharp(buf).metadata(); }   // il ritaglio è sull'immagine come si vede
  const W = m.width; const H = m.height;

  let region = null; let outW = W; let outH = H;
  if (crop) {
    let [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => Math.round(Number(crop[k])));
    if (![x, y, w, h].every(Number.isFinite)) throw new UploadError('Il ritaglio non è valido.');
    // Il browser lavora con coordinate decimali: arrotondandole una per una il bordo può uscire di 1-2 px. Fino a 2 px si riporta dentro l'immagine.
    if (x + w > W && x + w - W <= 2) w = W - x;
    if (y + h > H && y + h - H <= 2) h = H - y;
    if (x < 0 && x >= -2) { w += x; x = 0; }
    if (y < 0 && y >= -2) { h += y; y = 0; }
    if (x < 0 || y < 0 || x + w > W || y + h > H) throw new UploadError(`Il ritaglio esce dall'immagine (${W} × ${H} px).`);
    if (w < 16 || h < 16) throw new UploadError('Il ritaglio è troppo piccolo (minimo 16 px per lato).');
    region = { left: x, top: y, width: w, height: h }; outW = w; outH = h;
  }
  let target = null;
  if (width != null) {
    target = Math.round(Number(width));
    if (!Number.isFinite(target) || target < 16 || target > MAX_SIDE) throw new UploadError(`La larghezza deve essere tra 16 e ${MAX_SIDE} px.`);
    if (target > outW) throw new UploadError(`Si può solo ridurre: la larghezza massima è ${outW} px.`);
  }
  let pipe = sharp(buf, { limitInputPixels: MAX_PIXELS });
  if (region) pipe = pipe.extract(region);
  if (target && target < outW) pipe = pipe.resize({ width: target });
  let out;
  try { out = await pipe.webp({ quality: 88, effort: 4 }).toBuffer({ resolveWithObject: true }); } catch { throw new UploadError("Non è stato possibile elaborare l'immagine."); }

  if (mode === 'replace') {
    if (await usedBytes(logical) + out.data.length > quotaBytes()) throw new UploadError('Spazio per le immagini esaurito.');
    dropThumbs(logical);
    writeAtomic(file, out.data);
    await query('UPDATE media SET width = ?, height = ?, bytes = ?, mtime = ? WHERE path = ?', [out.info.width, out.info.height, out.data.length, Math.round(fs.statSync(file).mtimeMs), logical]);
    return toItem(await one('SELECT * FROM media WHERE path = ?', [logical]));
  }
  if (await usedBytes() + out.data.length > quotaBytes()) throw new UploadError(`Spazio per le immagini esaurito (${Math.round(quotaBytes() / 1048576)} MB): elimina quelle che non servono.`);
  const hash = crypto.createHash('sha256').update(out.data).digest('hex').slice(0, 10);
  const base = slug(path.basename(logical).replace(/\.[^.]+$/, '').replace(/-[0-9a-f]{10}$/, '')) || 'immagine';
  const copy = `uploads/${base}-${hash}.webp`;
  const dest = path.join(mediaDir(), copy);
  if (!fs.existsSync(dest)) writeAtomic(dest, out.data);
  if (!(await one('SELECT id FROM media WHERE path = ?', [copy]))) {
    await query('INSERT INTO media (path, mime, width, height, bytes, uploaded_by, source, original_name, mtime, alt, title, caption, description, meta_i18n) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [copy, 'image/webp', out.info.width, out.info.height, out.data.length, userId ?? null, 'upload', cleanName(`${row.original_name || path.basename(logical)} (modificata)`), Math.round(fs.statSync(dest).mtimeMs), row.alt, row.title, row.caption, row.description, row.meta_i18n ?? null]);
  }
  return toItem(await one('SELECT * FROM media WHERE path = ?', [copy]));
}

// ---- nome del file ------------------------------------------------------------------------------------------------------------------

// Nome di file da un testo libero: lettere minuscole, numeri e trattini ("Foto Città 2026" → "foto-citta-2026").
export const fileBase = (s) => String(s ?? '').replace(/\.[a-z0-9]{2,4}$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Cambia il nome del file di un caricamento (il percorso: uploads/<nome>.<estensione>) e aggiorna da solo tutti i punti che lo usano, nelle
// bozze e nelle versioni online (campi immagine e immagini nei testi). Il file già pubblicato nel sito resta com'è fino alla prossima pubblicazione.
// Solo i caricamenti: i file del progetto stanno nel repository.
export async function renameMedia(logical, newName) {
  const row = isSafeLogical(logical) ? await one('SELECT * FROM media WHERE path = ?', [logical]) : null;
  if (!row) throw new UploadError("L'immagine non esiste.");
  if (row.source !== 'upload') throw new UploadError('Le immagini del progetto non si rinominano da qui.');
  const base = fileBase(newName);
  if (!base) throw new UploadError('Scrivi un nome (lettere o numeri).');
  const ext = path.extname(logical).toLowerCase();
  const next = `uploads/${base}${ext}`;
  if (next === logical) throw new UploadError('Il nome è già questo.');
  const file = findFile(logical);
  if (!file) throw new UploadError('Il file non si trova più sul server.');
  const dest = path.join(mediaDir(), next);
  if ((await one('SELECT id FROM media WHERE path = ?', [next])) || fs.existsSync(dest)) throw new UploadError(`Esiste già un file chiamato «${base}${ext}»: scegli un altro nome.`);

  // Non durante una pubblicazione: il sito si costruisce leggendo questi stessi riferimenti.
  const run = await withLock('cms-publish', async () => {
    dropThumbs(logical);
    fs.renameSync(file, dest);
    try {
      return await tx(async (t) => {
        const swap = (node) => {
          if (typeof node === 'string') return node === logical ? next : node.includes(`/assets/img/${logical}`) ? node.split(`/assets/img/${logical}`).join(`/assets/img/${next}`) : node;
          if (Array.isArray(node)) return node.map(swap);
          if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v)]));
          return node;
        };
        let updated = 0;
        for (const d of await t.query('SELECT id, draft, published FROM docs')) {
          const hit = [d.draft, d.published].some((v) => v != null && (String(v).includes(logical)));
          if (!hit) continue;
          const draft = toJson(swap(parseJson(d.draft)));
          const published = d.published == null ? null : toJson(swap(parseJson(d.published)));
          if (draft === String(d.draft) && published === (d.published == null ? null : String(d.published))) continue;
          await t.query('UPDATE docs SET draft = ?, published = ?, rev = rev + 1 WHERE id = ?', [draft, published, d.id]);   // rev: chi ha il documento aperto vede il conflitto e lo ricarica
          updated++;
        }
        await t.query('UPDATE media SET path = ?, original_name = ?, mtime = ? WHERE path = ?', [next, `${base}${ext}`, Math.round(fs.statSync(dest).mtimeMs), logical]);
        return updated;
      });
    } catch (e) { fs.renameSync(dest, file); throw e; }   // il database non è cambiato: il file torna dov'era
  }, 0);
  if (!run.ok) throw new UploadError('Una pubblicazione è in corso: riprova tra un momento.');
  return { item: toItem(await one('SELECT * FROM media WHERE path = ?', [next])), updated: run.value };
}

// Elimina un caricamento non usato. I file del progetto non si eliminano da qui (stanno nel repository).
export async function deleteMedia(logical) {
  const row = await one('SELECT * FROM media WHERE path = ?', [logical]);
  if (!row) return { ok: false, error: "L'immagine non esiste." };
  if (row.source !== 'upload') return { ok: false, error: 'Le immagini del progetto non si eliminano da qui.' };
  const usage = await mediaUsage(logical);
  if (usage.length) return { ok: false, error: "L'immagine è ancora usata.", usage };
  const file = findFile(logical);
  if (file) { for (const t of thumbFiles(logical)) fs.rmSync(t, { force: true }); fs.rmSync(file, { force: true }); }
  await query('DELETE FROM media WHERE path = ?', [logical]);
  return { ok: true };
}

// ---- miniature (solo per l'admin, non si pubblicano) ---------------------------------------------------------------------------

const thumbKey = (logical, st, width) => crypto.createHash('sha1').update(`${logical}:${st.size}:${Math.round(st.mtimeMs)}:${width}`).digest('hex').slice(0, 16);
const THUMB_WIDTHS = [480, 1200];   // 1200: l'anteprima grande dello strumento di ritaglio
export const thumbWidth = (w) => (THUMB_WIDTHS.includes(Number(w)) ? Number(w) : 480);

function thumbFiles(logical) {
  const file = findFile(logical);
  if (!file) return [];
  const st = fs.statSync(file);
  return THUMB_WIDTHS.map((w) => path.join(mediaDir(), '.thumbs', `${thumbKey(logical, st, w)}.webp`));
}

export async function thumbnail(logical, width = 480) {
  const file = findFile(logical);
  if (!file) return null;
  const st = fs.statSync(file);
  const out = path.join(mediaDir(), '.thumbs', `${thumbKey(logical, st, width)}.webp`);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const buf = await sharp(fs.readFileSync(file), { limitInputPixels: MAX_PIXELS }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    const tmp = `${out}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
  }
  return out;
}
