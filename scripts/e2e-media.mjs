// Prova end-to-end della libreria immagini con un browser vero: caricamento, selettore nell'editor, anteprima, pubblicazione, eliminazione.
// Serve: server attivo, utente admin, e queste variabili: E2E_URL, E2E_EMAIL, E2E_PASSWORD, opzionale E2E_SHOTS.
// ATTENZIONE: parte riportando il database di sviluppo ai file originali e alla fine lo ripristina; elimina i caricamenti fatti dalla prova (non quelli preesistenti).
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { E2E_URL, E2E_EMAIL, E2E_PASSWORD, E2E_SHOTS } = process.env;
if (!E2E_URL || !E2E_EMAIL || !E2E_PASSWORD) { console.error('mancano E2E_URL, E2E_EMAIL, E2E_PASSWORD'); process.exit(1); }
const DIST = path.resolve(process.env.SITE_OUT_DIR ?? path.join(ROOT, 'dist'));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const { loadEnv, assertLocalDatabase } = await import('../lib/env.mjs'); loadEnv(); assertLocalDatabase('Questa prova');
const { query, closeDb } = await import('../lib/db.mjs');
const D = await import('../lib/docs.mjs');
const M = await import('../lib/media.mjs');
const reset = async () => { await D.seedFromFiles({ force: true }); const r = await D.publishAll(null, { force: true }); assert.equal(r.ok, true, JSON.stringify(r)); };
await query('DELETE FROM login_attempts WHERE email = ?', [E2E_EMAIL.toLowerCase()]);
const KEEP_KEYS = fs.readdirSync(path.join(ROOT, 'templates/starter/content/pages')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));   // le pagine dei contenuti; le altre sono avanzi di prove
await query("DELETE FROM docs WHERE kind = 'page' AND doc_key NOT IN (?)", [KEEP_KEYS]);
await reset();
const uploadsBefore = new Set((await M.listMedia()).filter((i) => i.source === 'upload').map((i) => i.path));   // eventuali caricamenti veri non si toccano

// File di prova (in una cartella temporanea).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-media-'));
const make = async (name, buf) => { const f = path.join(tmp, name); fs.writeFileSync(f, buf); return f; };
const big = await make('Panorama Lago di Como.jpg', await sharp({ create: { width: 3200, height: 2000, channels: 3, background: { r: 30, g: 110, b: 170 } } }).jpeg({ quality: 88 }).toBuffer());
const second = await make('secondo.png', await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 190, g: 60, b: 40 } } }).png().toBuffer());
const fake = await make('falso.jpg', Buffer.from('questo non è un\'immagine'));
const heavy = await make('pesante.png', await sharp(crypto.randomBytes(1800 * 1800 * 3), { raw: { width: 1800, height: 1800, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer());
const heavyMb = fs.statSync(heavy).size / 1048576;

const shot = async (pg, name) => { if (E2E_SHOTS) { fs.mkdirSync(E2E_SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(E2E_SHOTS, name + '.png') }); } };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1700, height: 1000 });
page.on('dialog', (d) => d.accept());
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });

let n = 0;
// Anche dopo un errore: il database torna ai file originali e i caricamenti della prova vengono eliminati (quelli preesistenti no).
const cleanup = async () => {
  await browser.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
  await reset();
  for (const i of (await M.listMedia()).filter((x) => x.source === 'upload' && !uploadsBefore.has(x.path))) await M.deleteMedia(i.path);
};
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${++n}. ${name}`); } catch (e) { console.error(`FAIL ${++n}. ${name}\n     ${e.message}`); await shot(page, `errore-${n}`); await cleanup(); await closeDb(); process.exit(1); } };
const click = async (text, scope = page) => {
  let b;
  for (let i = 0; i < 60; i++) { [b] = await scope.$$(`xpath/.//button[normalize-space()="${text}"]`); if (b && !(await b.evaluate((el) => el.disabled))) break; await pause(150); }
  assert.ok(b, `pulsante "${text}" non trovato`);
  assert.equal(await b.evaluate((el) => el.disabled), false, `il pulsante "${text}" resta disabilitato`);
  await b.click();
};
const goto = async (p) => { await page.goto(E2E_URL + p, { waitUntil: 'networkidle0' }); };
const field = (p) => `.fld[data-path="${p}"]`;
const item = (p) => `li.item[data-path="${p}"]`;
const openItem = async (p) => { const expanded = await page.$eval(`${item(p)} > .item__head .item__toggle`, (b) => b.getAttribute('aria-expanded')); if (expanded !== 'true') await page.click(`${item(p)} > .item__head .item__toggle`); await page.waitForSelector(`${item(p)} > .item__body`); };
const save = async () => { await click('Salva bozza'); await page.waitForFunction(() => /salvata|Nessuna modifica/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 15000 }); };
const publish = async () => { await click('Pubblica'); await page.waitForFunction(() => /Pubblicato|Niente da pubblicare/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 90000 }); };
const imgLoaded = (q) => page.waitForFunction((s) => { const i = document.querySelector(s); return i && i.complete && i.naturalWidth > 0; }, { timeout: 15000 }, q);
const preview = async () => (await (await page.$('iframe')).contentFrame());
const previewUntil = async (fn, arg, msg) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) { try { const f = await preview(); if (f && await f.evaluate(fn, arg)) return; } catch { /* il frame si sta ricaricando */ } await pause(250); }
  throw new Error(`anteprima: ${msg}`);
};
// Carica dal campo file nascosto del componente e aspetta che compaia il risultato.
const uploadVia = async (scope, file) => { const input = await scope.$('input[type=file]'); assert.ok(input, 'campo file non trovato'); await input.uploadFile(file); };

let uploadedPath;

await step('accesso', async () => {
  await goto('/admin/login');
  await page.type('input[name=email]', E2E_EMAIL); await page.type('input[name=password]', E2E_PASSWORD);
  await click('Accedi');
  await page.waitForFunction(() => location.pathname === '/admin', { timeout: 30000 });
});

await step('libreria: le immagini del progetto ci sono, con miniature che si caricano', async () => {
  await goto('/admin/media');
  await page.waitForSelector('.mcell');
  const count = (await page.$$('.mcell')).length;
  assert.ok(count >= 36, `immagini in libreria: ${count}`);
  await imgLoaded('.mcell img');
  const text = await page.$eval('.mlib__list .mlib__bar', (e) => e.textContent);
  assert.match(text, /\d+ immagini/);
  await shot(page, 'm1-libreria');
});

await step('caricamento: la foto grande diventa WebP 2400 px e compare selezionata con i dettagli', async () => {
  await uploadVia(await page.$('.upl'), big);
  await page.waitForSelector('.mcell--sel', { timeout: 30000 });
  const detail = await page.$eval('.mdet', (e) => e.textContent);
  assert.match(detail, /Panorama Lago di Como\.jpg/);
  assert.match(detail, /2400 × 1500 px/);
  assert.match(detail, /Caricata dall'admin/);
  uploadedPath = await page.$eval('.mcell--sel', (b) => b.dataset.path);
  assert.match(uploadedPath, /^uploads\/panorama-lago-di-como-[0-9a-f]{10}\.webp$/);
  await imgLoaded('.mdet__img');
  const disk = await sharp(fs.readFileSync(path.join(M.mediaDir(), uploadedPath))).metadata();
  assert.deepEqual([disk.format, disk.width, disk.height], ['webp', 2400, 1500]);
  assert.equal((await page.$$('.mcell')).length >= 37, true);
  await shot(page, 'm2-caricata');
});

await step('file non valido e file troppo grande: errore chiaro, nulla di salvato', async () => {
  const before = (await page.$$('.mcell')).length;
  await uploadVia(await page.$('.upl'), fake);
  await page.waitForSelector('.upl__errors');
  assert.match(await page.$eval('.upl__errors', (e) => e.textContent), /falso\.jpg: Formato non supportato/);
  assert.equal((await page.$$('.mcell')).length, before);
  assert.ok(heavyMb > 9 && heavyMb < 10, `il file pesante di prova è ${heavyMb.toFixed(1)} MB`);
  await uploadVia(await page.$('.upl'), heavy);
  await page.waitForFunction((b) => document.querySelectorAll('.mcell').length > b, { timeout: 60000 }, before);   // sotto il limite di 10 MB: deve passare
  assert.equal(await page.$('.upl__errors'), null, 'un file da ~9 MB non deve essere respinto');
  const heavyPath = await page.$eval('.mcell--sel', (b) => b.dataset.path);
  assert.match(heavyPath, /pesante-/);
  const r = await fetch(E2E_URL + '/admin/media/upload', { method: 'POST', body: 'x', redirect: 'manual' });
  assert.ok([401, 403, 302, 307].includes(r.status), `senza sessione non si carica (${r.status})`);
  const t = await fetch(E2E_URL + '/admin/media/thumb/demo-1.jpg', { redirect: 'manual' });
  assert.ok([401, 302, 307].includes(t.status), `senza sessione niente miniature (${t.status})`);
});

await step('testo alternativo predefinito: si salva e resta dopo il ricaricamento', async () => {
  const close = await page.$('xpath/.//dialog//button[normalize-space()="Chiudi"]');   // i dettagli stanno in una finestra: quella del passo prima è ancora aperta
  if (close) { await close.click(); await pause(300); }
  await page.click(`.mcell[data-path="${uploadedPath}"]`);
  const ALT = 'xpath/.//div[contains(@class,"mdet")]//label[.//span[normalize-space()="Testo alternativo"]]//input';   // il primo campo è il nome del file: il testo alternativo si cerca per etichetta
  await page.waitForSelector(ALT);
  await (await page.$(ALT)).evaluate((el) => el.select());
  await page.keyboard.type('Il lago visto dal molo all\'alba');
  await click('Salva dettagli');
  await page.waitForFunction(() => /salvat/.test(document.querySelector('.mdet [role=status]')?.textContent ?? ''));
  await goto('/admin/media');
  await page.click(`.mcell[data-path="${uploadedPath}"]`);
  await page.waitForSelector(ALT);
  assert.equal(await (await page.$(ALT)).evaluate((el) => el.value), 'Il lago visto dal molo all\'alba');
  await page.waitForFunction(() => /In nessuna pagina/.test(document.querySelector('.mdet')?.textContent ?? ''), { timeout: 15000 });
});

await step('libreria: la ricerca filtra', async () => {
  await page.type('input[type=search]', 'panorama');
  await page.waitForFunction(() => document.querySelectorAll('.mcell').length === 1);
  await page.$eval('input[type=search]', (el) => { el.select(); });
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.querySelectorAll('.mcell').length > 5);
});

await step('editor: il selettore propone l\'immagine e il testo alternativo si compila da solo', async () => {
  await goto('/admin/pages/moduli-interni');
  await page.waitForSelector('li.item');
  await openItem('/blocks/2');
  const sel = field('/blocks/2/image');
  await imgLoaded(`${sel} .focal img`);
  // svuota il testo alternativo attuale, così il predefinito viene proposto
  await page.$eval(`${field('/blocks/2/image/alt')} input`, (el) => el.select()); await page.keyboard.press('Backspace');
  await page.click(`${sel} button[aria-label$="cambia immagine"]`);
  await page.waitForSelector('dialog.picker[open]');
  await imgLoaded('dialog.picker .mcell img');
  await shot(page, 'm3-selettore');
  await page.click(`dialog.picker .mcell[data-path="${uploadedPath}"]`);
  await page.waitForFunction(() => !document.querySelector('dialog.picker[open]'));
  assert.equal(await page.$eval(`${field('/blocks/2/image/alt')} input`, (el) => el.value), 'Il lago visto dal molo all\'alba');
  await imgLoaded(`${sel} .focal img`);
  assert.match(await page.$eval(`${sel} .imgfield__name`, (e) => e.textContent), /Panorama Lago di Como\.jpg/);
  await previewUntil(() => [...document.images].some((i) => i.src.includes('/uploads/panorama-lago-di-como') && i.complete && i.naturalWidth === 2400), null, 'la nuova immagine non compare in anteprima');
  await shot(page, 'm4-anteprima');
});

await step('editor: caricamento direttamente dal selettore, l\'immagine viene scelta subito', async () => {
  await page.click(`${field('/blocks/2/image')} button[aria-label$="cambia immagine"]`);
  await page.waitForSelector('dialog.picker[open]');
  await uploadVia(await page.$('dialog.picker'), second);
  await page.waitForFunction(() => !document.querySelector('dialog.picker[open]'), { timeout: 30000 });
  assert.match(await page.$eval(field('/blocks/2/image') + ' .imgfield__name', (e) => e.textContent), /secondo\.png/);
  // e si può tornare alla prima, ora già in elenco
  await page.click(`${field('/blocks/2/image')} button[aria-label$="cambia immagine"]`);
  await page.waitForSelector(`dialog.picker[open] .mcell[data-path="${uploadedPath}"]`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.picker[open]'));
  await page.click(`${field('/blocks/2/image')} button[aria-label$="cambia immagine"]`);
  await page.click(`dialog.picker .mcell[data-path="${uploadedPath}"]`);
  await page.waitForFunction(() => !document.querySelector('dialog.picker[open]'));
});

await step('dati del sito: il logo si sceglie dalla libreria', async () => {
  await save();
  await goto('/admin/site');
  await page.waitForSelector('.imgfield__file, .fld');
  const btn = await page.$('button[aria-label^="Logo (file)"]');
  assert.ok(btn, 'il campo "Logo (file)" ha il selettore');
  await shot(page, 'm5-sito');
});

await step('pubblicazione: l\'immagine usata va online con le sue dimensioni, quella non usata no', async () => {
  await goto('/admin/pages/moduli-interni');
  await page.waitForSelector('li.item');
  await publish();
  assert.ok(fs.existsSync(path.join(DIST, 'assets/img', uploadedPath)), 'il file caricato è nel sito pubblicato');
  const html = fs.readFileSync(path.join(DIST, 'moduli-interni/index.html'), 'utf8');
  assert.match(html, new RegExp(`/assets/img/${uploadedPath.replace(/[.]/g, '\\.')}"[^>]*width="2400" height="1500"`));
  const uploads = fs.readdirSync(path.join(DIST, 'assets/img/uploads'));
  assert.deepEqual(uploads, [path.basename(uploadedPath)], 'in dist/ ci sono solo i caricamenti usati');
});

await step('libreria: l\'immagine usata mostra dove, e non si può eliminare', async () => {
  await goto('/admin/media');
  await page.click(`.mcell[data-path="${uploadedPath}"]`);
  await page.waitForFunction(() => /Pagina: moduli-interni/.test(document.querySelector('.mdet')?.textContent ?? ''));
  assert.match(await page.$eval('.mdet', (e) => e.textContent), /online e in bozza/);
  assert.equal(await page.$eval('.mdet .btn--danger', (b) => b.disabled), true);
  await shot(page, 'm6-in-uso');
});

await step('libreria: un\'immagine non usata si elimina (con conferma) e sparisce dal disco', async () => {
  const [{ path: unused }] = (await M.listMedia()).filter((i) => i.source === 'upload' && /secondo-/.test(i.path));
  await goto('/admin/media');
  await page.click(`.mcell[data-path="${unused}"]`);
  await page.waitForFunction(() => /In nessuna pagina/.test(document.querySelector('.mdet')?.textContent ?? ''));
  await click('Elimina');
  await click('Sì, elimina');
  await page.waitForFunction((p) => !document.querySelector(`.mcell[data-path="${p}"]`), {}, unused);
  assert.equal(fs.existsSync(path.join(M.mediaDir(), unused)), false);
});

await step('sicurezza: con la sessione ma da un altro sito il caricamento è respinto', async () => {
  const cookie = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const post = async (origin) => {
    const f = new FormData(); f.append('file', new Blob(['x'], { type: 'image/png' }), 'x.png');
    return (await fetch(E2E_URL + '/admin/media/upload', { method: 'POST', body: f, headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) }, redirect: 'manual' })).status;
  };
  assert.equal(await post('https://sito-malevolo.example'), 403, 'origine estranea');
  assert.equal(await post(null), 403, 'senza Origin');
  assert.equal(await post(new URL(E2E_URL).origin), 422, 'stessa origine: la richiesta arriva fino al controllo del file');
});

await step('nessun errore in console', async () => { assert.deepEqual(consoleErrors, []); });

// ---- pulizia: database e sito ai file originali, caricamenti della prova eliminati -------------------------------------
await cleanup();
await closeDb();
console.log(`\nfatto: ${n} passi riusciti`);
