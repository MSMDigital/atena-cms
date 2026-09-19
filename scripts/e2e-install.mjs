// Prova end-to-end dell'installazione guidata e della gestione dei template, partendo da ZERO: un'istanza nuova dell'app (cartelle e database vuoti, nessun .env),
// la procedura /install nel browser (chiave, requisiti, database, admin, caricamento del template da zip), poi accesso e sito pubblicato.
// Non tocca il database né le cartelle di sviluppo: usa un database "outsmart_cms_e2e_install" (creato e poi eliminato con le credenziali
// root del .env di sviluppo) e una cartella temporanea. Serve l'app compilata (npx next build). Uso: node scripts/e2e-install.mjs
import puppeteer from 'puppeteer-core';
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadEnv, assertLocalDatabase } = await import('../lib/env.mjs'); loadEnv(); assertLocalDatabase('Questa prova');
const { packTemplate } = await import('../lib/template-install.mjs');
const { DB_HOST = '127.0.0.1', DB_PORT = '3307', DB_USER, DB_PASSWORD, DB_ROOT_PASSWORD } = process.env;
if (!DB_ROOT_PASSWORD || !DB_PASSWORD) { console.error('servono DB_PASSWORD e DB_ROOT_PASSWORD nel .env di sviluppo'); process.exit(1); }
const E2E_DB = 'outsmart_cms_e2e_install';
const PORT = 3100; const URL_ = `http://localhost:${PORT}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN = { name: 'Prima Persona', email: 'prima@esempio.test', password: 'una-password-molto-lunga-2026' };

const root = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: 'root', password: DB_ROOT_PASSWORD });
const resetDb = async () => { await root.query(`DROP DATABASE IF EXISTS \`${E2E_DB}\``); await root.query(`CREATE DATABASE \`${E2E_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await root.query(`GRANT ALL ON \`${E2E_DB}\`.* TO ?@'%'`, [DB_USER]); };
await resetDb();

// Istanza nuova: tutte le cartelle vuote e nessuna variabile ereditata dal .env di sviluppo (variabili definite ma vuote: Next non le riempie).
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-e2e-install-'));
const dirs = { data: path.join(T, 'data'), templates: path.join(T, 'templates'), out: path.join(T, 'dist'), media: path.join(T, 'media'), env: path.join(T, '.env') };
const zipFile = path.join(T, 'mammano.zip');
fs.writeFileSync(zipFile, packTemplate(path.join(ROOT, 'templates/mammano')).zip);
const blank = Object.fromEntries(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_ROOT_PASSWORD', 'SETTINGS_SECRET', 'IP_HASH_SECRET', 'APP_ORIGIN', 'TRUST_PROXY', 'INSTALL_TOKEN', 'CMS_TEMPLATE', 'CMS_TEMPLATE_DIR', 'SMTP_HOST', 'MAIL_FROM'].map((k) => [k, '']));
const server = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)], {
  cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...blank, DATA_DIR: dirs.data, TEMPLATES_DIR: dirs.templates, ENV_FILE: dirs.env, SITE_OUT_DIR: dirs.out, MEDIA_DIR: dirs.media, NODE_ENV: 'production', ADMIN_HOSTS: `localhost:${PORT}` },
});
let serverLog = ''; server.stdout.on('data', (d) => { serverLog += d; }); server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL_ + '/install')).status < 500) break; } catch { /* non ancora pronto */ } await pause(500); }

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1000 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
const { E2E_SHOTS } = process.env;
const shot = async (name) => { if (E2E_SHOTS) { fs.mkdirSync(E2E_SHOTS, { recursive: true }); await page.screenshot({ path: path.join(E2E_SHOTS, name + '.png') }); } };

let n = 0;
const cleanup = async () => { await browser.close().catch(() => {}); server.kill('SIGTERM'); await root.query(`DROP DATABASE IF EXISTS \`${E2E_DB}\``).catch(() => {}); await root.end().catch(() => {}); fs.rmSync(T, { recursive: true, force: true }); };
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${++n}. ${name}`); } catch (e) { console.error(`FAIL ${++n}. ${name}\n     ${e.message}`); await shot(`errore-install-${n}`); if (process.env.E2E_LOG) console.error(serverLog.slice(-1500)); await cleanup(); process.exit(1); } };
const waitFor = async (fn, msg, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await pause(150); } throw new Error(msg); };
const click = async (text) => {
  let b;
  for (let i = 0; i < 80; i++) { [b] = await page.$$(`xpath/.//button[normalize-space()="${text}"] | .//a[normalize-space()="${text}"]`); if (b && !(await b.evaluate((el) => el.disabled))) break; await pause(150); }
  assert.ok(b, `pulsante "${text}" non trovato`);
  await b.click();
};
const typeIn = async (labelStart, value) => {
  const [input] = await page.$$(`xpath/.//label[.//span[starts-with(normalize-space(), "${labelStart}")]]//input`);
  assert.ok(input, `campo "${labelStart}" non trovato`);
  await input.evaluate((el) => { el.value = ''; el.focus(); });
  await input.type(value);
};
const bodyText = () => page.$eval('.install', (e) => e.textContent);
const tokenOnDisk = () => fs.readFileSync(path.join(dirs.data, 'install-token'), 'utf8').trim();

await step('istanza nuova: la home e l\'accesso portano alla procedura di installazione', async () => {
  const r = await fetch(URL_ + '/', { redirect: 'manual' });
  assert.ok([307, 308].includes(r.status) && /\/install/.test(r.headers.get('location')), `/ → ${r.status} ${r.headers.get('location')}`);
  await page.goto(`${URL_}/admin/login`, { waitUntil: 'networkidle0' });
  assert.match(page.url(), /\/install$/);
  assert.match(await page.$eval('h1', (e) => e.textContent), /Installazione/);
  assert.ok(fs.existsSync(path.join(dirs.data, 'install-token')), 'la chiave è stata creata');
  assert.equal(fs.statSync(path.join(dirs.data, 'install-token')).mode & 0o777, 0o600);
  assert.match(serverLog, /Chiave di installazione/, 'la chiave è scritta anche nel log del server');
  assert.equal(fs.existsSync(dirs.env), false, 'nessun .env prima dell\'installazione');
  await shot('i1-chiave');
});

await step('chiave sbagliata: respinta con un messaggio; senza chiave le azioni non fanno nulla', async () => {
  await typeIn('Chiave', 'chiave-sbagliata');
  await click('Continua');
  await waitFor(async () => /non corretta/.test(await bodyText()), 'messaggio di chiave errata');
  const r = await fetch(URL_ + '/install/template-upload', { method: 'POST', body: 'x', headers: { Origin: URL_ } });
  assert.ok([403, 411, 400].includes(r.status), `upload senza chiave: ${r.status}`);
  assert.deepEqual(fs.existsSync(dirs.templates) ? fs.readdirSync(dirs.templates).filter((f) => !f.startsWith('.') && f !== 'node_modules') : [], []);
});

await step('chiave giusta: requisiti tutti a posto', async () => {
  await typeIn('Chiave', tokenOnDisk());
  await click('Continua');
  await page.waitForSelector('.install__reqs');
  assert.equal(await page.$$eval('.install__reqs li.bad', (l) => l.length), 0, 'nessun requisito mancante');
  assert.ok((await page.$$('.install__reqs li.ok')).length >= 7);
  await shot('i2-requisiti');
  await click('Continua');
});

await step('database: password sbagliata → messaggio chiaro, nessun .env scritto', async () => {
  await page.waitForFunction(() => /Database/.test(document.querySelector('.install h2')?.textContent ?? ''));
  await typeIn('Server', DB_HOST); await typeIn('Porta', String(DB_PORT)); await typeIn('Nome del database', E2E_DB); await typeIn('Utente', DB_USER);
  await typeIn('Password', 'password-sbagliata');
  await typeIn('Indirizzo con cui si apre l', URL_);
  await click('Prova e salva');
  await waitFor(async () => /utente o password non corretti/.test(await bodyText()), 'errore di connessione');
  assert.equal(fs.existsSync(dirs.env), false);
  assert.doesNotMatch(await bodyText(), new RegExp(DB_PASSWORD.slice(0, 8)));
});

await step('database: credenziali giuste → tabelle create, .env scritto (600) con chiavi generate', async () => {
  await typeIn('Password', DB_PASSWORD);
  await click('Prova e salva');
  await page.waitForFunction(() => /Primo admin/.test(document.querySelector('.install h2')?.textContent ?? ''), { timeout: 30000 });
  const stat = fs.statSync(dirs.env);
  assert.equal(stat.mode & 0o777, 0o600);
  const env = fs.readFileSync(dirs.env, 'utf8');
  for (const re of [new RegExp(`^DB_NAME=${E2E_DB}$`, 'm'), /^APP_ORIGIN=http:\/\/localhost:3100$/m, /^SETTINGS_SECRET=\S{30,}$/m, /^IP_HASH_SECRET=\S{30,}$/m, /^TRUST_PROXY=1$/m]) assert.match(env, re);
  const [[tables]] = await root.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [E2E_DB]);
  assert.ok(tables.n >= 10, `tabelle create: ${tables.n}`);
  await shot('i3-database');
});

await step('admin e template: password corta rifiutata; nessun template installato, si carica lo zip', async () => {
  await typeIn('Nome', ADMIN.name); await typeIn('Email', ADMIN.email);
  await typeIn('Password', 'corta'); await typeIn('Ripeti la password', 'corta');
  await click('Continua');
  await page.waitForFunction(() => /^Template/.test(document.querySelector('.install h2')?.textContent ?? ''));
  assert.match(await bodyText(), /Nessun template installato/);
  await typeIn('Indirizzo pubblico del sito', 'https://www.esempio.test');
  await page.$eval('.install__nav .btn--primary', (b) => b.click()).catch(() => {});
  await pause(200);
  // senza template scelto il pulsante Installa resta spento
  assert.equal(await page.$eval('.install__nav .btn--primary', (b) => b.disabled), true);
  const input = await page.$('.install__upload input[type=file]');
  await input.uploadFile(zipFile);
  await click('Carica');
  await waitFor(async () => /Installato: Mammano Traslochi 1\.0\.0/.test(await bodyText()), 'template installato dallo zip', 60000);
  assert.ok(fs.existsSync(path.join(dirs.templates, 'mammano/template.json')));
  assert.equal(await page.$$eval('.install__tpl.on', (l) => l.length), 1, 'il template caricato è selezionato');
  await shot('i4-template');
});

await step('installazione: la password corta viene respinta con il campo indicato, poi si completa', async () => {
  await click('Installa');
  await waitFor(async () => /almeno 12 caratteri/.test(await bodyText()) || /Primo admin/.test(await page.$eval('.install h2', (e) => e.textContent)), 'errore sulla password');
  assert.match(await page.$eval('.install h2', (e) => e.textContent), /Primo admin/, 'torna al passo dell\'admin');
  await typeIn('Password', ADMIN.password); await typeIn('Ripeti la password', ADMIN.password);
  await click('Continua');
  await page.waitForFunction(() => /^Template/.test(document.querySelector('.install h2')?.textContent ?? ''));
  await typeIn('Indirizzo pubblico del sito', 'https://www.esempio.test/percorso');
  await click('Installa');
  await waitFor(async () => /scrivi solo l'indirizzo/.test(await bodyText()), 'indirizzo con percorso rifiutato');
  await typeIn('Indirizzo pubblico del sito', 'https://www.esempio.test');
  await click('Installa');
  await page.waitForSelector('.install__done', { timeout: 120000 });
  assert.match(await bodyText(), /Installazione completata/);
  assert.match(await bodyText(), /già pubblicato/);
  await shot('i5-fatto');
});

await step('dopo l\'installazione: /install e il caricamento sono chiusi, il sito è pubblicato con l\'indirizzo scelto', async () => {
  assert.ok(fs.existsSync(path.join(dirs.data, 'installed.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dirs.data, 'active-template.json'), 'utf8')).id, 'mammano');
  const r = await fetch(URL_ + '/install', { redirect: 'manual' });
  assert.ok([307, 308].includes(r.status) && /\/admin\/login/.test(r.headers.get('location')), `/install → ${r.status} ${r.headers.get('location')}`);
  const up = await fetch(URL_ + '/install/template-upload', { method: 'POST', body: 'x', headers: { Origin: URL_ } });
  assert.equal(up.status, 404);
  const html = fs.readFileSync(path.join(dirs.out, 'index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.esempio\.test\/">/);
  assert.ok(fs.existsSync(path.join(dirs.out, 'assets/cms/cms.js')) && fs.existsSync(path.join(dirs.out, 'servizi/index.html')));
  const [[u]] = await root.query(`SELECT COUNT(*) AS n, MIN(role) AS role, MIN(email) AS email FROM \`${E2E_DB}\`.users`);
  assert.deepEqual([u.n, u.role, u.email], [1, 'admin', ADMIN.email]);
  const [[d]] = await root.query(`SELECT COUNT(*) AS n FROM \`${E2E_DB}\`.docs`);
  assert.ok(d.n >= 15, `documenti: ${d.n}`);
});

await step('accesso con il primo admin: dashboard, template attivo, anteprima che funziona', async () => {
  await page.goto(`${URL_}/admin/login`, { waitUntil: 'networkidle0' });
  await page.type('input[name=email]', ADMIN.email); await page.type('input[name=password]', ADMIN.password);
  await click('Accedi');
  await page.waitForFunction(() => location.pathname === '/admin', { timeout: 30000 });
  assert.ok((await page.$$('.table tbody tr')).length >= 15);
  await page.goto(`${URL_}/admin/templates`, { waitUntil: 'networkidle0' });
  assert.match(await page.$eval('.tpl__item--on', (e) => e.textContent), /Mammano Traslochi[\s\S]*Attivo/);
  await page.goto(`${URL_}/admin/pages/home`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('li.item');
  await waitFor(async () => { const f = await (await page.$('iframe'))?.contentFrame(); return !!(f && await f.evaluate(() => !!document.querySelector('.header'))); }, 'anteprima non comparsa');
  await shot('i6-anteprima');
  // L'anteprima gira in un iframe senza "allow-same-origin": il JavaScript del template non tocca l'admin né i suoi cookie.
  const sb = await page.$eval('iframe', (f) => f.getAttribute('sandbox'));
  assert.ok(sb === 'allow-scripts', `sandbox dell'anteprima: ${sb}`);
  assert.equal(await page.evaluate(() => { try { return typeof document.querySelector('iframe').contentWindow.document; } catch (e) { return 'bloccato'; } }), 'bloccato', 'la pagina non deve poter leggere il documento dell\'anteprima');
  const pv = await page.evaluate(async () => { const r = await fetch('/admin/preview/', { credentials: 'same-origin' }); return r.headers.get('content-security-policy'); });
  assert.match(pv, /sandbox allow-scripts(;|$)/);
});

await step('ADMIN_HOSTS: da un altro indirizzo /admin e /install non esistono (404), i moduli del sito restano raggiungibili', async () => {
  const asHost = (host, p, method = 'GET') => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: { host } }, (r) => { r.resume(); res(r.statusCode); }); q.on('error', rej); q.end(); });
  for (const p of ['/admin', '/admin/login', '/admin/preview', '/install']) assert.equal(await asHost('www.esempio.test', p), 404, `${p} dal sito pubblico`);
  assert.notEqual(await asHost(`localhost:${PORT}`, '/admin/login'), 404);
  assert.notEqual(await asHost('www.esempio.test', '/api/forms/x', 'OPTIONS'), 404, 'l\'API dei moduli deve restare raggiungibile dal dominio pubblico');
});

// ---- parte 2: gestione dei template dall'admin (stessa istanza, appena installata) ----------------------------------------------
const starterZip = path.join(T, 'starter.zip');
fs.writeFileSync(starterZip, packTemplate(path.join(ROOT, 'templates/starter')).zip);
const { zipSync, unzipSync, strToU8 } = await import('fflate');
const evilZip = path.join(T, 'evil.zip');
fs.writeFileSync(evilZip, Buffer.from(zipSync({ ...Object.fromEntries(Object.entries(unzipSync(fs.readFileSync(starterZip)))), '../evil.txt': strToU8('x'), 'assets/run.sh': strToU8('#!/bin/sh') })));
const ask = async (fn) => { page.once('dialog', (d) => d.accept(ADMIN.password)); await fn(); };
const tplText = () => page.$eval('.tpl', (e) => e.textContent);
const uploadTemplate = async (file, password) => {
  await page.goto(`${URL_}/admin/templates`, { waitUntil: 'networkidle0' });
  await (await page.$('.tpl__form input[type=file]')).uploadFile(file);
  await page.$eval('.tpl__form input[name=password]', (el) => { el.value = ''; });
  await page.type('.tpl__form input[name=password]', password);
  await click('Installa');
};
const serveSite = async () => {
  const s = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs'), '4174'], { env: { ...process.env, SITE_OUT_DIR: dirs.out, FORMS_PROXY: URL_ }, stdio: 'ignore' });
  await pause(700);
  return s;
};

await step('template dall\'admin: password sbagliata e zip malevolo respinti, nulla di installato', async () => {
  await uploadTemplate(starterZip, 'password-sbagliata');
  await waitFor(async () => /Password non corretta/.test(await tplText()), 'password errata non segnalata');
  await uploadTemplate(evilZip, ADMIN.password);
  await waitFor(async () => /file non ammessi/.test(await tplText()), 'zip malevolo non respinto');
  const t = await tplText();
  assert.match(t, /percorso non ammesso/); assert.match(t, /assets\/run\.sh/);
  assert.equal(fs.existsSync(path.join(dirs.templates, 'starter')), false);
  assert.equal(fs.existsSync(path.join(T, 'evil.txt')), false);
  await shot('t1-respinto');
});

await step('template dall\'admin: lo zip buono si installa (con la prova di esecuzione) e compare in elenco', async () => {
  await uploadTemplate(starterZip, ADMIN.password);
  await waitFor(async () => /Installato: Starter 1\.0\.0/.test(await tplText()), 'starter non installato', 60000);
  assert.match(await tplText(), /Prova di esecuzione: \d+ pagine rese/);
  await page.goto(`${URL_}/admin/templates`, { waitUntil: 'networkidle0' });
  assert.equal((await page.$$('.tpl__item')).length, 2);
  assert.match(await page.$eval('.tpl__item--on', (e) => e.textContent), /Mammano/);
  assert.match(await page.$eval('.tpl__item[data-id=starter]', (e) => e.textContent), /Starter/);
  await shot('t2-installato');
});

await step('attivazione: i contenuti di Mammano non sono compatibili con Starter; si sostituiscono con quelli di esempio (con copia di sicurezza)', async () => {
  await click('Attiva…');                                             // il primo pulsante è quello di Starter (l'unico non attivo)
  await page.waitForSelector('.tpl__confirm fieldset');
  assert.match(await page.$eval('.tpl__confirm', (e) => e.textContent), /non compatibili: \d+ problemi/);
  assert.equal(await page.$eval('.tpl__confirm .btn--primary', (b) => b.disabled), true, 'con "tenere" e contenuti incompatibili non si può procedere');
  await page.click('.tpl__confirm input[type=radio]:nth-of-type(1)');
  const radios = await page.$$('.tpl__confirm input[type=radio]'); await radios[1].click();
  await page.type('.tpl__confirm input[type=password]', ADMIN.password);
  await click('Attiva e pubblica il sito');
  await waitFor(async () => /Template attivato: sito pubblicato/.test(await tplText()), 'attivazione non riuscita', 120000);
  assert.match(await tplText(), /Copia dei contenuti precedenti salvata/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dirs.data, 'active-template.json'), 'utf8')).id, 'starter');
  const backups = fs.readdirSync(path.join(dirs.data, 'backups'));
  assert.equal(backups.length, 1);
  assert.equal(fs.statSync(path.join(dirs.data, 'backups', backups[0])).mode & 0o777, 0o600);
  const html = fs.readFileSync(path.join(dirs.out, 'index.html'), 'utf8');
  assert.match(html, /class="site-header"/); assert.doesNotMatch(html, /Mammano/);
  const [[d]] = await root.query(`SELECT COUNT(*) AS n FROM \`${E2E_DB}\`.docs`);
  assert.equal(d.n, 6, 'tokens + site + shared + 3 pagine di Starter');
  await shot('t3-attivato');
});

await step('con Starter attivo l\'editor mostra i SUOI blocchi e i suoi testi', async () => {
  await page.goto(`${URL_}/admin/pages/home`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('li.item');
  const items = await page.$$eval('li.item .item__head', (e) => e.map((x) => x.textContent));
  assert.ok(items.some((t) => /Copertina/.test(t)) && items.some((t) => /Testo/.test(t)), items.join(' | '));
  await page.click('.blocks button.add, .blocks summary');
  const menu = await page.$eval('.blocks', (e) => e.textContent);
  assert.match(menu, /Copertina/); assert.match(menu, /Modulo di contatto/);
  assert.doesNotMatch(menu, /Nastro scorrevole|Testo \+ immagine|Domande frequenti/, 'i blocchi di Mammano non ci sono più');
  await waitFor(async () => { const f = await (await page.$('iframe'))?.contentFrame(); return !!(f && await f.evaluate(() => !!document.querySelector('.site-header'))); }, 'anteprima di Starter');
  await page.goto(`${URL_}/admin/site`, { waitUntil: 'networkidle0' });
  const sections = await page.$$eval('details.sec > summary', (e) => e.map((x) => x.textContent.trim()));
  assert.ok(sections.includes('Marchio') && sections.includes('Menu'), sections.join(','));
  assert.ok(!sections.includes('Azienda'), 'i campi di Mammano non ci sono');
  await shot('t4-editor-starter');
});

await step('il modulo del sito Starter funziona con il motore: invio dal sito pubblicato, richiesta salvata e visibile', async () => {
  const site = await serveSite();
  try {
    const p = await browser.newPage();
    await p.goto('http://localhost:4174/contatti/', { waitUntil: 'networkidle0' });
    await p.type('input[name=nome]', 'Carla'); await p.type('input[name=email]', 'carla@esempio.test'); await p.type('textarea[name=messaggio]', 'Ciao dal template Starter.');
    await p.click('input[name=privacy]');
    await pause(1600);
    await p.click('button[type=submit]');
    await p.waitForFunction(() => !document.querySelector('.form-success').hidden, { timeout: 15000 });
    await p.close();
  } finally { site.kill(); }
  const [[r]] = await root.query(`SELECT page_key, data FROM \`${E2E_DB}\`.form_submissions ORDER BY id DESC LIMIT 1`);
  assert.equal(r.page_key, 'contatti');
  assert.equal(JSON.parse(r.data).nome, 'Carla');
  await page.goto(`${URL_}/admin/requests`, { waitUntil: 'networkidle0' });
  assert.match(await page.$eval('main', (e) => e.textContent), /Carla/);
});

await step('si torna a Mammano (contenuti di esempio) e Starter, non più attivo, si toglie con conferma', async () => {
  await page.goto(`${URL_}/admin/templates`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { [...document.querySelectorAll('.tpl__item')].find((li) => li.dataset.id === 'mammano').querySelector('.btn').click(); });
  await page.waitForSelector('.tpl__confirm fieldset');
  const radios = await page.$$('.tpl__confirm input[type=radio]'); await radios[1].click();
  await page.type('.tpl__confirm input[type=password]', ADMIN.password);
  await click('Attiva e pubblica il sito');
  await waitFor(async () => /Template attivato/.test(await tplText()), 'ritorno a Mammano', 120000);
  assert.match(fs.readFileSync(path.join(dirs.out, 'index.html'), 'utf8'), /Mammano/);
  // il messaggio compare prima che l'elenco si aggiorni: si aspetta che Starter risulti non più attivo (e quindi rimovibile)
  await waitFor(() => page.evaluate(() => !!document.querySelector('.tpl__item[data-id="starter"] .btn--danger')), 'pulsante di rimozione di Starter');
  await ask(async () => { await page.evaluate(() => { document.querySelector('.tpl__item[data-id="starter"] .btn--danger').click(); }); });
  await waitFor(async () => /Template tolto/.test(await tplText()), 'rimozione di Starter');
  assert.equal(fs.existsSync(path.join(dirs.templates, 'starter')), false);
  assert.ok(fs.readdirSync(path.join(dirs.templates, '.trash')).some((n) => n.startsWith('starter-1.0.0-')));
  const [[log]] = await root.query(`SELECT COUNT(*) AS n FROM \`${E2E_DB}\`.audit_log WHERE action LIKE 'template.%'`);
  assert.ok(log.n >= 5, `voci nel registro: ${log.n}`);
});

await step('nessun errore in console', async () => { assert.deepEqual(consoleErrors, []); });

await cleanup();
console.log(`\nfatto: ${n} passi riusciti`);
