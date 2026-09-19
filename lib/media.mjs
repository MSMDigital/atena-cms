// Libreria media: immagini del progetto (assets/img) e caricamenti (MEDIA_DIR, stessa struttura di percorsi).
// Il caricamento non si fida di nulla che venga dall'utente: il tipo si riconosce dai byte iniziali (non dall'estensione né dal Content-Type),
// i decodificatori di libvips sono limitati a JPEG, PNG e WebP, l'immagine viene sempre ricodificata (WebP, massimo 2400 px, senza metadati,
// quindi senza posizione GPS) e il nome del file lo decide il server.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { query, one } from './db.mjs';
import { ROOT, loadEnv } from './env.mjs';
import { imageSize } from '../render/image-size.mjs';
import { isSafeLogical } from '../render/images.mjs';
import { activeTemplate } from './template.mjs';

// Solo questi decodificatori (un HEIF, un TIFF o un SVG costruiti ad arte non arrivano al parser).
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

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

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
  return null;
}

// Il nome originale è solo un'informazione per chi guarda la libreria: si tolgono caratteri di controllo e di markup.
const cleanName = (n) => Array.from(String(n ?? '')).filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127 && !'<>"\\/'.includes(c)).join('').slice(0, 255) || null;

const toItem = (r) => ({
  path: r.path, width: r.width, height: r.height, bytes: r.bytes, alt: r.alt ?? '', source: r.source,
  name: r.original_name || path.basename(r.path), missing: !findFile(r.path),
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

async function saveUploadInner(buffer, originalName, userId) {
  if (!buffer?.length) throw new UploadError('Il file è vuoto.');
  if (buffer.length > maxUploadBytes()) throw new UploadError(`Il file supera ${Math.round(maxUploadBytes() / 1048576)} MB.`);
  const kind = sniff(buffer);
  if (!kind) throw new UploadError('Formato non supportato: usa JPG, PNG o WebP.');

  const used = Number((await one("SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE source = 'upload'")).n);
  if (used + buffer.length > quotaBytes()) throw new UploadError(`Spazio per le immagini esaurito (${Math.round(quotaBytes() / 1048576)} MB): elimina quelle che non servono.`);
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
  const needle = JSON.stringify(logical);
  const docs = await query('SELECT kind, doc_key, draft, published FROM docs');
  return docs.filter((d) => String(d.draft).includes(needle) || String(d.published ?? '').includes(needle))
    .map((d) => ({ kind: d.kind, key: d.doc_key, inDraft: String(d.draft).includes(needle), online: String(d.published ?? '').includes(needle) }));
}

export async function updateAlt(logical, alt) {
  const text = String(alt ?? '').trim().slice(0, 300);
  const r = await query('UPDATE media SET alt = ? WHERE path = ?', [text || null, logical]);
  return r.affectedRows > 0;
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
const THUMB_WIDTHS = [480];

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
