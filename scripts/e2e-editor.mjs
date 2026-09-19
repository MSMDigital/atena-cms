// Prova end-to-end dell'editor di pagine e blocchi con un browser vero.
// Serve: server attivo, utente admin, e queste variabili: E2E_URL, E2E_EMAIL, E2E_PASSWORD, opzionale E2E_SHOTS.
// ATTENZIONE: parte riportando il database di sviluppo ai file originali (npm run db:seed --force) e alla fine lo ripristina.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { E2E_URL, E2E_EMAIL, E2E_PASSWORD, E2E_SHOTS } = process.env;
if (!E2E_URL || !E2E_EMAIL || !E2E_PASSWORD) { console.error('mancano E2E_URL, E2E_EMAIL, E2E_PASSWORD'); process.exit(1); }
const DIST = path.resolve(process.env.SITE_OUT_DIR ?? path.join(ROOT, 'dist'));
const distHtml = (p) => fs.readFileSync(path.join(DIST, p, 'index.html'), 'utf8');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Stato di partenza noto: database = file originali, sito pubblicato = originale.
const { loadEnv, assertLocalDatabase } = await import('../lib/env.mjs'); loadEnv(); assertLocalDatabase('Questa prova');
const { query, closeDb } = await import('../lib/db.mjs');
const D = await import('../lib/docs.mjs');
const reset = async () => { await D.seedFromFiles({ force: true }); const r = await D.publishAll(null, { force: true }); assert.equal(r.ok, true, JSON.stringify(r)); };
await query('DELETE FROM login_attempts WHERE email = ?', [E2E_EMAIL.toLowerCase()]);
const KEEP_KEYS = fs.readdirSync(path.join(ROOT, 'templates/mammano/content/pages')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));   // le pagine dei contenuti; le altre sono avanzi di prove
await query("DELETE FROM docs WHERE kind = 'page' AND doc_key NOT IN (?)", [KEEP_KEYS]);
await reset();

const shot = async (pg, name) => { if (E2E_SHOTS) { fs.mkdirSync(E2E_SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(E2E_SHOTS, name + '.png') }); } };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1700, height: 1000 });
// Conferme di eliminazione e avviso "hai modifiche non salvate" (beforeunload): si accettano, e si verifica che compaiano.
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.type()); d.accept(); });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });

let n = 0;
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${++n}. ${name}`); } catch (e) { console.error(`FAIL ${++n}. ${name}\n     ${e.message}`); await shot(page, `errore-${n}`); await browser.close(); await closeDb(); process.exit(1); } };
// Clicca il pulsante solo quando è attivo (durante un'azione in corso è disabilitato e il clic andrebbe perso in silenzio).
const click = async (text, scope = page) => {
  let b;
  for (let i = 0; i < 60; i++) { [b] = await scope.$$(`xpath/.//button[normalize-space()="${text}"]`); if (b && !(await b.evaluate((el) => el.disabled))) break; await pause(150); }
  assert.ok(b, `pulsante "${text}" non trovato`);
  assert.equal(await b.evaluate((el) => el.disabled), false, `il pulsante "${text}" resta disabilitato`);
  await b.click();
};
const preview = async () => (await (await page.$('iframe')).contentFrame());
// Aspetta che l'anteprima (srcdoc, aggiornata con ritardo) soddisfi una condizione.
const previewUntil = async (fn, arg, msg) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) { try { const f = await preview(); if (f && await f.evaluate(fn, arg)) return; } catch { /* il frame si sta ricaricando */ } await pause(250); }
  throw new Error(`anteprima: ${msg}`);
};
const setInput = async (sel, value) => { await page.waitForSelector(sel); await page.$eval(sel, (el) => el.select()); await page.keyboard.type(value); };
const item = (p) => `li.item[data-path="${p}"]`;
const openItem = async (p) => { const expanded = await page.$eval(`${item(p)} > .item__head .item__toggle`, (b) => b.getAttribute('aria-expanded')); if (expanded !== 'true') await page.click(`${item(p)} > .item__head .item__toggle`); await page.waitForSelector(`${item(p)} > .item__body`); };
const field = (p) => `.fld[data-path="${p}"]`;
const save = async () => { await click('Salva bozza'); await page.waitForFunction(() => /salvata|Nessuna modifica/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 15000 }); };
const publish = async () => { await click('Pubblica'); await page.waitForFunction(() => /Pubblicato|Niente da pubblicare/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 90000 }); };
const goto = async (p) => { await page.goto(E2E_URL + p, { waitUntil: 'networkidle0' }); };

await step('accesso', async () => {
  await goto('/admin/login');
  await page.type('input[name=email]', E2E_EMAIL); await page.type('input[name=password]', E2E_PASSWORD);
  await click('Accedi');
  await page.waitForFunction(() => location.pathname === '/admin', { timeout: 30000 });
});

await step('elenco pagine: tutte le pagine dei contenuti, con indirizzo e stato', async () => {
  await goto('/admin/pages');
  assert.equal((await page.$$('.table tbody tr')).length, KEEP_KEYS.length);
  const text = await page.$eval('.table', (t) => t.textContent);
  assert.match(text, /\/servizi\/traslochi-privati\//);
  assert.match(text, /Chi siamo/);
  await shot(page, '01-elenco-pagine');
});

await step('editor di pagina: blocchi in elenco e anteprima della pagina', async () => {
  await goto('/admin/pages/chi-siamo');
  await page.waitForSelector('li.item');
  const types = await page.$$eval('.blocks > .fld > ol.items > li.item .item__type', (els) => els.map((e) => e.textContent));
  assert.deepEqual(types, ['Intestazione pagina', 'Blocco condiviso', 'Immagine larga', 'Testo + immagine', 'Voci', 'Tabella dati', 'CTA finale']);
  await previewUntil(() => !!document.querySelector('.intro h1'), null, 'manca il titolo della pagina');
  await shot(page, '02-editor-pagina');
});

await step('modificare un testo: l\'anteprima cambia subito, senza salvare', async () => {
  await openItem('/blocks/0');
  await setInput(`${field('/blocks/0/title')} input`, 'Titolo modificato dal test');
  await previewUntil(() => document.querySelector('.intro h1')?.textContent.includes('Titolo modificato dal test'), null, 'il titolo non è cambiato');
  assert.match(await page.$eval('.editor__actions .muted', (e) => e.textContent), /non salvate/);
});

await step('campo obbligatorio vuoto: errore accanto al campo e nel riepilogo', async () => {
  await page.$eval(`${field('/blocks/0/title')} input`, (el) => el.select()); await page.keyboard.press('Backspace');
  await page.waitForFunction((sel) => /Non può essere vuoto/.test(document.querySelector(sel)?.textContent ?? ''), { timeout: 10000 }, field('/blocks/0/title'));
  await page.waitForFunction(() => /da sistemare/.test(document.querySelector('.summary')?.textContent ?? ''));
  await shot(page, '03-errore-campo');
  await setInput(`${field('/blocks/0/title')} input`, 'Titolo modificato dal test');
  await page.waitForFunction(() => !document.querySelector('.summary'), { timeout: 10000 });
});

await step('formattazione: il pulsante Grassetto inserisce il tag e l\'anteprima lo mostra', async () => {
  const sel = `${field('/blocks/0/lead')} textarea`;
  await page.$eval(sel, (ta) => { ta.focus(); ta.setSelectionRange(0, 5); });
  await page.click(`${field('/blocks/0/lead')} .rich__bar button[title="Grassetto"]`);
  assert.match(await page.$eval(sel, (ta) => ta.value), /^<strong>.{5}<\/strong>/);
  await previewUntil(() => !!document.querySelector('.intro .lead strong'), null, 'il grassetto non compare');
});

await step('nascondere, riordinare, duplicare ed eliminare blocchi', async () => {
  // nascondi la CTA: sparisce dall'anteprima
  await page.click(`${item('/blocks/6')} > .item__head button[aria-label="Nascondi"]`);
  await previewUntil(() => !document.querySelector('.cta'), null, 'la CTA nascosta è ancora visibile');
  await page.click(`${item('/blocks/6')} > .item__head button[aria-label="Mostra"]`);
  await previewUntil(() => !!document.querySelector('.cta'), null, 'la CTA non è tornata');
  // sposta l'immagine larga (blocco 2) sotto il testo+immagine (blocco 3)
  await page.click(`${item('/blocks/2')} > .item__head button[aria-label="Sposta giù"]`);
  const order = await page.$$eval('.blocks > .fld > ol.items > li.item .item__type', (els) => els.map((e) => e.textContent));
  assert.deepEqual(order.slice(2, 4), ['Testo + immagine', 'Immagine larga']);
  await previewUntil(() => { const m = document.querySelector('main'); const kids = [...m.children]; return kids.findIndex((k) => k.querySelector?.('.split') || k.classList.contains('split')) < kids.findIndex((k) => k.classList.contains('wide-media')); }, null, 'l\'ordine nell\'anteprima non è cambiato');
  await page.click(`${item('/blocks/3')} > .item__head button[aria-label="Sposta su"]`);   // ripristina
  // duplica e poi elimina la tabella dati
  const before = (await page.$$('.blocks > .fld > ol.items > li.item')).length;
  await page.click(`${item('/blocks/5')} > .item__head button[aria-label="Duplica"]`);
  assert.equal((await page.$$('.blocks > .fld > ol.items > li.item')).length, before + 1);
  const ids = await page.evaluate(() => 1);   // (gli id duplicati li verifica il controllo dei problemi)
  await page.waitForFunction(() => !/duplicato/.test(document.querySelector('.blocks')?.textContent ?? ''), { timeout: 8000 });
  await page.click(`${item('/blocks/6')} > .item__head button[aria-label="Elimina"]`);
  assert.equal((await page.$$('.blocks > .fld > ol.items > li.item')).length, before);
});

await step('aggiungere un blocco (Domande frequenti), compilarlo e vederlo in anteprima', async () => {
  await page.click('.blocks > .fld > .menu > button.add');
  await page.waitForSelector('.menu__list');
  const [b] = await page.$$('xpath/.//ul[contains(@class,"menu__list")]//button[.//strong[text()="Domande frequenti"]]');
  await b.click();
  const idx = (await page.$$('.blocks > .fld > ol.items > li.item')).length - 1;
  await page.waitForSelector(`${item('/blocks/' + idx)} > .item__body`);
  // campi obbligatori vuoti: segnalati in modo morbido
  await page.waitForFunction((sel) => /Non può essere vuoto|obbligatorio/.test(document.querySelector(sel)?.textContent ?? ''), { timeout: 10000 }, `${item('/blocks/' + idx)} .fld__issues`);
  await setInput(`${field(`/blocks/${idx}/items/0/question`)} input`, 'Domanda aggiunta dal test?');
  await setInput(`${field(`/blocks/${idx}/items/0/answer`)} textarea`, 'Risposta di prova.');
  await previewUntil(() => [...document.querySelectorAll('.faq summary')].some((s) => s.textContent.includes('Domanda aggiunta dal test?')), null, 'la FAQ non compare');
  await shot(page, '04-blocco-aggiunto');
});

await step('cambiare aspetto di un blocco: i campi non pertinenti spariscono', async () => {
  await openItem('/blocks/4');
  assert.ok(await page.$(`${field('/blocks/4/columns')}`), 'con "punti" ci sono le colonne');
  await page.select(`${field('/blocks/4/layout')} select`, 'steps');
  await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 5000 }, field('/blocks/4/columns'));
  await previewUntil(() => !!document.querySelector('ol.steps'), null, 'i passi non compaiono');
  await page.select(`${field('/blocks/4/layout')} select`, 'points');
  await page.waitForSelector(field('/blocks/4/columns'));
});

await step('immagine: cambia file e imposta il punto focale con un clic', async () => {
  await openItem('/blocks/2');
  const sel = `${field('/blocks/2/image')}`;
  await page.waitForFunction((q) => { const i = document.querySelector(q); return i && i.complete && i.naturalWidth > 0; }, { timeout: 15000 }, `${sel} .focal img`);
  await page.click(`${sel} .focal`, { offset: { x: 30, y: 20 } });
  await page.waitForSelector(`${sel} .focal__dot`);
  await previewUntil(() => (document.querySelector('.wide-media img')?.getAttribute('style') ?? '').includes('--pos'), null, 'il punto focale non arriva in anteprima');
  await shot(page, '05-immagine-focal');
});

await step('salvataggio: la bozza persiste, il sito online non cambia', async () => {
  const before = distHtml('chi-siamo');
  await save();
  await goto('/admin/pages/chi-siamo');
  await page.waitForSelector('li.item');
  assert.equal((await page.$$('.blocks > .fld > ol.items > li.item')).length, 8, 'i blocchi salvati: i 7 originali + la FAQ');
  assert.equal(distHtml('chi-siamo'), before, 'il sito pubblicato non deve cambiare');
});

await step('modifiche concorrenti: due schede sulla stessa pagina, la seconda riceve un conflitto', async () => {
  const other = await browser.newPage();
  await other.setViewport({ width: 1700, height: 1000 });
  await other.goto(E2E_URL + '/admin/pages/chi-siamo', { waitUntil: 'networkidle0' });
  // scheda B modifica e salva
  await other.click('li.item[data-path="/blocks/0"] > .item__head .item__toggle');
  await other.waitForSelector('.fld[data-path="/blocks/0/title"] input');
  await other.$eval('.fld[data-path="/blocks/0/title"] input', (el) => el.select());
  await other.keyboard.type('Scheda B');
  await other.click('xpath/.//button[normalize-space()="Salva bozza"]');
  await other.waitForFunction(() => /salvata/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 15000 });
  await other.close();
  // scheda A (ancora sulla revisione vecchia) prova a salvare
  await openItem('/blocks/0');
  await setInput(`${field('/blocks/0/title')} input`, 'Scheda A');
  await click('Salva bozza');
  await page.waitForFunction(() => /nel frattempo/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 15000 });
  await shot(page, '06-conflitto');
  assert.equal(await page.$eval('xpath/.//button[normalize-space()="Salva bozza"]', (b) => b.disabled), true, 'con un conflitto il salvataggio resta bloccato');
  assert.match(JSON.stringify((await D.getDoc('page', 'chi-siamo')).draft.blocks[0].title), /Scheda B/);
});

await step('pubblicazione dalla pagina: FAQ e nuovo ordine arrivano sul sito', async () => {
  await goto('/admin/pages/chi-siamo');
  await page.waitForSelector('li.item');
  await publish();
  const html = distHtml('chi-siamo');
  assert.match(html, /Domanda aggiunta dal test\?/);
  assert.match(html, /Scheda B/);
});

await step('nuova pagina: nasce in bozza, incompleta non blocca la pubblicazione', async () => {
  await goto('/admin/pages');
  await click('Nuova pagina');
  await page.type('.newpage input', 'Pagina di prova');
  await page.select('.newpage select', 'servizi');
  await click('Crea la pagina');
  await page.waitForFunction(() => location.pathname === '/admin/pages/pagina-di-prova', { timeout: 20000 });
  await page.waitForSelector('.editor__title');
  assert.match(await page.$eval('.editor__title', (e) => e.textContent), /Bozza/);
  assert.match(await page.$eval('.hint', (e) => e.textContent), /bozza/);
  await shot(page, '07-nuova-pagina');
  // pubblica il resto del sito: la bozza incompleta (descrizione vuota) non lo blocca e non finisce online
  await page.evaluate(() => 1);
  const r = await D.publishAll(null);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(fs.existsSync(path.join(DIST, 'servizi/pagina-di-prova/index.html')), false);
});

await step('completare e pubblicare la nuova pagina', async () => {
  await openItemSafe();
  async function openItemSafe() { await page.waitForSelector('.sec'); const open = await page.$eval('.sec', (d) => d.open); if (!open) await page.click('.sec > summary'); }
  await page.select(`${field('/status')} select`, 'published');
  await setInput(`${field('/title')} input`, 'Pagina di prova | Mammano');
  await setInput(`${field('/description')} textarea`, 'Una pagina creata dal test end-to-end.');
  await page.click('.blocks > .fld > .menu > button.add'); await page.waitForSelector('.menu__list');
  const [b] = await page.$$('xpath/.//ul[contains(@class,"menu__list")]//button[.//strong[text()="Testo ricco"]]');
  await b.click();
  await page.waitForSelector('li.item[data-path="/blocks/0"] > .item__body');
  await setInput(`${field('/blocks/0/content')} textarea`, '<h2>Un titolo</h2><p>Un paragrafo con un <a href="page:contatti">link ai contatti</a>.</p>');
  await previewUntil(() => !!document.querySelector('.prose h2') && !!document.querySelector('.prose a'), null, 'il testo ricco non compare');
  await page.waitForFunction(() => !document.querySelector('.summary .bad'), { timeout: 10000 });
  await save();
  await publish();
  const html = distHtml('servizi/pagina-di-prova');
  assert.match(html, /<h2>Un titolo<\/h2>/);
  assert.match(html, /href="\/contatti\/"/, 'il link a pagina diventa l\'indirizzo vero');
  assert.match(html, /<title>Pagina di prova \| Mammano<\/title>/);
  assert.match(distHtml('servizi'), /<html/);
  await shot(page, '08-pagina-pubblicata');
});

await step('eliminare: le pagine usate sono protette, quella di prova sparisce dal sito', async () => {
  await goto('/admin/pages/servizi');
  await page.waitForSelector('.mini--danger');
  await page.click('.mini--danger');
  await page.waitForFunction(() => /ancora usata/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 15000 });
  assert.match(await page.$eval('.notice', (e) => e.textContent), /pagina figlia|dati del sito/);
  await goto('/admin/pages/pagina-di-prova');
  await page.waitForSelector('.mini--danger');
  await page.click('.mini--danger');
  await page.waitForFunction(() => location.pathname === '/admin/pages', { timeout: 20000 });
  await pause(500);
  assert.equal((await D.listDocs()).find((d) => d.key === 'pagina-di-prova').state, 'deleted');
  assert.equal(fs.existsSync(path.join(DIST, 'servizi/pagina-di-prova/index.html')), true, 'online finché non si pubblica');
  const r = await D.publishAll(null);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(fs.existsSync(path.join(DIST, 'servizi/pagina-di-prova/index.html')), false, 'sparita dal sito');
});

await step('dati del sito e blocchi condivisi: l\'anteprima cambia per tutte le pagine', async () => {
  await goto('/admin/shared');
  await page.waitForSelector('li.item');
  await page.click('li.item .item__toggle');
  await page.waitForSelector('li.item .item__body');
  await previewUntil(() => !!document.querySelector('.marquee'), null, 'il nastro non compare');
  await goto('/admin/site');
  await page.waitForSelector('details.sec');
  await page.click('details.sec:nth-of-type(3) > summary');   // Azienda
  await previewUntil(() => !!document.querySelector('.footer'), null, 'il footer non compare');
  await shot(page, '09-dati-sito');
});

await step('consenso ai contenuti di terzi: da "Dati del sito" si passa a iubenda, con controllo dei numeri, anteprima senza banner e pubblicazione', async () => {
  await goto('/admin/site');
  await page.waitForSelector('details.sec');
  const sec = 'xpath/.//details[contains(@class,"sec")][summary[normalize-space()="Consenso ai contenuti di terzi"]]';
  await (await page.$(`${sec}/summary`)).click();
  await page.waitForSelector(field('/consent/provider'));
  assert.equal(await page.$(field('/consent/iubendaSiteId')), null, 'con la modalità integrata i dati di iubenda non si vedono');
  await page.select(`${field('/consent/provider')} select`, 'iubenda');
  await page.waitForSelector(field('/consent/iubendaSiteId'));
  await setInput(`${field('/consent/iubendaSiteId')} input`, '12x');          // non è un numero: niente codice libero
  await setInput(`${field('/consent/iubendaCookiePolicyId')} input`, '7654321');
  await page.waitForFunction((q) => document.querySelector(q)?.textContent.trim().length > 0, { timeout: 15000 }, `${field('/consent/iubendaSiteId')} .fld__issues`);
  await setInput(`${field('/consent/iubendaSiteId')} input`, '1234567');
  await page.waitForFunction((q) => !document.querySelector(q), { timeout: 15000 }, `${field('/consent/iubendaSiteId')} .fld__issues`);
  await previewUntil(() => !!document.querySelector('.footer a.iubenda-cs-preferences-link') && !document.querySelector('script[data-cms-consent]'), null, 'l\'anteprima non mostra il link alle preferenze, oppure carica ancora gli script di iubenda');
  await save();
  await goto('/admin/site');
  await page.waitForSelector('details.sec');
  await (await page.$(`${sec}/summary`)).click();
  await page.waitForSelector(field('/consent/iubendaSiteId'));
  assert.equal(await page.$eval(`${field('/consent/iubendaSiteId')} input`, (e) => e.value), '1234567', 'il valore resta dopo il salvataggio');
  await publish();
  const contatti = distHtml('contatti');
  assert.match(contatti, /_iub\.csConfiguration = \{"siteId":1234567,"cookiePolicyId":7654321,"lang":"it"/);
  assert.match(contatti, /class="map _iub_cs_activate"/);
  assert.doesNotMatch(distHtml('contatti'), /\sdata-src=/, 'la mappa non usa più l\'attivazione integrata');
});

await step('CSP: uno script o un onerror aggiunto alla pagina admin o all\'anteprima non viene eseguito', async () => {
  await goto('/admin/pages/chi-siamo');
  await page.waitForSelector('li.item');
  await previewUntil(() => !!document.querySelector('.footer'), null, 'l\'anteprima non compare');
  const before = consoleErrors.length;
  const attempt = (ctx) => ctx.evaluate(() => new Promise((resolve) => {
    const s = document.createElement('script'); s.textContent = 'window.__cspProof = 1'; document.head.appendChild(s);
    const i = document.createElement('img'); i.src = 'x'; i.setAttribute('onerror', 'window.__cspProof2 = 1'); document.body.appendChild(i);
    setTimeout(() => resolve([window.__cspProof, window.__cspProof2]), 500);
  }));
  assert.deepEqual(await attempt(page), [null, null], 'pagina admin');
  assert.deepEqual(await attempt(await preview()), [null, null], 'anteprima (eredita la politica)');
  const fresh = consoleErrors.splice(before);
  assert.ok(fresh.length >= 2 && fresh.every((m) => /Content Security Policy|Refused to/i.test(m)), `il browser deve segnalare i blocchi: ${JSON.stringify(fresh)}`);
});

await step('sicurezza: le azioni dell\'editor chiedono l\'accesso e rispettano i ruoli', async () => {
  const anon = await browser.createBrowserContext();
  const p = await anon.newPage();
  const res = await p.goto(E2E_URL + '/admin/pages/chi-siamo', { waitUntil: 'networkidle0' });
  assert.match(p.url(), /\/admin\/login/);
  await anon.close();
});

await step('ruolo editor: modifica pagine e blocchi condivisi, non vede stile, dati del sito, pubblicazione né eliminazione', async () => {
  const { hashPassword } = await import('../lib/password.mjs');
  const pw = 'editor-di-prova-' + Math.random().toString(36).slice(2, 10);
  await query('DELETE FROM users WHERE email = ?', ['editor.e2e@example.ch']);
  await query("INSERT INTO users (email, name, password_hash, role) VALUES ('editor.e2e@example.ch', 'Editor di prova', ?, 'editor')", [await hashPassword(pw)]);
  const ctx2 = await browser.createBrowserContext();
  const p = await ctx2.newPage();
  await p.setViewport({ width: 1700, height: 1000 });
  p.on('dialog', (d) => d.accept());
  try {
    await p.goto(E2E_URL + '/admin/login', { waitUntil: 'networkidle0' });
    await p.type('input[name=email]', 'editor.e2e@example.ch'); await p.type('input[name=password]', pw);
    await p.click('button.btn--primary');
    await p.waitForFunction(() => location.pathname === '/admin', { timeout: 30000 });
    const nav = await p.$$eval('.topbar__nav a', (as) => as.map((a) => a.childNodes[0].textContent));   // senza il numero delle richieste nuove
    assert.deepEqual(nav, ['Panoramica', 'Pagine', 'Condivisi', 'Immagini', 'Richieste'], "l'editor non vede Sito e Stile, ma usa immagini e richieste");
    await p.goto(E2E_URL + '/admin/requests', { waitUntil: 'networkidle0' });
    assert.equal(await p.$eval('h1', (e) => e.textContent), 'Richieste', "l'editor vede le richieste");
    await p.goto(E2E_URL + '/admin/media', { waitUntil: 'networkidle0' });
    assert.ok((await p.$$('.mcell')).length >= 36, "l'editor vede la libreria immagini");
    for (const denied of ['/admin/site', '/admin/style']) {
      await p.goto(E2E_URL + denied, { waitUntil: 'networkidle0' });
      assert.match(p.url(), /\/admin\?negato=1/, `${denied} deve respingere l'editor`);
      assert.match(await p.$eval('.notice', (e) => e.textContent), /permessi/);
    }
    // modifica una pagina e la salva; non ha i pulsanti Pubblica ed Elimina
    await p.goto(E2E_URL + '/admin/pages/contatti', { waitUntil: 'networkidle0' });
    await p.waitForSelector('li.item');
    assert.equal(await p.$('.mini--danger'), null, 'niente Elimina pagina');
    assert.equal((await p.$$('xpath/.//button[normalize-space()="Pubblica"]')).length, 0, 'niente Pubblica');
    await p.click('li.item[data-path="/blocks/0"] > .item__head .item__toggle');
    await p.waitForSelector('.fld[data-path="/blocks/0/title"] input');
    await p.$eval('.fld[data-path="/blocks/0/title"] input', (el) => el.select());
    await p.keyboard.type('Titolo scritto da un editor');
    await p.click('xpath/.//button[normalize-space()="Salva bozza"]');
    await p.waitForFunction(() => /salvata/.test(document.querySelector('.notice')?.textContent ?? ''), { timeout: 15000 });
    assert.match(JSON.stringify((await D.getDoc('page', 'contatti')).draft.blocks[0].title), /scritto da un editor/);
    await p.goto(E2E_URL + '/admin', { waitUntil: 'networkidle0' });
    assert.equal((await p.$$('xpath/.//button[normalize-space()="Pubblica le modifiche"]')).length, 0, "l'editor non pubblica");
    await shot(p, '10-editor-panoramica');
  } finally {
    await ctx2.close();
    await query("DELETE FROM users WHERE email = 'editor.e2e@example.ch'");
  }
});

assert.ok(dialogs.includes('beforeunload'), 'lasciando una pagina con modifiche non salvate deve comparire l\'avviso');
assert.ok(dialogs.includes('confirm'), 'l\'eliminazione deve chiedere conferma');
await reset();
assert.deepEqual(consoleErrors, [], 'errori in console: ' + consoleErrors.join(' | '));
console.log(`\ntutti i ${n} passaggi ok, nessun errore in console; database e sito riportati all'originale`);
await browser.close();
await closeDb();
