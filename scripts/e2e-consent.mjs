// Prova end-to-end del consenso per la mappa, con un browser vero, sul solo sito statico (non serve l'app né il database).
// Costruisce il sito nelle due modalità e verifica che Google non riceva NESSUNA richiesta prima del consenso.
// LIMITE DICHIARATO: la modalità iubenda si prova con un finto script di iubenda (intercetta https://cdn.iubenda.com/cs/iubenda_cs.js e ripete
// quello che la guida di iubenda descrive: al consenso dà a ogni ._iub_cs_activate l'indirizzo di suppressedsrc; il clic su
// .iubenda-cs-preferences-link apre le preferenze). Prova che il nostro markup e il nostro script rispettano quel contratto, non che il
// servizio reale funzioni: quello si controlla una volta con l'account iubenda vero (vedi README).
// Uso: node scripts/e2e-consent.mjs   (opzionale E2E_SHOTS=cartella per le schermate)
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../render/build.mjs';
import { loadData } from '../render/context.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { E2E_SHOTS } = process.env;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const FAKE_IUBENDA = `(function () {
  window.__iubConfig = window._iub && window._iub.csConfiguration;
  function activate() { document.querySelectorAll('._iub_cs_activate').forEach(function (el) { var s = el.getAttribute('suppressedsrc'); if (s) el.setAttribute('src', s); }); }
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('.iubenda-cs-preferences-link'); if (!t) return; e.preventDefault(); activate(); });
})();`;

async function serve(consent) {
  const data = structuredClone(loadData(path.join(ROOT, 'templates/starter')));
  data.site.consent = consent;
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-e2e-consent-')), 'dist');
  await buildSite(data, { outDir: dir, assetsDir: path.join(ROOT, 'templates/starter/assets') });
  const server = http.createServer((req, res) => {
    let f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (f.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const shot = async (pg, name) => { if (E2E_SHOTS) { fs.mkdirSync(E2E_SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(E2E_SHOTS, name + '.png') }); } };
let n = 0; let currentPage = null;
const stop = async (code) => { await browser.close().catch(() => {}); process.exit(code); };
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${++n}. ${name}`); } catch (e) { console.error(`FAIL ${++n}. ${name}\n     ${e.message}`); if (currentPage) await shot(currentPage, `errore-consenso-${n}`); await stop(1); } };

// Apre una pagina con le richieste esterne sotto controllo: registra quelle a Google e risponde al posto di iubenda.
async function open(url, { iubenda = 'fake', viewport = { width: 1300, height: 900 } } = {}) {
  const page = await browser.newPage();
  currentPage = page;
  await page.setViewport(viewport);
  const seen = { google: [], iubenda: [], errors: [] };
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_FAILED/.test(m.text())) seen.errors.push(m.text()); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (/google\.com|gstatic\.com/.test(u)) { seen.google.push(u); r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="margin:0;background:#9c9">mappa finta</body>' }); return; }
    if (u.includes('iubenda.com')) {
      seen.iubenda.push(u);
      if (iubenda === 'fake') r.respond({ status: 200, contentType: 'text/javascript', body: FAKE_IUBENDA }); else r.abort('blockedbyclient');
      return;
    }
    r.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  return { page, seen };
}
const box = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });

// ---- modalità integrata ---------------------------------------------------------------------------------------------------
const builtin = await serve({ provider: 'builtin' });
{
  const { page, seen } = await open(`${builtin.url}/moduli-interni/`);
  let before;

  await step('integrata: aprendo la pagina Google non riceve nessuna richiesta, e al posto della mappa c\'è il riquadro', async () => {
    assert.deepEqual(seen.google, []);
    assert.equal(await page.$eval('[data-map-box]', (e) => e.hidden), false);
    assert.equal(await page.$eval('.map-consent iframe', (e) => e.hidden), true);
    assert.equal(await page.$eval('.map-consent iframe', (e) => e.hasAttribute('src')), false, 'l\'iframe non ha indirizzo');
    assert.match(await page.$eval('[data-map-box]', (e) => e.textContent), /serve il vostro consenso.*Google riceve il vostro indirizzo IP/);
    before = await box(page, '.map-consent');
    assert.ok(before.w > 250 && before.h > 200, `il riquadro occupa lo spazio della mappa (${before.w}x${before.h})`);
    await page.$eval('.map-consent', (e) => e.scrollIntoView({ block: 'center' }));
    await pause(700);
    await shot(page, 'c1-riquadro');
  });

  await step('integrata: il link "Apri in Google Maps" esiste ed è un collegamento normale (nessun caricamento)', async () => {
    const a = await page.$eval('.map-consent__actions a', (e) => ({ href: e.href, target: e.target, rel: e.rel, text: e.textContent }));
    assert.equal(a.href, 'https://www.google.com/maps/search/?api=1&query=Studio+Esempio+Lugano');
    assert.deepEqual([a.target, a.rel, a.text], ['_blank', 'noopener noreferrer', 'Apri in Google Maps']);
    assert.deepEqual(seen.google, []);
  });

  await step('integrata: con la tastiera (Tab, Invio) si mostra la mappa; solo allora parte la richiesta a Google, una volta', async () => {
    await page.focus('[data-map-show]');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-map-show')), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.map-consent iframe')?.hasAttribute('src'));
    await pause(500);
    assert.equal(seen.google.length, 1);
    assert.match(seen.google[0], /^https:\/\/www\.google\.com\/maps\?q=Studio\+Esempio\+Lugano&output=embed$/);
    assert.equal(await page.$eval('[data-map-box]', (e) => e.hidden), true);
    assert.equal(await page.$eval('.map-consent iframe', (e) => e.hidden), false);
    const after = await box(page, '.map-consent');
    assert.ok(Math.abs(after.h - before.h) <= 2 && Math.abs(after.w - before.w) <= 2, `la pagina non "salta": ${before.w}x${before.h} → ${after.w}x${after.h}`);
    const frame = await box(page, '.map-consent iframe');
    assert.ok(frame.w >= after.w - 2 && frame.h >= after.h - 2, 'la mappa riempie lo spazio');
    await shot(page, 'c2-mappa');
  });
  await step('integrata: nessun errore in console', async () => { assert.deepEqual(seen.errors, []); });
  await page.close();

  await step('integrata su telefono: il riquadro sta nello schermo, niente scorrimento orizzontale', async () => {
    const m = await open(`${builtin.url}/moduli-interni/`, { viewport: { width: 390, height: 800 } });
    assert.deepEqual(m.seen.google, []);
    assert.ok(await m.page.evaluate(() => document.documentElement.scrollWidth <= 390), 'nessuno scorrimento orizzontale');
    await m.page.$eval('.map-consent', (e) => e.scrollIntoView({ block: 'center' }));
    await pause(700);
    await shot(m.page, 'c3-telefono');
    assert.equal(await m.page.$eval('[data-map-show]', (b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= 390; }), true);
    await m.page.close();
  });

  await step('integrata: nelle altre pagine nessun collegamento a iubenda, nessuna richiesta a Google', async () => {
    const h = await open(`${builtin.url}/`);
    assert.deepEqual([h.seen.google, h.seen.iubenda, await h.page.$('.iubenda-cs-preferences-link')], [[], [], null]);
    await h.page.close();
  });
}
await builtin.close();

// ---- modalità iubenda ------------------------------------------------------------------------------------------------------
const iub = await serve({ provider: 'iubenda', iubendaSiteId: '1234567', iubendaCookiePolicyId: '7654321' });
{
  const { page, seen } = await open(`${iub.url}/moduli-interni/`);

  await step('iubenda: lo script viene chiesto a iubenda con la configurazione giusta; fino al consenso la mappa è bloccata', async () => {
    assert.equal(seen.iubenda.length, 1);
    assert.equal(seen.iubenda[0], 'https://cdn.iubenda.com/cs/iubenda_cs.js');
    assert.deepEqual(await page.evaluate(() => window.__iubConfig), { siteId: 1234567, cookiePolicyId: 7654321, lang: 'it', storage: { useSiteId: true } });
    assert.deepEqual(seen.google, []);
    assert.equal(await page.$eval('.map-consent iframe', (e) => e.getAttribute('src')), 'about:blank');
    assert.equal(await page.$eval('.map-consent iframe', (e) => e.hidden), true);
    assert.equal(await page.$eval('[data-map-box]', (e) => e.hidden), false);
    assert.equal(await page.$('[data-map-show]'), null, 'con iubenda non c\'è il pulsante integrato');
    await page.$eval('.map-consent', (e) => e.scrollIntoView({ block: 'center' }));
    await pause(700);
    await shot(page, 'c4-iubenda-blocco');
  });

  await step('iubenda: dopo il consenso (qui simulato da iubenda) la mappa si carica e sostituisce il riquadro', async () => {
    await page.click('.map-consent .iubenda-cs-preferences-link');
    await page.waitForFunction(() => document.querySelector('[data-map-box]').hidden === true, { timeout: 5000 });
    await pause(400);
    assert.equal(seen.google.length, 1);
    assert.equal(await page.$eval('.map-consent iframe', (e) => e.hidden), false);
    assert.match(await page.$eval('.map-consent iframe', (e) => e.getAttribute('src')), /^https:\/\/www\.google\.com\/maps\?q=/);
    assert.deepEqual(seen.errors, []);
  });
  await page.close();

  await step('iubenda: il link "Preferenze cookie" c\'è nel footer di ogni pagina', async () => {
    for (const p of ['/', '/contatti/', '/moduli-interni/']) {
      const h = await open(`${iub.url}${p}`);
      assert.equal(await h.page.$eval('.footer a.iubenda-cs-preferences-link', (a) => a.textContent), 'Preferenze cookie', p);
      assert.deepEqual(h.seen.google, [], p);
      await h.page.close();
    }
  });

  await step('iubenda bloccato (ad blocker o rete): la mappa non si carica mai, il riquadro resta e il collegamento esterno funziona', async () => {
    const b = await open(`${iub.url}/moduli-interni/`, { iubenda: 'block' });
    await b.page.click('.map-consent .iubenda-cs-preferences-link');   // non succede nulla: nessuno ascolta il clic
    await pause(600);
    assert.deepEqual(b.seen.google, []);
    assert.equal(await b.page.$eval('[data-map-box]', (e) => e.hidden), false);
    assert.equal(await b.page.$eval('.map-consent__actions a', (a) => a.href), 'https://www.google.com/maps/search/?api=1&query=Studio+Esempio+Lugano');
    assert.deepEqual(b.seen.errors, [], 'nessun errore JavaScript anche senza iubenda');
    await b.page.close();
  });
}
await iub.close();

console.log(`\nfatto: ${n} passi riusciti`);
await stop(0);
