// Installazione dei template da pacchetto zip (e creazione del pacchetto). Un template contiene CODICE che produce l'HTML del sito, quindi:
//  - lo zip è trattato come non fidato: percorsi normalizzati (niente ../ né percorsi assoluti), tipi di file ammessi solo in certe cartelle,
//    limiti su numero di file, dimensioni e rapporto di compressione;
//  - il pacchetto si estrae in una cartella di prova (templates/.staging) e si controlla per intero: manifest, token, schemi che compilano,
//    contenuti di esempio validi, importazioni del codice, e un'esecuzione di prova di tutte le pagine NEL PROCESSO ISOLATO (render/host.mjs);
//  - solo se tutto passa va in templates/<id>; la versione precedente finisce in templates/.trash (se ne tengono 5).
// Questo modulo non usa il database (l'attivazione e il controllo dei contenuti esistenti stanno in lib/template-switch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import { templatesDir, readManifest, loadTemplateFrom, TEMPLATE_ID, SEMVER, listTemplates, activeTemplateId } from './template.mjs';
import { schemasFor, createValidators, RESERVED_BLOCK_TYPES } from '../schema/index.mjs';
import { validateData } from '../schema/validate.mjs';
import { validateTokens } from '../render/tokens.mjs';
import { renderPages, stopWorker } from '../render/host.mjs';
import { createContext, loadData } from '../render/context.mjs';
import { imageInfo } from '../render/build.mjs';

export const LIMITS = { zipBytes: 60 * 1024 * 1024, files: 3000, fileBytes: 25 * 1024 * 1024, totalBytes: 200 * 1024 * 1024, ratio: 200 };

const ASSET_EXT = new Set(['css', 'js', 'json', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'txt', 'xml', 'webmanifest']);
const ROOT_FILES = new Set(['template.json', 'tokens.json', 'ui.json', 'README.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md']);

// Dove può stare ogni file: { cartella: estensioni ammesse }. Fuori da qui il file è rifiutato.
const AREAS = { render: new Set(['mjs', 'json']), schema: new Set(['json']), content: new Set(['json']), docs: new Set(['md', 'txt']), assets: ASSET_EXT };

export class TemplateError extends Error {
  constructor(message, details = []) { super(message); this.details = details; }
}

const ext = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
const hasControl = (s) => Array.from(s).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

// Percorso di un file del pacchetto in forma sicura, oppure null.
export function safeEntry(name) {
  const n = String(name).replace(/\\/g, '/');
  if (!n || n.length > 200 || hasControl(n) || n.startsWith('/') || /^[A-Za-z]:/.test(n)) return null;
  const parts = n.split('/').filter((p, i, a) => !(p === '' && i === a.length - 1));
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.') || p === 'node_modules')) return null;
  return parts.join('/');
}

// Il file può stare in quel percorso? (cartelle e tipi ammessi)
export function allowedPath(rel) {
  const parts = rel.split('/');
  if (parts.length === 1) return ROOT_FILES.has(rel) || /^preview\.(png|jpe?g|webp)$/.test(rel);
  const area = AREAS[parts[0]];
  if (!area) return false;
  const e = ext(rel);
  if (!area.has(e)) return false;
  if (parts[0] === 'render' && parts.length > 4) return false;
  return true;
}

// ---- lettura dello zip -----------------------------------------------------------------------------------------------------

// Restituisce { files: Map<percorso, Uint8Array> } oppure lancia TemplateError con l'elenco dei problemi.
export function readZip(buffer) {
  if (!buffer?.length) throw new TemplateError('Il file è vuoto.');
  if (buffer.length > LIMITS.zipBytes) throw new TemplateError(`Il file supera ${Math.round(LIMITS.zipBytes / 1048576)} MB.`);
  if (!(buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new TemplateError('Non è un file zip.');
  const problems = [];
  let count = 0; let total = 0;
  let entries;
  try {
    entries = unzipSync(buffer, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;                       // cartelle
        if (++count > LIMITS.files) throw new TemplateError(`Troppi file (oltre ${LIMITS.files}).`);
        if (f.originalSize > LIMITS.fileBytes) { problems.push(`${f.name}: file troppo grande`); return false; }
        total += f.originalSize;
        if (total > LIMITS.totalBytes) throw new TemplateError('Contenuto decompresso troppo grande.');
        if (f.size > 0 && f.originalSize / f.size > LIMITS.ratio && f.originalSize > 1_000_000) throw new TemplateError(`${f.name}: rapporto di compressione sospetto.`);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof TemplateError) throw e;
    throw new TemplateError('Lo zip non è leggibile o è danneggiato.');
  }
  // Un solo cartella in cima (come fanno molti programmi di compressione): la si toglie.
  let names = Object.keys(entries);
  const tops = new Set(names.map((n) => n.replace(/\\/g, '/').split('/')[0]));
  const wrapped = tops.size === 1 && !names.some((n) => n.replace(/\\/g, '/') === 'template.json');
  const files = new Map();
  for (const name of names) {
    const raw = wrapped ? name.replace(/\\/g, '/').split('/').slice(1).join('/') : name;
    if (!raw) continue;
    const rel = safeEntry(raw);
    if (!rel) { problems.push(`${name}: percorso non ammesso`); continue; }
    if (!allowedPath(rel)) { problems.push(`${rel}: questo tipo di file non può stare qui`); continue; }
    if (files.has(rel)) { problems.push(`${rel}: presente due volte`); continue; }
    files.set(rel, entries[name]);
  }
  if (problems.length) throw new TemplateError('Il pacchetto contiene file non ammessi.', problems.slice(0, 30));
  return { files };
}

// ---- controlli sul contenuto del pacchetto ---------------------------------------------------------------------------------

// Importazioni del codice del template: solo @cms/kit, file della propria cartella render/, e pochi moduli innocui.
// (È un controllo per dare errori chiari: la vera barriera è il processo isolato.)
export function scanRenderCode(name, code) {
  const problems = [];
  const specs = [...code.matchAll(/(?:^|[\s;{}])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*(['"`])([^'"`]*)\2|import\s+['"]([^'"]+)['"]/g)];
  for (const m of specs) {
    const s = m[1] ?? m[3] ?? m[4] ?? '';
    if (s === '@cms/kit' || /^node:(path|url|util)$/.test(s)) continue;
    if (s.startsWith('./') || s.startsWith('../')) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), s));
      if (!target.startsWith('render/')) problems.push(`${name}: importa "${s}" fuori dalla cartella render/`);
      continue;
    }
    problems.push(`${name}: importa "${s}" (ammessi solo @cms/kit e i file di render/)`);
  }
  if (/\bimport\s*\(\s*[^'"`\s)]/.test(code)) problems.push(`${name}: import() con un percorso calcolato`);
  if (/\b(eval|Function)\s*\(/.test(code)) problems.push(`${name}: usa eval o new Function`);
  if (/\bprocess\s*[.[]|\brequire\s*\(|\bglobalThis\.process\b/.test(code)) problems.push(`${name}: usa process o require`);
  return problems;
}

// Le espressioni regolari degli schemi (pattern) le esegue il motore, nel processo principale, a ogni validazione: un pattern "catastrofico"
// (es. (a|aa)+$) bloccherebbe il server con un solo testo. Si ammette solo un sottoinsieme sicuro: un gruppo seguito da un quantificatore
// ripetitivo (* + {n,m}) non può contenere a sua volta quantificatori o alternative; niente retroreferenze né lookbehind; lunghezza limitata.
export function riskyPattern(p) {
  if (typeof p !== 'string') return 'non è una stringa';
  if (p.length > 600) return 'troppo lungo (oltre 600 caratteri)';
  try { new RegExp(p, 'u'); } catch (e) { return `non valido: ${e.message}`; }
  const stack = [];                 // per ogni gruppo aperto: { quant, alt }
  let last = null;                  // l'ultimo elemento chiuso, se era un gruppo: { quant, alt }
  const repeats = (i) => { const c = p[i]; if (c === '*' || c === '+') return true; if (c === '{') { const m = /^\{(\d*)(,?)(\d*)\}/.exec(p.slice(i)); return !!m && (m[2] === ',' ? (m[3] === '' || +m[3] > 1) : +m[1] > 1); } return false; };
  const isQuant = (i) => '*+?{'.includes(p[i]) && (p[i] !== '{' || /^\{\d*,?\d*\}/.test(p.slice(i)));
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') {
      if (/[1-9]/.test(p[i + 1] ?? '') || p[i + 1] === 'k') return 'retroreferenze non ammesse';
      i++; last = null; continue;
    }
    if (c === '[') { i++; if (p[i] === '^') i++; if (p[i] === ']') i++; while (i < p.length && p[i] !== ']') { if (p[i] === '\\') i++; i++; } last = null; if (i < p.length && isQuant(i + 1) && stack.length) stack[stack.length - 1].quant = true; continue; }
    if (c === '(') {
      if (p[i + 1] === '?' && p[i + 2] === '<' && (p[i + 3] === '=' || p[i + 3] === '!')) return 'lookbehind non ammesso';
      stack.push({ quant: false, alt: false }); last = null; continue;
    }
    if (c === ')') {
      const g = stack.pop() ?? { quant: false, alt: false };
      if (i + 1 < p.length && isQuant(i + 1) && repeats(i + 1) && (g.quant || g.alt)) return 'quantificatori annidati o alternative ripetute (rischio di blocco del server)';
      if (stack.length && (g.quant || g.alt)) stack[stack.length - 1].quant ||= g.quant;   // la ripetizione del gruppo interno conta per quello esterno
      if (i + 1 < p.length && isQuant(i + 1) && stack.length) stack[stack.length - 1].quant = true;
      last = g; continue;
    }
    if (c === '|') { if (stack.length) stack[stack.length - 1].alt = true; last = null; continue; }
    if (isQuant(i) && stack.length && c !== '?') stack[stack.length - 1].quant = true;
    else if (c === '?' && stack.length && last === null && i > 0 && !'(|'.includes(p[i - 1])) stack[stack.length - 1].quant = true;
  }
  return null;
}
export function scanSchemaPatterns(node, where = 'schema', out = [], depth = 0) {
  if (depth > 60) { out.push(`${where}: annidamento eccessivo`); return out; }
  if (Array.isArray(node)) node.forEach((n, i) => scanSchemaPatterns(n, `${where}[${i}]`, out, depth + 1));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'pattern') { const r = riskyPattern(v); if (r) out.push(`${where}: pattern ${r}`); }
      else if (k === 'patternProperties' && v && typeof v === 'object') for (const pp of Object.keys(v)) { const r = riskyPattern(pp); if (r) out.push(`${where}: patternProperties ${r}`); }
      if (typeof v === 'object') scanSchemaPatterns(v, `${where}.${k}`, out, depth + 1);
    }
  }
  return out;
}

// Controllo completo di un template già estratto in `dir`. Restituisce { manifest, tpl, errors, warnings, smoke }.
export async function validateTemplateDir(dir) {
  const errors = []; const warnings = [];
  let manifest; let tpl;
  try { manifest = readManifest(dir); } catch (e) { return { errors: [e.message], warnings }; }
  for (const f of ['tokens.json', 'schema/blocks.json', 'render/index.mjs', 'content/site.json', 'content/shared.json']) if (!fs.existsSync(path.join(dir, f))) errors.push(`manca il file ${f}`);
  if (!fs.existsSync(path.join(dir, 'assets'))) errors.push('manca la cartella assets/');
  if (!fs.existsSync(path.join(dir, 'content/pages')) || !fs.readdirSync(path.join(dir, 'content/pages')).some((f) => f.endsWith('.json'))) errors.push('content/pages/ deve contenere almeno una pagina (home.json)');
  if (errors.length) return { manifest, errors, warnings };
  try { tpl = loadTemplateFrom(dir); } catch (e) { return { manifest, errors: [e.message], warnings }; }

  // Il template non può ridefinire i campi del motore, e i suoi JSON di contenuto hanno un tetto (si leggono e validano nel processo principale).
  const RESERVED_SITE = ['siteUrl', 'locales', 'seo', 'consent', 'strings', 'formsEndpoint', 'geo', 'tracking', 'organization', 'crawling', 'blog'];
  const RESERVED_PAGE = ['key', 'status', 'parent', 'slug', 'name', 'title', 'description', 'ogImage', 'ogType', 'noindex', 'noai', 'protected', 'blocks', 'contentType', 'datePublished', 'dateModified', 'author', 'facts', 'faq'];
  for (const k of RESERVED_SITE) if (tpl.schema.site?.properties && Object.hasOwn(tpl.schema.site.properties, k)) errors.push(`schema/site.json: "${k}" è un campo del motore e non si può ridefinire`);
  if (tpl.schema.header?.properties || tpl.schema.footer?.properties) RESERVED_PAGE.push('header', 'footer');   // campi del motore solo se il template scorpora header e footer
  for (const k of RESERVED_PAGE) if (tpl.schema.page?.properties && Object.hasOwn(tpl.schema.page.properties, k)) errors.push(`schema/page.json: "${k}" è un campo del motore e non si può ridefinire`);
  const jsons = [tpl.tokensFile, ...['site.json', 'shared.json'].map((f) => path.join(tpl.contentDir, f)), ...fs.readdirSync(path.join(tpl.contentDir, 'pages')).map((f) => path.join(tpl.contentDir, 'pages', f))];
  let contentBytes = 0;
  for (const f of jsons) { const size = fs.existsSync(f) ? fs.statSync(f).size : 0; contentBytes += size; if (size > 2_000_000) errors.push(`${path.relative(dir, f)}: troppo grande (oltre 2 MB)`); }
  if (contentBytes > 20_000_000) errors.push('i contenuti di esempio superano 20 MB');
  if (errors.length) return { manifest, errors, warnings };

  const tokenErrors = validateTokens(JSON.parse(fs.readFileSync(tpl.tokensFile, 'utf8')));
  for (const e of tokenErrors) errors.push(`tokens.json: ${e}`);

  const blocks = tpl.schema.blocks?.blocks;
  if (!Array.isArray(blocks) || !blocks.length) errors.push('schema/blocks.json deve contenere { "blocks": [ ... ] } con almeno un blocco');
  else for (const b of blocks) {
    const id = typeof b?.$id === 'string' ? b.$id.split('/').pop().replace(/\.json$/, '') : '';
    if (!/^[a-z][a-z0-9-]*$/.test(id) || !/\/blocks\//.test(b.$id)) errors.push(`schema/blocks.json: ogni blocco ha un "$id" del tipo .../blocks/<tipo>.json (trovato ${JSON.stringify(b?.$id)})`);
    else if (b?.properties?.type?.const !== id) errors.push(`schema/blocks.json: il blocco "${id}" deve avere properties.type.const = "${id}"`);
    else if (RESERVED_BLOCK_TYPES.includes(id)) errors.push(`schema/blocks.json: "${id}" è un tipo di blocco del motore e non si può ridefinire`);
  }
  if (errors.length) return { manifest, errors, warnings };

  // Dimensioni e pattern degli schemi: prima di compilarli (e di eseguirli sui contenuti).
  for (const f of ['schema/blocks.json', 'schema/site.json', 'schema/page.json', 'ui.json']) {
    const file = path.join(dir, f);
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) errors.push(`${f}: troppo grande (oltre 1 MB)`);
  }
  errors.push(...scanSchemaPatterns({ blocks: tpl.schema.blocks, site: tpl.schema.site, page: tpl.schema.page }, 'schema').slice(0, 10));
  if (errors.length) return { manifest, errors, warnings };

  let schemas;
  try { schemas = schemasFor(tpl); createValidators(schemas); } catch (e) { return { manifest, errors: [`gli schemi non sono validi: ${String(e.message).slice(0, 300)}`], warnings }; }

  // Codice: solo file .mjs in render/, con importazioni ammesse.
  const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]));
  for (const f of walk(path.join(dir, 'render'))) if (f.endsWith('.mjs')) errors.push(...scanRenderCode(`render/${f}`, fs.readFileSync(path.join(dir, 'render', f), 'utf8')));
  if (errors.length) return { manifest, errors, warnings };

  // Contenuti di esempio: validi contro gli schemi del template.
  let data;
  try {
    data = loadData(dir);
    const r = validateData({ site: data.site, shared: data.shared, pages: data.pages, headers: data.headers, footers: data.footers, posts: data.posts, categories: data.categories, tags: data.tags }, tpl);
    for (const e of r.errors) errors.push(`contenuti di esempio: ${e}`);
    warnings.push(...r.warnings.slice(0, 20).map((w) => `contenuti di esempio: ${w}`));
    if (!data.pages.some((p) => p.key === 'home')) errors.push('contenuti di esempio: manca la pagina "home"');
  } catch (e) { errors.push(`contenuti di esempio non leggibili: ${e.message}`); }
  if (errors.length) return { manifest, tpl, errors, warnings };

  // Prova di esecuzione: tutte le pagine pubblicate, in tutte le lingue attive, nel processo isolato.
  const smoke = { pages: 0, ms: 0 };
  try {
    const t0 = Date.now();
    const full = { ...data, meta: { fontsCss: 'css/fonts.css', preload: [], htmlAttrs: {} } };
    const jobs = data.site.locales.enabled.map((locale) => {
      const ctx = createContext(full, locale, { images: {} });
      return { locale, keys: data.pages.filter((p) => ctx.isLive(p, locale)).map((p) => p.key) };
    });
    const images = imageInfo(full, [path.join(tpl.assetsDir, 'img')]);
    const out = await renderPages(tpl, { data: full, jobs, images }, { timeoutMs: 60_000 });
    smoke.pages = out.length; smoke.ms = Date.now() - t0;
    stopWorker(tpl.dir);                // il processo di prova non deve restare acceso
    for (const o of out) {
      if (!/^\s*<!doctype html/i.test(o.html)) warnings.push(`pagina "${o.key}" (${o.locale}): l'HTML non comincia con <!doctype html>`);
      if (/<script[^>]*>[^<]*(?:document\.cookie|localStorage)/i.test(o.html)) warnings.push(`pagina "${o.key}": uno script in linea usa cookie o localStorage (va coperto dall'informativa cookie)`);
    }
  } catch (e) { stopWorker(tpl.dir); errors.push(`prova di esecuzione: ${e.message}`); }
  return { manifest, tpl, errors, warnings, smoke };
}

// ---- installazione -----------------------------------------------------------------------------------------------------------

const cmpVersion = (a, b) => {
  const pa = a.split(/[-+]/)[0].split('.').map(Number); const pb = b.split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
const stagingDir = () => path.join(templatesDir(), '.staging');
const trashDir = () => path.join(templatesDir(), '.trash');

function writeFiles(files, dir) {
  for (const [rel, bytes] of files) {
    const target = path.join(dir, rel);
    if (!path.resolve(target).startsWith(path.resolve(dir) + path.sep)) throw new TemplateError(`${rel}: percorso non ammesso`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { mode: 0o644 });
  }
}

function toTrash(dir, id, version) {
  fs.mkdirSync(trashDir(), { recursive: true });
  fs.renameSync(dir, path.join(trashDir(), `${id}-${version}-${Date.now()}`));
  // Solo le copie di QUESTO template (id-versione-istante: "foo" non si confonde con "foo-bar"), dalla più vecchia per istante.
  const re = new RegExp(`^${id.replace(/[-]/g, '\\-')}-\\d+\\.\\d+\\.\\d+[^/]*-(\\d+)$`);
  const mine = fs.readdirSync(trashDir()).map((n) => ({ n, t: Number(re.exec(n)?.[1]) })).filter((x) => x.t).sort((a, b) => a.t - b.t);
  for (const old of mine.slice(0, -5)) fs.rmSync(path.join(trashDir(), old.n), { recursive: true, force: true });
}

// Installa un pacchetto zip. Restituisce { ok: true, manifest, warnings, upgradedFrom } oppure { ok: false, error, details }.
// `allowSameVersion`: permette di reinstallare la stessa versione (o una precedente).
export async function installTemplateZip(buffer, { allowSameVersion = false, precheck } = {}) {
  let stage = null;
  try {
    const { files } = readZip(buffer);
    fs.mkdirSync(stagingDir(), { recursive: true });
    stage = path.join(stagingDir(), crypto.randomBytes(8).toString('hex'));
    writeFiles(files, stage);

    const check = await validateTemplateDir(stage);
    if (check.errors.length) return { ok: false, error: 'Il template non è valido.', details: check.errors.slice(0, 40) };
    const { manifest } = check;
    if (precheck) {                     // controlli che dipendono dal sito (es. compatibilità con i contenuti se si aggiorna il template attivo)
      const refuse = await precheck(manifest, check.tpl);
      if (refuse) return { ok: false, error: refuse.error ?? String(refuse), details: refuse.details ?? [] };
    }

    const final = path.join(templatesDir(), manifest.id);
    let upgradedFrom = null;
    if (fs.existsSync(final)) {
      let old = null;
      try { old = readManifest(final); } catch { /* installazione rotta: si sostituisce */ }
      if (old && !allowSameVersion && cmpVersion(manifest.version, old.version) <= 0) {
        return { ok: false, error: `Il template "${manifest.id}" è già installato (versione ${old.version}): la versione del pacchetto (${manifest.version}) deve essere più recente.`, details: [] };
      }
      upgradedFrom = old?.version ?? null;
      toTrash(final, manifest.id, old?.version ?? 'rotto');
    }
    fs.mkdirSync(templatesDir(), { recursive: true });
    fs.renameSync(stage, final); stage = null;
    return { ok: true, manifest, warnings: check.warnings, smoke: check.smoke, upgradedFrom };
  } catch (e) {
    if (e instanceof TemplateError) return { ok: false, error: e.message, details: e.details };
    throw e;
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
    try { const s = stagingDir(); for (const n of fs.existsSync(s) ? fs.readdirSync(s) : []) if (Date.now() - fs.statSync(path.join(s, n)).mtimeMs > 3600_000) fs.rmSync(path.join(s, n), { recursive: true, force: true }); } catch { /* pulizia facoltativa */ }
  }
}

// Toglie un template installato (non quello attivo): finisce nel cestino.
export function removeTemplate(id) {
  if (!TEMPLATE_ID.test(id ?? '')) throw new TemplateError('Template non valido.');
  if (id === activeTemplateId()) throw new TemplateError('Il template attivo non si può togliere: attiva prima un altro template.');
  const dir = path.join(templatesDir(), id);
  if (!fs.existsSync(dir)) throw new TemplateError('Template non trovato.');
  let version = 'x'; try { version = readManifest(dir).version; } catch { /* rotto */ }
  toTrash(dir, id, version);
}

// ---- creazione del pacchetto ---------------------------------------------------------------------------------------------------

// Zip di una cartella-template (solo file ammessi: niente tools/, node_modules, file nascosti).
export function packTemplate(dir) {
  dir = path.resolve(dir);
  readManifest(dir);
  const out = {}; const skipped = [];
  const walk = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(path.join(d, e.name), rel); continue; }
      if (!e.isFile() || !safeEntry(rel) || !allowedPath(rel) || /(^|\/)(tokens\.meta\.json|dev-shot\.css)$/.test(rel)) { skipped.push(rel); continue; }
      out[rel] = new Uint8Array(fs.readFileSync(path.join(d, e.name)));
    }
  };
  walk(dir, '');
  return { zip: Buffer.from(zipSync(out, { level: 9 })), files: Object.keys(out).length, skipped };
}
