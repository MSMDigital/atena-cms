// Prova end-to-end dell'admin con un browser vero: accesso, editor dello stile con anteprima dal vivo, salvataggio, pubblicazione.
// Serve: database con dati (npm run db:seed), un utente admin, il server attivo (npm run dev, o next start) e queste variabili:
//   E2E_URL (es. http://localhost:3100), E2E_EMAIL, E2E_PASSWORD, opzionale E2E_SHOTS (cartella per gli screenshot)
// ATTENZIONE: salva e pubblica davvero, poi ripristina i valori originali. Usalo su un database di sviluppo.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensToCss } from '../render/tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { E2E_URL, E2E_EMAIL, E2E_PASSWORD, E2E_SHOTS } = process.env;
if (!E2E_URL || !E2E_EMAIL || !E2E_PASSWORD) { console.error('mancano E2E_URL, E2E_EMAIL, E2E_PASSWORD'); process.exit(1); }
const DIST = path.resolve(process.env.SITE_OUT_DIR ?? path.join(ROOT, 'dist'));
const shot = async (page, name) => { if (E2E_SHOTS) { fs.mkdirSync(E2E_SHOTS, { recursive: true }); await page.screenshot({ path: path.join(E2E_SHOTS, name + '.png') }); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Ogni esecuzione fa un accesso sbagliato di proposito: si azzerano i tentativi dell'utente di prova, altrimenti il limite (5 in 15 minuti) lo bloccherebbe.
{
  const { loadEnv, assertLocalDatabase } = await import('../lib/env.mjs'); loadEnv(); assertLocalDatabase('Questa prova');
  const { query, closeDb } = await import('../lib/db.mjs');
  await query('DELETE FROM login_attempts WHERE email = ?', [E2E_EMAIL.toLowerCase()]);
  await closeDb();
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 950 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });

let n = 0;
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${++n}. ${name}`); } catch (e) { console.error(`FAIL ${++n}. ${name}\n     ${e.message}`); await shot(page, `errore-${n}`); await browser.close(); process.exit(1); } };
// Clicca solo quando il pulsante è attivo: durante un'azione in corso è disabilitato e il clic andrebbe perso in silenzio.
const click = async (text) => {
  let b;
  for (let i = 0; i < 60; i++) { [b] = await page.$$(`xpath/.//button[normalize-space()="${text}"]`); if (b && !(await b.evaluate((el) => el.disabled))) break; await pause(150); }
  assert.ok(b, `pulsante "${text}" non trovato`);
  assert.equal(await b.evaluate((el) => el.disabled), false, `il pulsante "${text}" resta disabilitato`);
  await b.click();
};
const frame = async () => (await (await page.$('iframe')).contentFrame());
const cssVar = async (f, v) => f.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
const setText = async (sel, value) => { await page.$eval(sel, (el) => el.select()); await page.type(sel, value); };
// Il colore e i token di partenza sono quelli di starter.
const STARTER_TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/starter/tokens.json'), 'utf8'));
const BRAND = STARTER_TOKENS.colors.brand;
const distBrand = () => fs.readFileSync(path.join(DIST, 'assets/css/tokens.css'), 'utf8').match(/--c-brand: (#[0-9a-f]{6});/i)[1];

await step('senza accesso si viene mandati al login', async () => {
  await page.goto(`${E2E_URL}/admin/style`, { waitUntil: 'networkidle0' });
  assert.match(page.url(), /\/admin\/login\?next=/);
  await shot(page, '01-login');
});
await step('password errata: messaggio generico, resta al login', async () => {
  await page.type('input[name=email]', E2E_EMAIL);
  await page.type('input[name=password]', 'password-sbagliata');
  await click('Accedi');
  await page.waitForSelector('.login__error');
  assert.match(await page.$eval('.login__error', (e) => e.textContent), /non corrette|non corretti/);
  assert.match(page.url(), /\/admin\/login/);
});
await step('accesso corretto: torna alla pagina richiesta, cookie httpOnly', async () => {
  assert.equal(await page.$eval('input[name=email]', (e) => e.value), E2E_EMAIL, 'dopo un errore l\'email deve restare nel campo');
  await page.type('input[name=password]', E2E_PASSWORD);
  await click('Accedi');
  await page.waitForFunction(() => location.pathname === '/admin/style', { timeout: 30000 });
  await page.waitForSelector('iframe');
  const c = (await page.cookies()).find((x) => x.name === 'cms_session');
  assert.ok(c, 'cookie di sessione assente');
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'Lax');
});
await step('l\'editor carica i token e l\'anteprima mostra il sito con la bozza', async () => {
  await page.waitForSelector('iframe');
  await pause(1500);
  const f = await frame();
  assert.equal(await cssVar(f, '--c-brand'), BRAND);
  assert.ok(await f.$('.hero__title'), 'la home deve avere il titolo');
  await shot(page, '02-editor');
});
await step('anteprima dal vivo: il colore cambia senza salvare', async () => {
  await setText('[aria-label="Brand: valore"]', '#c2185b');
  await pause(300);
  assert.equal(await cssVar(await frame(), '--c-brand'), '#c2185b');
  assert.match(await page.$eval('.editor__actions .muted', (e) => e.textContent), /non salvate/);
  const [saveBtn] = await page.$$('xpath/.//button[normalize-space()="Salva bozza"]');
  assert.equal(await saveBtn.isIntersectingViewport(), true, 'i pulsanti Salva/Pubblica devono essere sempre visibili');
  await shot(page, '03-colore-live');
});
await step('anteprima dal vivo: effetto pulsanti e dimensione dei titoli', async () => {
  await (await page.$$('xpath/.//label[.//strong[text()="Riempimento"]]//input'))[0].click();
  await setText('[aria-label="Titolo 2 (h2): desktop"]', '50');
  await pause(300);
  const f = await frame();
  assert.equal(await f.evaluate(() => document.documentElement.getAttribute('data-btn-fx')), 'fill');
  assert.match(await cssVar(f, '--fs-h2'), /^clamp\(/);
  const h2 = await f.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main h2')).fontSize));
  assert.ok(h2 > 38 && h2 < 60, `h2 a ${h2}px: atteso vicino a 50`);
});
await step('anteprima: si può navigare dentro il sito senza uscire dall\'anteprima', async () => {
  const f = await frame();
  await f.evaluate(() => document.querySelector('.site-header__nav a[href*="/admin/preview/contatti/"]').click());
  // l'anteprima è un iframe sandboxed con srcdoc: il suo indirizzo non dice nulla, si guarda il contenuto
  const until = async (sel) => { for (let i = 0; i < 100; i++) { const fr = await frame(); if (fr && await fr.$(sel)) return; await pause(150); } assert.fail(`nell'anteprima non compare ${sel}`); };
  await until('form[data-form]');
  await (await frame()).evaluate(() => document.querySelector('.brand').click());
  await until('.hero h1');
  await pause(800);
  assert.equal(await cssVar(await frame(), '--c-brand'), '#c2185b', 'navigando, le modifiche non salvate restano applicate');
});
await step('valori non validi: errori visibili, salvataggio bloccato, anteprima ferma', async () => {
  await setText('[aria-label="Titolo 1 (h1): mobile"]', '3');
  await pause(200);
  assert.ok(await page.$('.errors'), 'devono comparire gli errori');
  assert.equal(await (await page.$('.errors')).isIntersectingViewport(), true, 'gli errori devono essere visibili senza scorrere');
  const [save] = await page.$$('xpath/.//button[normalize-space()="Salva bozza"]');
  assert.equal(await save.evaluate((b) => b.disabled), true);
  await shot(page, '04-errori');
  await setText('[aria-label="Titolo 1 (h1): mobile"]', '46.66');
  await pause(200);
  assert.equal(await page.$('.errors'), null);
});
await step('salvataggio: la bozza persiste dopo il ricaricamento, il sito online no', async () => {
  const before = distBrand();
  await click('Salva bozza');
  await page.waitForFunction(() => /salvata/.test(document.querySelector('.notice')?.textContent ?? ''));
  await page.reload({ waitUntil: 'load' });   // networkidle0 qui non arriva mai: l'anteprima tiene richieste di precaricamento in sospeso
  await page.waitForSelector('[aria-label="Brand: valore"]');
  assert.equal(await page.$eval('[aria-label="Brand: valore"]', (e) => e.value), '#c2185b');
  assert.equal(distBrand(), before, 'il sito pubblicato non deve cambiare salvando la bozza');
  await pause(1500);
  assert.equal(await cssVar(await frame(), '--c-brand'), '#c2185b', 'l\'anteprima usa la bozza salvata');
});
await step('pubblicazione: il sito online prende il nuovo colore, e la home lo usa', async () => {
  await click('Pubblica');
  await page.waitForFunction(() => /Pubblicato/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 60000 });
  assert.equal(distBrand(), '#c2185b');
  assert.match(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'), /data-btn-fx="fill"/);
  await shot(page, '05-pubblicato');
});
await step('ripristino dei valori originali e nuova pubblicazione', async () => {
  await setText('[aria-label="Brand: valore"]', BRAND);
  await (await page.$$('xpath/.//label[.//strong[text()="Freccia"]]//input'))[0].click();
  await setText('[aria-label="Titolo 2 (h2): desktop"]', '70.08');
  await click('Salva bozza');
  await page.waitForFunction(() => /salvata/.test(document.querySelector('.notice')?.textContent ?? ''));
  await click('Pubblica');
  await page.waitForFunction(() => /Pubblicato/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 60000 });
  assert.equal(distBrand(), BRAND);
  assert.equal(fs.readFileSync(path.join(DIST, 'assets/css/tokens.css'), 'utf8'), tokensToCss(STARTER_TOKENS), 'il CSS pubblicato deve tornare identico all\'originale');
});
await step('dashboard: contenuti e stato', async () => {
  await page.goto(`${E2E_URL}/admin`, { waitUntil: 'networkidle0' });
  const nPages = fs.readdirSync(path.join(ROOT, 'templates/starter/content/pages')).filter((f) => f.endsWith('.json') && !/^404/.test(f)).length;
  const stats = await page.$$eval('.stats .stat', (els) => els.map((e) => e.querySelector('strong').textContent));
  assert.equal(Number(stats[0]), nPages, 'il box «Pagine» conta le pagine dei contenuti (la 404 non si conta)');
  assert.match(await page.$eval('.card', (e) => e.textContent), /Nessuna modifica in attesa/);
  await shot(page, '06-dashboard');
});
await step('sicurezza: niente uscita dalla cartella asset, anteprima solo con sessione', async () => {
  const r = await page.evaluate(async (u) => (await fetch(u + '/admin/preview-assets/..%2F..%2F.env')).status, E2E_URL);
  assert.equal(r, 404);
  const ok = await page.evaluate(async (u) => (await fetch(u + '/admin/preview-assets/css/site.css')).status, E2E_URL);
  assert.equal(ok, 200);
});
await step('account: cambio password (attuale sbagliata, nuove diverse, troppo corta, poi riuscito e ripristinato)', async () => {
  await page.goto(`${E2E_URL}/admin/account`, { waitUntil: 'networkidle0' });
  const fill = async (cur, next, again) => {
    for (const [n, v] of [['current', cur], ['next', next], ['again', again]]) { await page.$eval(`input[name=${n}]`, (el) => { el.value = ''; }); await page.type(`input[name=${n}]`, v); }
    await page.$eval('input[name=next]', (el) => el.removeAttribute('minlength')); await page.$eval('input[name=again]', (el) => el.removeAttribute('minlength'));   // per provare anche il controllo del server
    await click('Cambia password');
  };
  const NEW = 'una-password-nuova-lunga-2026';
  await fill('sbagliata', NEW, NEW);
  await page.waitForFunction(() => /password attuale non è corretta/.test(document.querySelector('.account [role=alert]')?.textContent ?? ''), { timeout: 20000 });
  await fill(E2E_PASSWORD, NEW, NEW + 'x');
  await page.waitForFunction(() => /non coincidono/.test(document.querySelector('.account [role=alert]')?.textContent ?? ''), { timeout: 20000 });
  await fill(E2E_PASSWORD, 'corta', 'corta');
  await page.waitForFunction(() => /almeno 12/.test(document.querySelector('.account [role=alert]')?.textContent ?? ''), { timeout: 20000 });
  await fill(E2E_PASSWORD, NEW, NEW);
  await page.waitForFunction(() => /Password cambiata/.test(document.querySelector('.account [role=status]')?.textContent ?? ''), { timeout: 20000 });
  assert.equal((await page.$eval('input[name=current]', (e) => e.value)), '', 'i campi si svuotano dopo il cambio');
  await fill(NEW, E2E_PASSWORD, E2E_PASSWORD);                                     // ripristino
  await page.waitForFunction(() => /Password cambiata/.test(document.querySelector('.account [role=status]')?.textContent ?? ''), { timeout: 20000 });
  assert.match(await page.$eval('.account', (e) => e.textContent), /Admin|Amministratore|Editor|Autore/);
});
await step('uscita: la sessione non vale più', async () => {
  await click('Esci');
  await page.waitForFunction(() => location.pathname === '/admin/login', { timeout: 30000 });
  await page.goto(`${E2E_URL}/admin`, { waitUntil: 'networkidle0' });
  assert.match(page.url(), /\/admin\/login/);
  const status = await page.evaluate(async (u) => (await fetch(u + '/admin/preview/')).status, E2E_URL);
  assert.ok([401, 307, 200].includes(status));
});
assert.deepEqual(consoleErrors, [], 'errori in console: ' + consoleErrors.join(' | '));
console.log(`\ntutti i ${n} passaggi ok, nessun errore in console`);
await browser.close();
