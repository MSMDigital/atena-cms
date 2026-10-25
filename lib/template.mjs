// Template del sito: un pacchetto (cartella o zip) che porta design, blocchi, HTML e contenuti di partenza. Il CMS è il motore:
// admin, database, login, immagini, moduli, pubblicazione. Un template si installa a parte (vedi lib/template-install.mjs).
//
// Pacchetto:
//   template.json     { id, name, version, engine: 1, description?, author? }
//   tokens.json       stile di partenza (colori, testi, pulsanti...)
//   schema/blocks.json  i blocchi (uno schema JSON ciascuno); schema/site.json e schema/page.json aggiungono campi ai dati del sito e alle pagine
//   schema/header.json, schema/footer.json  facoltativi: i campi di UN header / UN footer; con questi il sito può averne più d'uno (Admin → Header, Footer)
//                     e ogni pagina sceglie quale usare (campi header e footer della pagina); contenuti di esempio in content/headers.json e footers.json
//   ui.json           testi dell'editor (descrizione dei blocchi, etichette dei campi)
//   render/index.mjs  l'HTML: export default { renderPage(ctx, page) }; gira in un processo isolato (render/host.mjs)
//   assets/           file pubblici (css, js, font, immagini) → /assets/ nel sito
//   content/          contenuti di esempio: site.json, shared.json, pages/*.json
// Il template attivo sta in data/active-template.json (o CMS_TEMPLATE / CMS_TEMPLATE_DIR, per le prove e gli script).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv } from './env.mjs';

export const TEMPLATE_API = 1;                 // versione del formato dei pacchetti che questo motore sa leggere
export const TEMPLATE_ID = /^[a-z][a-z0-9-]{1,40}$/;
export const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

// Il caricamento di template da zip (Admin → Template e installazione guidata) si spegne con ALLOW_TEMPLATE_UPLOAD=0: i template restano
// installabili copiando la cartella in templates/ (e da riga di comando). Consigliato in produzione se i template li mettete voi.
export const uploadEnabled = () => { loadEnv(); return process.env.ALLOW_TEMPLATE_UPLOAD !== '0'; };

// ui.json viene dal template: si tengono solo oggetti semplici di stringhe (niente chiavi da prototipo, dimensioni limitate).
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function stringMap(o, max = 400) {
  const out = Object.create(null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o).slice(0, max)) if (!BAD_KEYS.has(k) && k.length <= 80 && typeof v === 'string' && v.length <= 400) out[k] = v;
  return out;
}
export const cleanUi = (u) => ({
  blockHints: stringMap(u?.blockHints), siteSections: stringMap(u?.siteSections), enumLabels: stringMap(u?.enumLabels), keyLabels: stringMap(u?.keyLabels),
  compactItems: [],
});

export const dataDir = () => { loadEnv(); return path.resolve(process.env.DATA_DIR ?? path.join(ROOT, 'data')); };
export const templatesDir = () => { loadEnv(); return path.resolve(process.env.TEMPLATES_DIR ?? path.join(ROOT, 'templates')); };

const readJson = (file, what) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${what}: ${e.code === 'ENOENT' ? 'file mancante' : `JSON non valido (${e.message})`}`); }
};

// Legge e controlla template.json. Lancia un errore leggibile se qualcosa non va.
export function readManifest(dir) {
  const m = readJson(path.join(dir, 'template.json'), 'template.json');
  const bad = (msg) => { throw new Error(`template.json: ${msg}`); };
  if (!m || typeof m !== 'object' || Array.isArray(m)) bad('deve essere un oggetto');
  if (!TEMPLATE_ID.test(m.id ?? '')) bad('"id" deve essere minuscolo, con lettere, numeri e trattini (es. "starter")');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 100) bad('serve "name"');
  if (!SEMVER.test(m.version ?? '')) bad('"version" deve essere del tipo 1.0.0');
  if (m.engine !== TEMPLATE_API) bad(`"engine" deve essere ${TEMPLATE_API} (formato dei pacchetti di questo CMS); il template dichiara ${JSON.stringify(m.engine)}`);
  for (const k of ['description', 'author', 'license']) if (m[k] != null && (typeof m[k] !== 'string' || m[k].length > 500)) bad(`"${k}" non valido`);
  return { id: m.id, name: m.name.trim(), version: m.version, engine: m.engine, description: m.description ?? '', author: m.author ?? '', license: m.license ?? '' };
}

// Percorsi e schemi di un template installato in `dir`.
export function loadTemplateFrom(dir) {
  dir = path.resolve(dir);
  const manifest = readManifest(dir);
  const opt = (f) => (fs.existsSync(path.join(dir, f)) ? readJson(path.join(dir, f), f) : {});
  return {
    id: manifest.id, dir, manifest,
    tokensFile: path.join(dir, 'tokens.json'),
    assetsDir: path.join(dir, 'assets'),
    contentDir: path.join(dir, 'content'),
    renderEntry: path.join(dir, 'render/index.mjs'),
    schema: { blocks: readJson(path.join(dir, 'schema/blocks.json'), 'schema/blocks.json'), site: opt('schema/site.json'), page: opt('schema/page.json'), header: opt('schema/header.json'), footer: opt('schema/footer.json') },
    ui: cleanUi(opt('ui.json')),
  };
}

export function listTemplates() {
  const root = templatesDir();
  if (!fs.existsSync(root)) return [];
  const active = activeTemplateId();
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
    try { const m = readManifest(path.join(root, e.name)); out.push({ ...m, dir: path.join(root, e.name), active: m.id === active }); }
    catch (err) { out.push({ id: e.name, name: e.name, version: '?', broken: err.message, dir: path.join(root, e.name), active: false }); }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function activeTemplateId() {
  loadEnv();
  if (process.env.CMS_TEMPLATE_DIR) return path.basename(path.resolve(process.env.CMS_TEMPLATE_DIR));
  if (process.env.CMS_TEMPLATE) return process.env.CMS_TEMPLATE;
  try { const id = JSON.parse(fs.readFileSync(path.join(dataDir(), 'active-template.json'), 'utf8')).id; return TEMPLATE_ID.test(id) ? id : null; } catch { return null; }
}

export function setActiveTemplate(id) {
  if (!TEMPLATE_ID.test(id ?? '')) throw new Error('Template non valido');
  readManifest(path.join(templatesDir(), id));   // deve esistere ed essere valido
  fs.mkdirSync(dataDir(), { recursive: true });
  const file = path.join(dataDir(), 'active-template.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ id, at: new Date().toISOString() }, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  cache.clear();
}

const cache = new Map();   // dir → { mtime, tpl }
// Template attivo (con cache: si rilegge se template.json cambia). Restituisce null se non ce n'è uno.
export function activeTemplate() {
  loadEnv();
  const dir = process.env.CMS_TEMPLATE_DIR ? path.resolve(process.env.CMS_TEMPLATE_DIR) : (activeTemplateId() ? path.join(templatesDir(), activeTemplateId()) : null);
  if (!dir || !fs.existsSync(path.join(dir, 'template.json'))) return null;
  const stamp = ['template.json', 'schema/blocks.json', 'schema/site.json', 'schema/page.json', 'schema/header.json', 'schema/footer.json', 'ui.json'].map((f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { return 0; } }).join(':');
  const hit = cache.get(dir);
  if (hit?.stamp === stamp) return hit.tpl;
  const tpl = loadTemplateFrom(dir);
  cache.set(dir, { stamp, tpl });
  return tpl;
}

export function requireTemplate() {
  const tpl = activeTemplate();
  if (!tpl) throw new Error('Nessun template attivo: installa o attiva un template (Admin → Template, oppure la procedura di installazione).');
  return tpl;
}
