// Installazione dei template da zip: pacchetti buoni, cattivi, malevoli.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, strToU8 } from 'fflate';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
// Cartelle di prova, separate da quelle vere.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-inst-'));
process.env.TEMPLATES_DIR = path.join(SANDBOX, 'templates');
process.env.DATA_DIR = path.join(SANDBOX, 'data');
delete process.env.CMS_TEMPLATE_DIR;          // qui il template attivo è quello di prova, non quello di starter

const I = await import('../lib/template-install.mjs');
const T = await import('../lib/template.mjs');
const { stopRenderers } = await import('../render/host.mjs');
test.after(() => { stopRenderers(); fs.rmSync(SANDBOX, { recursive: true, force: true }); process.env.CMS_TEMPLATE_DIR = path.join(ROOT, 'templates/starter'); });

// Pacchetto di riferimento: quello vero di starter, come mappa percorso → contenuto.
const STARTER = path.join(ROOT, 'templates/starter');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(STARTER, 'template.json'), 'utf8'));
const ID = MANIFEST.id;
const VERSION = MANIFEST.version;
const NEWER = '99.1.0';   // sempre più recente di qualunque versione di starter
const BASE = (() => { const { zip } = I.packTemplate(STARTER); return Object.fromEntries(Object.entries(unzipSync(zip))); })();
const clone = () => ({ ...BASE });
const zip = (files) => Buffer.from(zipSync(files, { level: 1 }));
const json = (o) => strToU8(JSON.stringify(o));
const patchJson = (files, name, fn) => { const o = JSON.parse(Buffer.from(files[name]).toString('utf8')); fn(o); return { ...files, [name]: json(o) }; };
const installed = () => (fs.existsSync(T.templatesDir()) ? fs.readdirSync(T.templatesDir()).filter((n) => !n.startsWith('.') && n !== 'node_modules') : []);
const leftovers = () => { const s = path.join(T.templatesDir(), '.staging'); return fs.existsSync(s) ? fs.readdirSync(s) : []; };

async function rejects(files, re, msg) {
  const r = await I.installTemplateZip(Buffer.isBuffer(files) ? files : zip(files));
  assert.equal(r.ok, false, `${msg}: doveva essere rifiutato`);
  assert.match(`${r.error} ${(r.details ?? []).join(' ')}`, re, `${msg}: ${r.error} ${(r.details ?? []).join(' | ')}`);
  assert.deepEqual(installed(), installed().filter((n) => n === ID), `${msg}: non deve installare nulla di nuovo`);
  assert.deepEqual(leftovers(), [], `${msg}: la cartella di prova va ripulita`);
  return r;
}

test('un pacchetto buono si installa: controllo completo e prova di esecuzione nel processo isolato', async () => {
  const r = await I.installTemplateZip(zip(BASE));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.manifest.id, r.manifest.version, r.smoke.pages >= 6], [ID, VERSION, true]);
  assert.deepEqual(installed(), [ID]);
  const [t] = T.listTemplates();
  assert.deepEqual([t.id, t.name, t.active, t.broken], [ID, MANIFEST.name, false, undefined]);
  const loaded = T.loadTemplateFrom(path.join(T.templatesDir(), ID));
  assert.equal(loaded.schema.blocks.blocks.length, JSON.parse(Buffer.from(BASE['schema/blocks.json']).toString('utf8')).blocks.length);
  for (const f of ['tools', '.DS_Store']) assert.equal(fs.existsSync(path.join(T.templatesDir(), ID, f)), false, `${f} non entra nel pacchetto`);
});

test('versioni: la stessa o una precedente si rifiuta; una nuova sostituisce e la vecchia va nel cestino', async () => {
  await rejects(zip(BASE), /già installato/, 'stessa versione');
  const older = patchJson(clone(), 'template.json', (m) => { m.version = '0.9.0'; });
  await rejects(zip(older), /già installato/, 'versione precedente');
  const newer = patchJson(clone(), 'template.json', (m) => { m.version = NEWER; });
  const r = await I.installTemplateZip(zip(newer));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.upgradedFrom, VERSION);
  assert.equal(T.readManifest(path.join(T.templatesDir(), ID)).version, NEWER);
  assert.ok(fs.readdirSync(path.join(T.templatesDir(), '.trash')).some((n) => n.startsWith(`${ID}-${VERSION}-`)), 'la vecchia versione è nel cestino');
  assert.equal((await I.installTemplateZip(zip(newer), { allowSameVersion: true })).ok, true, 'reinstallazione voluta');
});

test('percorsi ostili: ../, assoluti, con backslash, file nascosti, node_modules', async () => {
  for (const bad of ['../evil.txt', '../../etc/passwd', '/etc/cron.d/x', 'assets/../../evil.css', 'assets\\..\\..\\evil.css', 'C:/Windows/x.css', 'assets/.htaccess', '.env', 'node_modules/x/index.mjs', 'assets/a' + String.fromCharCode(0) + 'b.css']) {
    await rejects({ ...clone(), [bad]: strToU8('x') }, /non ammess|non può stare/, bad);
  }
  assert.equal(fs.existsSync(path.join(SANDBOX, 'evil.txt')), false);
  assert.equal(fs.existsSync(path.join(path.dirname(SANDBOX), 'evil.txt')), false);
});

test('tipi di file: niente eseguibili, script o codice fuori dalle cartelle giuste', async () => {
  for (const bad of ['assets/run.sh', 'assets/tool.exe', 'assets/x.php', 'assets/x.html', 'assets/lib.so', 'assets/x.node', 'render/extra.js', 'render/x.exe', 'schema/x.mjs', 'content/x.html', 'content/pages/x.js', 'x.txt', 'lib/db.mjs', 'app/page.js']) {
    await rejects({ ...clone(), [bad]: strToU8('x') }, /non può stare|non ammess/, bad);
  }
});

test('zip guasti o pericolosi: vuoto, non zip, troppi file, bomba di compressione', async () => {
  await rejects(Buffer.alloc(0), /vuoto/, 'vuoto');
  await rejects(Buffer.from('non sono uno zip, solo testo abbastanza lungo'), /zip/, 'testo');
  await rejects(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(200, 7)]), /leggibile|danneggiato/, 'zip rotto');
  const many = clone(); for (let i = 0; i < 3100; i++) many[`assets/img/f${i}.txt`] = strToU8('x');
  await rejects(many, /Troppi file/, 'troppi file');
  const bomb = { ...clone(), 'assets/img/bomba.txt': new Uint8Array(30 * 1024 * 1024) };   // 30 MB di zeri: si comprime in pochi KB
  await rejects(zip(bomb), /sospetto|troppo grande/, 'bomba');
});

test('un solo cartella in cima allo zip (come fanno alcuni programmi) è accettata', async () => {
  // reinstallazione con cartella-avvolgente su una copia con un altro id
  const files = patchJson(clone(), 'template.json', (m) => { m.id = 'avvolto'; m.version = '2.0.0'; });
  const wrapped = Object.fromEntries(Object.entries(files).map(([k, v]) => [`avvolto/${k}`, v]));
  const r = await I.installTemplateZip(zip(wrapped));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(installed().includes('avvolto'));
  I.removeTemplate('avvolto');
  assert.equal(installed().includes('avvolto'), false);
});

test('pacchetti incompleti o incoerenti', async () => {
  const without = (name) => { const f = clone(); delete f[name]; return f; };
  for (const name of ['template.json', 'tokens.json', 'schema/blocks.json', 'render/index.mjs', 'content/site.json', 'content/shared.json']) await rejects(without(name), /manca|template\.json|non è valido/i, `senza ${name}`);
  await rejects(patchJson(clone(), 'template.json', (m) => { m.engine = 2; }), /engine/, 'engine 2');
  await rejects(patchJson(clone(), 'template.json', (m) => { m.id = '../x'; }), /"id"/, 'id ostile');
  await rejects(patchJson(clone(), 'template.json', (m) => { m.version = 'uno'; }), /version/, 'versione');
  await rejects({ ...clone(), 'template.json': strToU8('{non json') }, /JSON/, 'manifest rotto');
  await rejects(patchJson(clone(), 'tokens.json', (t) => { t.colors.brand = 'javascript:alert(1)'; }), /tokens\.json/, 'token non validi');
  await rejects(patchJson(clone(), 'schema/blocks.json', (b) => { b.blocks[0].properties.type.const = 'altro'; }), /type\.const/, 'blocco incoerente');
  await rejects(patchJson(clone(), 'schema/blocks.json', (b) => { b.blocks[0].$id = 'https://x/y.json'; }), /\$id/, 'id del blocco');
  await rejects(patchJson(clone(), 'schema/blocks.json', (b) => { b.blocks[1].properties.title = { type: 'string', pattern: '(' }; }), /schemi non sono validi|pattern non valido/, 'schema che non compila');
  await rejects(patchJson(clone(), 'content/pages/home.json', (p) => { p.blocks[0].type = 'inesistente'; }), /contenuti di esempio/, 'contenuto che non valida');
});

test('codice del template: importazioni, eval e process si rifiutano; un errore nell\'esecuzione blocca l\'installazione', async () => {
  const withRender = (code) => ({ ...clone(), 'render/index.mjs': strToU8(code) });
  await rejects(withRender("import fs from 'node:fs';\nexport default { renderPage() { return ''; } };"), /importa "node:fs"/, 'node:fs');
  await rejects(withRender("import x from 'left-pad';\nexport default { renderPage() { return ''; } };"), /importa "left-pad"/, 'pacchetto');
  await rejects(withRender("import x from '../../lib/db.mjs';\nexport default { renderPage() { return ''; } };"), /fuori dalla cartella render/, 'fuori da render');
  await rejects(withRender("const n = 'fs'; const m = await import('node:' + n);\nexport default { renderPage() { return ''; } };"), /importa "node:"|import\(\)/, 'import calcolato');
  await rejects(withRender("export default { renderPage() { return eval('1'); } };"), /eval/, 'eval');
  await rejects(withRender("export default { renderPage() { return String(process.env.DB_PASSWORD); } };"), /process/, 'process');
  await rejects(withRender("export default { renderPage() { throw new Error('rotto di proposito'); } };"), /prova di esecuzione: .*rotto di proposito/, 'errore a runtime');
  await rejects(withRender("export default { renderPage() { for (;;) {} } };"), /prova di esecuzione: .*troppo tempo/, 'ciclo infinito');
});

test('pacchetto creato con packTemplate: senza strumenti di sviluppo e a prova di rilettura', () => {
  // starter non ha strumenti di sviluppo: se ne aggiungono a una copia, per vedere che restano fuori
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-pack-'));
  fs.cpSync(STARTER, copy, { recursive: true });
  fs.mkdirSync(path.join(copy, 'tools')); fs.writeFileSync(path.join(copy, 'tools/shots.mjs'), 'export {};');
  fs.writeFileSync(path.join(copy, '.DS_Store'), 'x');
  const { zip: z, skipped } = I.packTemplate(copy);
  fs.rmSync(copy, { recursive: true, force: true });
  assert.ok(skipped.some((s) => s.startsWith('tools/')), 'tools/ non entra');
  assert.ok(skipped.some((s) => s.endsWith('.DS_Store')), 'i file nascosti non entrano');
  const names = Object.keys(unzipSync(z));
  assert.ok(names.includes('template.json') && names.includes('render/index.mjs') && names.includes('content/pages/home.json'));
  assert.ok(names.every((n) => I.safeEntry(n) && I.allowedPath(n)), 'tutto ciò che è nel pacchetto è ammesso');
});

test('il template attivo non si toglie; uno inesistente o con id ostile nemmeno', () => {
  T.setActiveTemplate(ID);
  assert.throws(() => I.removeTemplate(ID), /attivo/);
  assert.throws(() => I.removeTemplate(`../${ID}`), /non valido/);
  assert.throws(() => I.removeTemplate('non-esiste'), /non trovato/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(T.dataDir(), 'active-template.json'), 'utf8')).id, ID);
  assert.throws(() => T.setActiveTemplate('../../etc'), /non valido/);
  assert.throws(() => T.setActiveTemplate('mai-installato'), /template\.json/);
});

test('schemi con espressioni regolari rischiose: rifiutati prima di essere eseguiti', async () => {
  for (const [p, why] of [['(a+)+$', 'annidati'], ['^(\\w+\\s?)*$', 'annidati'], ['(a|a)+$', 'ripetute'], ['x'.repeat(700), 'lungo'], ['(', 'non valido'], ['^(.*a){20}.*$', 'ripetuto']]) {
    assert.equal(!!I.riskyPattern(p), why !== null, `${JSON.stringify(p.slice(0, 20))}: ${I.riskyPattern(p)}`);
  }
  for (const ok of ['^[a-z0-9-]*$', '^https?:\\/\\/[^\\s"<>]+$', '^(?:page:[a-z0-9-]+|channel:[a-z]+)$', '^\\+[0-9]{8,15}$']) assert.equal(I.riskyPattern(ok), null, ok);
  await rejects(patchJson(clone(), 'schema/blocks.json', (b) => { b.blocks[1].properties.title = { type: 'string', pattern: '(a+)+$' }; }), /quantificatori annidati/, 'pattern catastrofico');
  await rejects(patchJson(clone(), 'schema/site.json', (b) => { b.properties.brand.properties.name = { type: 'string', patternProperties: { '(x*)*y': { type: 'string' } } }; }), /patternProperties/, 'patternProperties');
});

test('espressioni regolari: le aggiramenti trovati nella revisione (alternative, gruppi annidati) ora si rifiutano', () => {
  for (const bad of ['(a|aa)+$', '^(([a-z])+.)+[A-Z]([a-z])+$', '(.*a){20}', '^(a?){30}a{30}$', '(a*)*', '(x+x+)+y', '(\\d+|a)*', '(?<=a)b', '(a)\\1']) assert.ok(I.riskyPattern(bad), bad);
  for (const ok of ['^[a-z0-9-]*$', '^https?:\\/\\/[^\\s"<>]+$', '^(?:page:[a-z0-9-]+|channel:[a-z]+)$', '^\\+[0-9]{8,15}$', '^(?!.*\\.\\.)(?!.*//)(?:[a-zA-Z0-9][a-zA-Z0-9_./-]*)?$', '^([a-z]+-)?[a-z]+$', '^(\\+41|0)[0-9 ]{9,12}$']) assert.equal(I.riskyPattern(ok), null, ok);
  // il tempo: un pattern accettato non deve essere lento su un input ostile
  const t0 = Date.now(); new RegExp('^(?:page:[a-z0-9-]+|channel:[a-z]+)$', 'u').test('page:' + 'a'.repeat(50) + '!'); assert.ok(Date.now() - t0 < 100);
});

test('il template non può ridefinire i campi del motore, e i JSON grandi si rifiutano', async () => {
  await rejects(patchJson(clone(), 'schema/site.json', (s) => { s.properties.siteUrl = { type: 'string' }; }), /"siteUrl" è un campo del motore/, 'siteUrl');
  await rejects(patchJson(clone(), 'schema/site.json', (s) => { s.properties.consent = { type: 'string' }; }), /"consent" è un campo del motore/, 'consent');
  await rejects(patchJson(clone(), 'schema/site.json', (s) => { s.properties.geo = { type: 'string' }; }), /"geo" è un campo del motore/, 'geo');
  await rejects(patchJson(clone(), 'schema/site.json', (s) => { s.properties.tracking = { type: 'string' }; }), /"tracking" è un campo del motore/, 'tracking');
  await rejects(patchJson(clone(), 'schema/page.json', (s) => { (s.properties ??= {}).slug = { type: 'string' }; }), /"slug" è un campo del motore/, 'slug');
  await rejects(patchJson(clone(), 'schema/page.json', (s) => { (s.properties ??= {}).noai = { type: 'string' }; }), /"noai" è un campo del motore/, 'noai');
  await rejects({ ...clone(), 'content/pages/enorme.json': strToU8('{"k":"' + 'x'.repeat(2_100_000) + '"}') }, /troppo grande|rapporto di compressione/, 'JSON da 2 MB');
});

test('il template non può definire un blocco con un tipo del motore ("shared", "html")', async () => {
  const rename = (type) => patchJson(clone(), 'schema/blocks.json', (b) => { b.blocks[0].$id = b.blocks[0].$id.replace(/blocks\/[a-z0-9-]+\.json$/, `blocks/${type}.json`); b.blocks[0].properties.type.const = type; });
  await rejects(rename('html'), /"html" è un tipo di blocco del motore/, 'tipo "html"');
  await rejects(rename('shared'), /"shared" è un tipo di blocco del motore/, 'tipo "shared"');
});

test('ui.json del template: solo stringhe semplici, niente chiavi da prototipo', () => {
  const ui = T.cleanUi({ blockHints: { hero: 'ok', __proto__: 'x', constructor: 'y', lungo: 'x'.repeat(500), num: 5 }, enumLabels: 'non un oggetto', keyLabels: { a: 'b' } });
  assert.deepEqual(Object.keys(ui.blockHints), ['hero']);
  assert.deepEqual([Object.keys(ui.enumLabels).length, ui.keyLabels.a], [0, 'b']);
  assert.equal(Object.getPrototypeOf(ui.blockHints), null);
});

test('un controllo prima dell\'installazione può rifiutare (es. contenuti incompatibili con il template attivo)', async () => {
  const newer = patchJson(clone(), 'template.json', (m) => { m.version = '99.2.0'; });
  const r = await I.installTemplateZip(zip(newer), { precheck: async () => ({ error: 'I contenuti attuali non sono compatibili.', details: ['x'] }) });
  assert.deepEqual([r.ok, r.error, r.details], [false, 'I contenuti attuali non sono compatibili.', ['x']]);
  assert.equal(T.readManifest(path.join(T.templatesDir(), ID)).version, NEWER, 'la versione installata non è cambiata');
  assert.deepEqual(leftovers(), []);
});

test('cestino: si tengono le ultime 5 copie di QUESTO template, senza confonderlo con uno che ne condivide il prefisso', async () => {
  const trash = path.join(T.templatesDir(), '.trash'); fs.mkdirSync(trash, { recursive: true });
  const now = Date.now();
  for (let i = 0; i < 4; i++) fs.mkdirSync(path.join(trash, `${ID}-0.${i}.0-${now - 100000 + i}`));
  for (let i = 0; i < 3; i++) fs.mkdirSync(path.join(trash, `${ID}-bis-1.0.${i}-${now - 900000 + i}`));   // altro template: non si tocca
  const v = ['100.0.0', '100.1.0', '100.2.0'];
  for (const ver of v) assert.equal((await I.installTemplateZip(zip(patchJson(clone(), 'template.json', (m) => { m.version = ver; })))).ok, true);
  const left = fs.readdirSync(trash);
  assert.equal(left.filter((n) => n.startsWith(`${ID}-`) && /^\d/.test(n.slice(ID.length + 1))).length, 5, left.join(','));
  assert.equal(left.filter((n) => n.startsWith(`${ID}-bis-`)).length, 3, 'le copie dell\'altro template restano');
});

test('caricamento da zip: si spegne con ALLOW_TEMPLATE_UPLOAD=0', () => {
  delete process.env.ALLOW_TEMPLATE_UPLOAD;
  assert.equal(T.uploadEnabled(), true);
  process.env.ALLOW_TEMPLATE_UPLOAD = '0';
  try { assert.equal(T.uploadEnabled(), false); } finally { delete process.env.ALLOW_TEMPLATE_UPLOAD; }
});
