// Prova end-to-end dei moduli con un browser vero: invio dal sito statico, salvataggio, email, elenco nell'admin.
// Serve: app Next.js attiva (senza SMTP nel .env: le impostazioni email si inseriscono dalla pagina Email dell'admin, e la prova avvia da sé
// un server SMTP di raccolta sulla porta 2525), un utente admin, e queste variabili: E2E_URL, E2E_EMAIL, E2E_PASSWORD, opzionale E2E_SHOTS.
// ATTENZIONE: parte riportando il database di sviluppo ai file originali e alla fine lo ripristina; elimina richieste e impostazioni email create dalla prova.
import puppeteer from 'puppeteer-core';
import { SMTPServer } from 'smtp-server';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { E2E_URL, E2E_EMAIL, E2E_PASSWORD, E2E_SHOTS } = process.env;
if (!E2E_URL || !E2E_EMAIL || !E2E_PASSWORD) { console.error('mancano E2E_URL, E2E_EMAIL, E2E_PASSWORD'); process.exit(1); }
const SITE_PORT = 4173;
const SITE = `http://localhost:${SITE_PORT}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Corpo di un messaggio testuale semplice, decodificato (nodemailer usa quoted-printable o base64 per gli accenti).
const bodyOf = (raw) => {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const body = rest.join('\n\n');
  const cte = /^Content-Transfer-Encoding:\s*(\S+)/im.exec(head)?.[1]?.toLowerCase();
  if (cte === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (cte === 'quoted-printable') return Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  return body;
};

const { loadEnv, assertLocalDatabase } = await import('../lib/env.mjs'); loadEnv(); assertLocalDatabase('Questa prova');
const { query, one, closeDb } = await import('../lib/db.mjs');
const D = await import('../lib/docs.mjs');
const reset = async () => { await D.seedFromFiles({ force: true }); const r = await D.publishAll(null, { force: true }); assert.equal(r.ok, true, JSON.stringify(r)); };
await query('DELETE FROM login_attempts WHERE email = ?', [E2E_EMAIL.toLowerCase()]);
const KEEP_KEYS = fs.readdirSync(path.join(ROOT, 'templates/mammano/content/pages')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));   // le pagine dei contenuti; le altre sono avanzi di prove
await query("DELETE FROM docs WHERE kind = 'page' AND doc_key NOT IN (?)", [KEEP_KEYS]);
await reset();
await query('DELETE FROM form_submissions');
await query('DELETE FROM settings');
const FORM_ID = JSON.parse((await one("SELECT published FROM docs WHERE kind = 'page' AND doc_key = 'preventivo'")).published).blocks.find((b) => b.type === 'form').id;

// Server SMTP di raccolta: tiene i messaggi ricevuti.
const inbox = [];
let authSeen = null;
const smtp = new SMTPServer({ authOptional: true, allowInsecureAuth: true, disabledCommands: ['STARTTLS'], onAuth(auth, _s, cb) { authSeen = { user: auth.username, pass: auth.password }; cb(null, { user: 1 }); }, onData(stream, session, cb) { const chunks = []; stream.on('data', (c) => chunks.push(c)); stream.on('end', () => { inbox.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString('utf8') }); cb(); }); } });
await new Promise((res, rej) => { smtp.on('error', rej); smtp.listen(2525, '127.0.0.1', res); });
// Sito statico locale, con /api/ verso l'app (come farà il proxy in produzione).
const site = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs'), String(SITE_PORT)], { env: { ...process.env, FORMS_PROXY: E2E_URL }, stdio: 'ignore' });
await pause(700);

const shot = async (pg, name) => { if (E2E_SHOTS) { fs.mkdirSync(E2E_SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(E2E_SHOTS, name + '.png') }); } };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
const apiCalls = [];
page.on('request', (r) => { if (r.url().includes('/api/forms/')) apiCalls.push(r.method()); });

let n = 0;
const cleanup = async () => {
  await browser.close().catch(() => {});
  site.kill(); await new Promise((r) => smtp.close(r));
  await query('DELETE FROM form_submissions');
  await query('DELETE FROM settings');
  await reset();
};
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${++n}. ${name}`); } catch (e) { console.error(`FAIL ${++n}. ${name}\n     ${e.message}`); await shot(page, `errore-${n}`); await cleanup(); await closeDb(); process.exit(1); } };
const waitFor = async (fn, msg, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await pause(150); } throw new Error(msg); };
const rows = () => query('SELECT * FROM form_submissions ORDER BY id');
const type = async (sel, value) => { await page.$eval(sel, (el) => el.select()); await page.keyboard.type(value); };
const FORM = 'form[data-form]';
const fillForm = async () => {
  await type('input[name=nome]', 'Anna'); await type('input[name=cognome]', 'Bianchi');
  await type('input[name=telefono]', '+41 79 123 45 67'); await type('input[name=email]', 'anna@example.ch');
  await type('input[name=citta]', 'Lugano');
  await page.select('select[name=servizio]', 'Trasloco privato');
  await page.$eval('input[name=data]', (el) => { el.value = '2026-11-03'; });
  await type('textarea[name=messaggio]', 'Appartamento al 4° piano, senza ascensore.');
  await page.click('input[name=privacy]');
};
const openForm = async () => { await page.goto(`${SITE}/preventivo-trasloco/`, { waitUntil: 'networkidle0' }); await page.waitForSelector(FORM); };
const click = async (text) => {
  let b;
  for (let i = 0; i < 60; i++) { [b] = await page.$$(`xpath/.//button[normalize-space()="${text}"]`); if (b && !(await b.evaluate((el) => el.disabled))) break; await pause(150); }
  assert.ok(b, `pulsante "${text}" non trovato`);
  await b.click();
};

const SECRET_PW = 'password-di-prova-123';
const emailField = (n) => `[data-path="${n}"]`;
await step('accesso', async () => {
  await page.goto(`${E2E_URL}/admin/login`, { waitUntil: 'networkidle0' });
  await page.type('input[name=email]', E2E_EMAIL); await page.type('input[name=password]', E2E_PASSWORD);
  await click('Accedi');
  await page.waitForFunction(() => location.pathname === '/admin', { timeout: 30000 });
});

await step('impostazioni email: vuote all\'inizio, con avviso; la voce sta nel menu', async () => {
  await page.goto(`${E2E_URL}/admin/email`, { waitUntil: 'networkidle0' });
  assert.match(await page.$eval('.mailset .notice', (e) => e.textContent), /Nessun server email configurato/);
  assert.ok((await page.$$eval('.topbar__nav a', (as) => as.map((a) => a.textContent))).includes('Email'));
  assert.equal(await page.$eval('input[name=host]', (e) => e.value), '');
  await shot(page, 'e1-vuote');
});

await step('errori: un server scritto male è segnalato accanto al campo e non si salva nulla', async () => {
  await type('input[name=host]', 'https://smtp.esempio.ch/');
  await type('input[name=from]', 'non-una-email');
  await click('Salva impostazioni');
  await page.waitForSelector(`${emailField('host')} .bad`);
  assert.match(await page.$eval(`${emailField('host')} .bad`, (e) => e.textContent), /senza http/);
  assert.match(await page.$eval(`${emailField('from')} .bad`, (e) => e.textContent), /non valido/);
  assert.equal((await one('SELECT COUNT(*) AS n FROM settings')).n, 0);
});

await step('salvataggio: compilo il server di prova, la password resta nascosta e cifrata', async () => {
  await type('input[name=host]', '127.0.0.1');
  await page.select('select[name=security]', 'none');
  assert.equal(await page.$eval('input[name=port]', (e) => e.value), '25', 'la porta si adegua al tipo di connessione');
  await type('input[name=port]', '2525');
  await type('input[name=user]', 'sito@mammano.ch');
  await type('input[name=password]', SECRET_PW);
  await type('input[name=from]', 'sito@mammano.ch');
  await type('input[name=fromName]', 'Sito Mammano Traslochi');
  await click('Salva impostazioni');
  await page.waitForFunction(() => /Impostazioni salvate/.test(document.querySelector('.mailset form .ok')?.textContent ?? ''), { timeout: 15000 });
  assert.equal(await page.$eval('input[name=password]', (e) => e.value), '', 'dopo il salvataggio il campo password è vuoto');
  assert.match(await page.$eval('input[name=password]', (e) => e.placeholder), /salvata/);
  assert.match(await page.$eval('.mailset .notice', (e) => e.textContent), /In uso: le impostazioni salvate qui/);
  const raw = (await one("SELECT value FROM settings WHERE name = 'mail'")).value;
  assert.equal(raw.includes(SECRET_PW), false, 'nel database la password non è in chiaro');
  assert.match(JSON.parse(raw).passwordEnc, /^v1:/);
  await shot(page, 'e2-salvate');
});

await step('dopo il ricaricamento i valori ci sono, la password non compare da nessuna parte nella pagina', async () => {
  await page.goto(`${E2E_URL}/admin/email`, { waitUntil: 'networkidle0' });
  const v = await page.evaluate(() => Object.fromEntries(['host', 'port', 'security', 'user', 'from', 'fromName', 'password'].map((n) => [n, document.querySelector(`[name=${n}]`).value])));
  assert.deepEqual(v, { host: '127.0.0.1', port: '2525', security: 'none', user: 'sito@mammano.ch', from: 'sito@mammano.ch', fromName: 'Sito Mammano Traslochi', password: '' });
  assert.equal((await page.content()).includes(SECRET_PW), false);
  assert.match(await page.$eval('.mailset form .hint', (e) => e.textContent), /Ultima modifica/);
});

await step('modifica: cambio il nome del mittente lasciando vuota la password, che resta quella di prima', async () => {
  await type('input[name=fromName]', 'Mammano Traslochi');
  await click('Salva impostazioni');
  await page.waitForFunction(() => document.querySelector('.mailset form .ok')?.textContent?.includes('salvate'), { timeout: 15000 });
  const row = JSON.parse((await one("SELECT value FROM settings WHERE name = 'mail'")).value);
  assert.equal(row.fromName, 'Mammano Traslochi');
  assert.ok(row.passwordEnc, 'la password c\'è ancora');
});

await step('email di prova: arriva, con le credenziali salvate usate per l\'accesso', async () => {
  await page.$eval('input[type=email][aria-label^="Indirizzo a cui"]', (el) => { el.value = ''; });
  await type('input[type=email][aria-label^="Indirizzo a cui"]', 'prova@example.ch');
  await click('Invia email di prova');
  await page.waitForFunction(() => /Email inviata a prova@example.ch/.test(document.querySelector('.mailset section .ok')?.textContent ?? ''), { timeout: 20000 });
  await waitFor(async () => inbox.length === 1, 'la prova non è arrivata al server SMTP');
  assert.deepEqual(inbox[0].to, ['prova@example.ch']);
  assert.match(inbox[0].raw, /^From: "?Mammano Traslochi"? <sito@mammano\.ch>$/m);
  assert.deepEqual(authSeen, { user: 'sito@mammano.ch', pass: SECRET_PW });
  inbox.length = 0;
  await shot(page, 'e3-prova');
});

await step('il modulo del sito è quello vero: indirizzo di invio, esca nascosta, nessun residuo del prototipo', async () => {
  await openForm();
  const info = await page.$eval(FORM, (f) => ({ id: f.dataset.form, endpoint: f.dataset.endpoint, locale: f.dataset.locale, proto: f.hasAttribute('data-proto'), trap: !!f.querySelector('input[name=website][tabindex="-1"]'), consent: f.querySelector('input[type=checkbox]').name }));
  assert.deepEqual(info, { id: FORM_ID, endpoint: '/api/forms', locale: 'it', proto: false, trap: true, consent: 'privacy' });
  assert.equal(await page.$eval('.form-success', (e) => e.hidden), true);
  assert.equal(await page.$eval('.form-error', (e) => e.hidden), true);
  const html = await page.content();
  assert.equal(html.includes('recipients'), false, 'i destinatari non compaiono nella pagina pubblica');
  await shot(page, 'f1-modulo');
});

await step('modulo vuoto: la validazione del browser blocca, nessuna richiesta parte', async () => {
  await click('Invia la richiesta');
  await pause(500);
  assert.equal(apiCalls.length, 0);
  assert.equal((await rows()).length, 0);
});

await step('invio corretto: messaggio di conferma con focus, campi nascosti, richiesta salvata', async () => {
  await fillForm();
  await pause(1500);                       // il modulo compilato "in meno di un secondo" sarebbe scartato come automatico
  await shot(page, 'f2-compilato');
  await click('Invia la richiesta');
  await waitFor(async () => !(await page.$eval('.form-success', (e) => e.hidden)), 'messaggio di conferma non comparso');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('form-success')), true, 'il focus va sul messaggio');
  assert.equal(await page.$eval('.form-grid', (e) => e.hidden), true);
  assert.equal(await page.$eval('.form-success', (e) => getComputedStyle(e).display !== 'none'), true);
  assert.deepEqual(apiCalls, ['POST']);
  const [row, ...others] = await rows();
  assert.equal(others.length, 0);
  assert.deepEqual([row.block_id, row.page_key, row.locale, row.consent, row.status], [FORM_ID, 'preventivo', 'it', 1, 'new']);
  assert.deepEqual(JSON.parse(row.data), { nome: 'Anna', cognome: 'Bianchi', telefono: '+41 79 123 45 67', email: 'anna@example.ch', citta: 'Lugano', servizio: 'Trasloco privato', data: '2026-11-03', messaggio: 'Appartamento al 4° piano, senza ascensore.', privacy: true });
  await shot(page, 'f3-inviato');
});

await step('email: arriva ai destinatari del modulo, con Reply-To di chi ha scritto e i dati leggibili', async () => {
  await waitFor(async () => inbox.length === 1, 'nessuna email ricevuta dal server SMTP di prova');
  const m = inbox[0];
  assert.deepEqual(m.to, ['info@mammano.ch']);
  assert.equal(m.from, 'sito@mammano.ch');
  assert.match(m.raw, /^Subject: Richiesta di preventivo$/m);
  assert.match(m.raw, /^Reply-To: anna@example\.ch$/m);
  const text = bodyOf(m.raw);
  assert.match(text, /Nome: Anna/);
  assert.match(text, /Città di partenza: Lugano/);
  assert.match(text, /Servizio: Trasloco privato/);
  assert.match(text, /Appartamento al 4° piano/);
  assert.match(text, /Consenso: sì/);
  await waitFor(async () => (await rows())[0].mail_status === 'sent', 'esito "inviata" non registrato');
  assert.ok((await rows())[0].mailed_at);
});

await step('esca compilata e invio troppo rapido: la conferma appare (il bot non impara nulla) ma non si salva nulla', async () => {
  await openForm();
  await pause(1500);
  await page.$eval('input[name=website]', (el) => { el.value = 'http://spam.example'; });
  await fillForm();
  await click('Invia la richiesta');
  await waitFor(async () => !(await page.$eval('.form-success', (e) => e.hidden)), 'la conferma dovrebbe comparire');
  await page.goto(`${SITE}/preventivo-trasloco/`, { waitUntil: 'domcontentloaded' });   // invio immediato, senza aspettare
  await page.waitForSelector('input[name=website]');
  await page.evaluate(() => {
    const f = (n, v) => { document.querySelector(`[name=${n}]`).value = v; };
    f('nome', 'Fretta'); f('cognome', 'Veloce'); f('telefono', '+41 79 111 22 33'); f('email', 'fretta@example.ch'); f('citta', 'Chiasso');
    document.querySelector('[name=privacy]').checked = true;
    document.querySelector('form[data-form]').requestSubmit();
  });
  await waitFor(async () => !(await page.$eval('.form-success', (e) => e.hidden)), 'la conferma dovrebbe comparire anche qui');
  await pause(500);
  assert.equal((await rows()).length, 1, 'nessuna riga in più');
  assert.equal(inbox.length, 1, 'nessuna email in più');
});

await step('errore di rete o del server: messaggio d\'errore con focus, i dati restano, si può riprovare', async () => {
  await openForm();
  await fillForm();
  await type('input[name=citta]', 'Mendrisio');   // diversa dalla prima: una richiesta identica ravvicinata verrebbe presa per un doppio invio
  await pause(1500);
  await page.setRequestInterception(true);
  let block = true;
  const handler = (r) => { if (block && r.url().includes('/api/forms/')) r.respond({ status: 500, contentType: 'application/json', body: '{"ok":false}' }); else r.continue(); };
  page.on('request', handler);
  await click('Invia la richiesta');
  await waitFor(async () => !(await page.$eval('.form-error', (e) => e.hidden)), 'errore non mostrato');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('form-error')), true);
  assert.match(await page.$eval('.form-error', (e) => e.textContent), /Non siamo riusciti a inviare la richiesta/);
  assert.equal(await page.$eval('input[name=nome]', (e) => e.value), 'Anna', 'i dati inseriti non si perdono');
  assert.equal(await page.$eval('button[type=submit]', (b) => b.disabled), false);
  await shot(page, 'f4-errore');
  block = false;                            // la rete torna: stessa richiesta
  await click('Invia la richiesta');
  await waitFor(async () => !(await page.$eval('.form-success', (e) => e.hidden)), 'riprovando non è arrivata la conferma');
  assert.equal(await page.$eval('.form-error', (e) => e.hidden), true, 'l\'errore sparisce');
  await waitFor(async () => (await rows()).length === 2, 'seconda richiesta non salvata');
  page.off('request', handler); await page.setRequestInterception(false);
  await waitFor(async () => inbox.length === 2, 'seconda email non ricevuta');
});

await step('altri siti: un modulo inviato da un\'origine estranea è respinto, il permesso preventivo (CORS) non si concede', async () => {
  const body = JSON.stringify({ fields: { nome: 'X' }, website: '', _t: 5000 });
  const evil = await fetch(`${E2E_URL}/api/forms/${FORM_ID}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Origin: 'https://sito-malevolo.example' } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(`${E2E_URL}/api/forms/${FORM_ID}`, { method: 'OPTIONS', headers: { Origin: 'https://sito-malevolo.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const ok = await fetch(`${E2E_URL}/api/forms/${FORM_ID}`, { method: 'OPTIONS', headers: { Origin: new URL(E2E_URL).origin, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), new URL(E2E_URL).origin);
  assert.equal((await fetch(`${E2E_URL}/api/forms/non-esiste`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })).status, 404);
  assert.equal((await fetch(`${E2E_URL}/api/forms/${FORM_ID}`, { method: 'POST', body: 'x'.repeat(40000), headers: { 'Content-Type': 'application/json' } })).status, 413);
  assert.equal((await rows()).length, 2);
});

await step('admin: il badge con le richieste nuove nel menu', async () => {
  await page.goto(`${E2E_URL}/admin`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('.nav-badge', (e) => e.textContent), '2');
});

await step('elenco: le due richieste, la più recente per prima, con esito email', async () => {
  await page.goto(`${E2E_URL}/admin/requests`, { waitUntil: 'networkidle0' });
  assert.equal((await page.$$('.table tbody tr')).length, 2);
  const text = await page.$eval('.table tbody tr', (r) => r.textContent);
  assert.match(text, /Anna Bianchi/);
  assert.match(text, /Mendrisio/, 'in cima la più recente');
  assert.match(text, /Nuova/);
  assert.match(text, /Inviata/);
  assert.match(await page.$eval('.table tbody tr:nth-child(2)', (r) => r.textContent), /Lugano/);
  assert.equal(await page.$eval('.tab--on', (e) => e.textContent.replace(/\s+/g, ' ').trim()), 'Nuove 2');
  await shot(page, 'f5-elenco');
});

await step('dettaglio: etichette del modulo, link email e telefono, pagina di origine', async () => {
  await page.click('.table tbody tr a');
  await page.waitForSelector('.req');
  const text = await page.$eval('main', (e) => e.textContent);
  for (const s of ['Richiesta di preventivo', 'Città di partenza', 'Mendrisio', 'Appartamento al 4° piano', 'Consenso', 'info@mammano.ch', 'Inviata']) assert.ok(text.includes(s), `manca "${s}"`);
  assert.equal(await page.$eval('a[href^="mailto:"]', (a) => a.getAttribute('href')), 'mailto:anna@example.ch');
  assert.equal(await page.$eval('a[href^="tel:"]', (a) => a.getAttribute('href')), 'tel:+41791234567');
  await shot(page, 'f6-dettaglio');
});

await step('stato: letta, archiviata, e il badge scende', async () => {
  await click('Segna come letta');
  await page.waitForFunction(() => /Stato: Letta/.test(document.querySelector('.req__status')?.textContent ?? ''), { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.nav-badge')?.textContent === '1', { timeout: 15000 });
  await click('Archivia');
  await page.waitForFunction(() => /Stato: Archiviata/.test(document.querySelector('.req__status')?.textContent ?? ''), { timeout: 15000 });
  await page.goto(`${E2E_URL}/admin/requests?stato=archived`, { waitUntil: 'networkidle0' });
  assert.equal((await page.$$('.table tbody tr')).length, 1);
  await page.goto(`${E2E_URL}/admin/requests?stato=tutte`, { waitUntil: 'networkidle0' });
  assert.equal((await page.$$('.table tbody tr')).length, 2);
});

await step('email non partita: si vede l\'errore e "Invia di nuovo" la manda', async () => {
  const bad = await one('SELECT id FROM form_submissions ORDER BY id LIMIT 1');
  await query("UPDATE form_submissions SET mail_status = 'failed', mail_error = 'connessione rifiutata', mailed_at = NULL WHERE id = ?", [bad.id]);
  await page.goto(`${E2E_URL}/admin/requests/${bad.id}`, { waitUntil: 'networkidle0' });
  assert.match(await page.$eval('main', (e) => e.textContent), /Non inviata[\s\S]*connessione rifiutata/);
  const before = inbox.length;
  await click('Invia di nuovo l\'email');
  await waitFor(async () => inbox.length === before + 1, 'l\'email non è stata rinviata');
  await page.waitForFunction(() => !document.querySelector('main').textContent.includes('connessione rifiutata'), { timeout: 15000 });
  assert.equal((await one('SELECT mail_status FROM form_submissions WHERE id = ?', [bad.id])).mail_status, 'sent');
  assert.equal((await page.$$('xpath/.//button[normalize-space()="Invia di nuovo l\'email"]')).length, 0, 'inviata: il pulsante sparisce');
});

await step('eliminazione (admin): con conferma, poi la richiesta non c\'è più', async () => {
  const id = (await one('SELECT id FROM form_submissions ORDER BY id LIMIT 1')).id;
  await page.goto(`${E2E_URL}/admin/requests/${id}`, { waitUntil: 'networkidle0' });
  await click('Elimina'); await click('Sì, elimina');
  await page.waitForFunction(() => location.pathname === '/admin/requests', { timeout: 15000 });
  assert.equal((await rows()).length, 1);
  assert.equal((await page.goto(`${E2E_URL}/admin/requests/${id}`)).status(), 404);
});

await step('sicurezza: senza accesso l\'elenco non si vede', async () => {
  const r = await fetch(`${E2E_URL}/admin/requests`, { redirect: 'manual' });
  assert.ok([302, 307].includes(r.status), `stato ${r.status}`);
  assert.match(r.headers.get('location') ?? '', /\/admin\/login/);
});

await step('nessun errore in console', async () => { assert.deepEqual(consoleErrors, []); });

await cleanup();
await closeDb();
console.log(`\nfatto: ${n} passi riusciti`);
