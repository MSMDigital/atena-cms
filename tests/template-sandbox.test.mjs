// Il codice di un template è codice caricato da uno zip: gira in un processo isolato. Qui si prova con un template MALEVOLO
// che cerca di leggere il database, scrivere file, lanciare comandi, vedere le variabili d'ambiente, bloccare il server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplateFrom, requireTemplate } from '../lib/template.mjs';
import { renderPages, stopRenderers, RenderError } from '../render/host.mjs';
import { loadData } from '../render/context.mjs';
import { htmlAttrs } from '../render/tokens.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TPL = path.join(ROOT, 'templates/starter');
test.after(() => stopRenderers());

const DATA = () => ({
  site: { siteUrl: 'https://x.example', locales: { default: 'it', enabled: ['it'], tags: { it: 'it-CH' } }, strings: {}, seo: {}, consent: { provider: 'builtin' } },
  shared: {}, tokens: {}, meta: null,
  pages: [{ key: 'home', status: 'published', slug: { it: '' }, name: { it: 'Home' }, title: { it: 'Home' }, description: { it: 'x' }, blocks: [] }],
});

// Un template minimo con l'HTML scritto da `body` (codice del file render/index.mjs).
function makeTemplate(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-tpl-'));
  fs.mkdirSync(path.join(dir, 'render')); fs.mkdirSync(path.join(dir, 'schema'));
  fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify({ id: 'prova', name: 'Prova', version: '1.0.0', engine: 1 }));
  fs.writeFileSync(path.join(dir, 'schema/blocks.json'), JSON.stringify({ blocks: [] }));
  fs.writeFileSync(path.join(dir, 'render/index.mjs'), body);
  return loadTemplateFrom(dir);
}
const run = async (tpl, opts) => (await renderPages(tpl, { data: DATA(), jobs: [{ locale: 'it', keys: ['home'] }], images: {} }, opts))[0].html;

test('template onesto: viene reso nel processo isolato con lo stesso risultato che nel processo principale', async () => {
  const tpl = requireTemplate();
  const data = loadData(tpl.dir);
  data.meta = { fontsCss: 'css/fonts.css', preload: [], htmlAttrs: htmlAttrs(data.tokens) };   // come fa la pubblicazione: starter non ha un tokens.meta.json già pronto
  const job = [{ locale: 'it', keys: ['privacy', 'contatti', 'home'] }];
  const sandbox = await renderPages(tpl, { data, jobs: job, images: {} });
  process.env.CMS_RENDER = 'inline';
  let inline;
  try { inline = await renderPages(tpl, { data, jobs: job, images: {} }); } finally { delete process.env.CMS_RENDER; }
  assert.equal(sandbox.length, 3);
  for (let i = 0; i < 3; i++) { assert.equal(sandbox[i].key, inline[i].key); assert.equal(sandbox[i].html, inline[i].html, sandbox[i].key); }
});

test('template malevolo: nessuna lettura, scrittura, comando o segreto', async () => {
  const secret = path.join(ROOT, '.env');
  const marker = path.join(os.tmpdir(), `cms-pwned-${process.pid}.txt`);
  const tpl = makeTemplate(`
    import fs from 'node:fs';
    const attempts = {};
    const attempt = async (name, fn) => { try { const r = await fn(); attempts[name] = 'RIUSCITO:' + String(r).slice(0, 40); } catch (e) { attempts[name] = e.code ?? e.name; } };
    export default { async renderPage() { return ''; } };
    export const probe = null;
    const result = {};
    await attempt('leggeEnvDelProgetto', () => fs.readFileSync(${JSON.stringify(secret)}, 'utf8'));
    await attempt('leggeEtcHosts', () => fs.readFileSync('/etc/hosts', 'utf8'));
    await attempt('leggeCartellaDelMotore', () => fs.readdirSync(${JSON.stringify(path.join(ROOT, 'lib'))}));
    await attempt('scriveFile', () => fs.writeFileSync(${JSON.stringify(marker)}, 'x'));
    await attempt('scriveNellaPropriaCartella', () => fs.writeFileSync(new URL('./scritto.txt', import.meta.url), 'x'));
    await attempt('importaIlDatabase', () => import(${JSON.stringify('file://' + path.join(ROOT, 'lib/db.mjs'))}));
    await attempt('comando', async () => (await import('node:child_process')).execSync('id'));
    await attempt('processoFiglio', async () => (await import('node:child_process')).spawn('id'));
    await attempt('worker', async () => new (await import('node:worker_threads')).Worker('1', { eval: true }));
    await attempt('binding', () => process.binding('fs'));
    await attempt('addon', () => process.dlopen({ exports: {} }, '/nonexistent.node'));
    attempts.variabiliAmbiente = Object.keys(process.env).join(',') || 'nessuna';
    globalThis.__attempts = attempts;
    export const attemptsOut = attempts;
  `);
  // il template deve restituire il risultato nel HTML: riscrive index.mjs con renderPage che lo legge
  const src = fs.readFileSync(tpl.renderEntry, 'utf8').replace("export default { async renderPage() { return ''; } };", "export default { renderPage() { return '<pre>' + JSON.stringify(globalThis.__attempts) + '</pre>'; } };");
  fs.writeFileSync(tpl.renderEntry, src);
  const html = await run(tpl);
  const attempts = JSON.parse(html.match(/<pre>(.*)<\/pre>/)[1]);
  for (const k of ['leggeEnvDelProgetto', 'leggeEtcHosts', 'leggeCartellaDelMotore', 'scriveFile', 'scriveNellaPropriaCartella', 'importaIlDatabase', 'comando', 'processoFiglio', 'worker', 'binding']) {
    assert.match(attempts[k], /ERR_ACCESS_DENIED|ERR_MODULE_NOT_FOUND|ERR_/, `${k}: ${attempts[k]}`);
    assert.doesNotMatch(attempts[k], /RIUSCITO/, k);
  }
  // (macOS aggiunge da sé __CF_USER_TEXT_ENCODING a ogni processo: non viene da noi)
  assert.doesNotMatch(attempts.variabiliAmbiente.replace('__CF_USER_TEXT_ENCODING', ''), /DB_|SETTINGS|SECRET|PASSWORD|SMTP|APP_ORIGIN|HOME|PATH|USER/, `variabili viste dal template: ${attempts.variabiliAmbiente}`);
  assert.equal(fs.existsSync(marker), false, 'nessun file scritto');
  assert.equal(fs.existsSync(path.join(tpl.dir, 'scritto.txt')), false);
});

test('template che si blocca o va in errore: il server resta in piedi e il processo riparte', async () => {
  const loop = makeTemplate("export default { renderPage() { for (;;) {} } };");
  await assert.rejects(run(loop, { timeoutMs: 1500 }), (e) => e instanceof RenderError && /troppo tempo/.test(e.message));
  const boom = makeTemplate("export default { renderPage() { throw new Error('esplode <b>qui</b>'); } };");
  await assert.rejects(run(boom), (e) => e instanceof RenderError && /esplode/.test(e.message));
  const notString = makeTemplate("export default { renderPage() { return { non: 'una stringa' }; } };");
  await assert.rejects(run(notString), /stringa/);
  const bad = makeTemplate("export default { nonRenderPage() {} };");
  await assert.rejects(run(bad), /renderPage/);
  const crash = makeTemplate("export default { renderPage() { process.exit(3); } };");
  await assert.rejects(run(crash), RenderError);
  const ok = makeTemplate("export default { renderPage(ctx, page) { return '<p>' + page.key + '</p>'; } };");
  assert.equal(await run(ok), '<p>home</p>', 'dopo gli errori un template sano funziona');
});

test('un template modificato viene ricaricato (il processo isolato riparte)', async () => {
  const tpl = makeTemplate("export default { renderPage() { return 'uno'; } };");
  assert.equal(await run(tpl), 'uno');
  await new Promise((r) => setTimeout(r, 30));
  fs.writeFileSync(tpl.renderEntry, "export default { renderPage() { return 'due'; } };");
  assert.equal(await run(tpl), 'due');
});

test('il template riceve solo dati del sito: niente funzioni, niente accesso al motore', async () => {
  const tpl = makeTemplate("export default { renderPage(ctx) { return JSON.stringify({ t: typeof ctx.t, sanitize: typeof ctx.richStr, size: ctx.imageSize('a.jpg'), keys: Object.keys(ctx).sort().slice(0, 4) }); } };");
  const out = JSON.parse(await (async () => (await renderPages(tpl, { data: DATA(), jobs: [{ locale: 'it', keys: ['home'] }], images: { 'a.jpg': { width: 10, height: 20 } } }))[0].html)());
  assert.deepEqual([out.t, out.sanitize, out.size], ['function', 'function', { width: 10, height: 20 }]);
});

// ---- correzioni dalla revisione di sicurezza sul processo isolato ---------------------------------------------------------------

test('un template non può far aprire il debugger del server con SIGUSR1', async () => {
  const tpl = makeTemplate("export default { renderPage() { try { process.kill(process.ppid, 'SIGUSR1'); } catch (e) { return 'errore:' + e.code; } return 'segnale inviato'; } };");
  const html = await run(tpl);
  assert.equal(html, 'segnale inviato', 'il segnale parte (il modello di permessi non lo impedisce)...');
  await new Promise((r) => setTimeout(r, 400));
  await assert.rejects(fetch('http://127.0.0.1:9229/json/list', { signal: AbortSignal.timeout(1500) }), 'il debugger non deve essersi aperto sulla porta 9229');
});

test('avvolgente di sistema (CMS_RENDER_WRAPPER): il processo isolato parte attraverso il comando indicato', async () => {
  process.env.CMS_RENDER_WRAPPER = JSON.stringify(['env']);   // "env node ..." non isola nulla: prova solo che il meccanismo funziona
  try {
    const tpl = makeTemplate("export default { renderPage() { return 'avvolto'; } };");
    assert.equal(await run(tpl), 'avvolto');
    process.env.CMS_RENDER_WRAPPER = 'non json';
    await assert.rejects(run(makeTemplate("export default { renderPage() { return 'x'; } };")), /CMS_RENDER_WRAPPER/);
  } finally { delete process.env.CMS_RENDER_WRAPPER; }
});

test('due richieste insieme su un template appena avviato funzionano entrambe (nessuna corsa con la preparazione)', async () => {
  const tpl = makeTemplate("export default { renderPage(ctx, page) { return '<p>' + page.key + '</p>'; } };");
  const [a, b, c] = await Promise.all([run(tpl), run(tpl), run(tpl)]);
  assert.deepEqual([a, b, c], ['<p>home</p>', '<p>home</p>', '<p>home</p>']);
});

test('HTML enorme: rifiutato dal figlio con un errore, senza bloccare nulla', async () => {
  const tpl = makeTemplate("export default { renderPage() { return 'x'.repeat(9_000_000); } };");
  await assert.rejects(run(tpl), /troppo grande/);
  assert.equal(await run(makeTemplate("export default { renderPage() { return 'ok'; } };")), 'ok');
});

test('il processo isolato usa il flag di permessi giusto per questa versione di Node', () => {
  const flag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  assert.ok(process.allowedNodeEnvironmentFlags.has(flag), flag);
});
