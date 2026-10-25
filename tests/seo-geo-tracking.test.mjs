// Tag SEO/GEO per pagina, tracciamento globale (Dati del sito), file llms.txt e blocco "Codice HTML": tutto codice ammesso apposta,
// riservato a un admin, che deve uscire nella pagina così com'è (senza sanificazione) e mai finire dove non deve.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { robotsContent, robotsMeta } from '../render/kit.mjs';
import { trackingHead, trackingCss, trackingBodyStart, trackingBodyEnd } from '../render/kit.mjs';
import { buildSite } from '../render/build.mjs';
import { loadData } from '../render/context.mjs';
import { validateData } from '../schema/validate.mjs';
import { unsafeText, deliveryProblem, htmlBlockProblem, allowedCode } from '../lib/content-guard.mjs';
import { stopRenderers } from '../render/host.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TPL = path.join(ROOT, 'templates/starter');
test.after(() => stopRenderers());

// ---- funzioni pure del kit ------------------------------------------------------------------------------------------------------------

test('robotsContent/robotsMeta: un solo <meta>, con i valori giusti (o niente)', () => {
  assert.equal(robotsContent({}), '');
  assert.equal(robotsContent({ noindex: true }), 'noindex');
  assert.equal(robotsContent({ noai: true }), 'noai, noimageai');
  assert.equal(robotsContent({ noindex: true, noai: true }), 'noindex, noai, noimageai');
  assert.equal(String(robotsMeta({})), '');
  assert.equal(String(robotsMeta({ noindex: true, noai: true })), '<meta name="robots" content="noindex, noai, noimageai">');
});

test('tracking*: il codice esce così com\'è (nessuna sanificazione), vuoto se non impostato', () => {
  const ctx = { site: { tracking: { headCode: '<script>a<b</script>', bodyStartCode: '<noscript>x</noscript>', bodyEndCode: '<script>c</script>' } } };
  assert.equal(String(trackingHead(ctx)), '<script>a<b</script>');
  assert.equal(String(trackingBodyStart(ctx)), '<noscript>x</noscript>');
  assert.equal(String(trackingBodyEnd(ctx)), '<script>c</script>');
  assert.equal(String(trackingHead({ site: {} })), '');
  assert.equal(String(trackingBodyStart({ site: {} })), '');
});

test('trackingCss: avvolto in <style>, con un\'uscita di sicurezza per un </style> nel testo', () => {
  assert.equal(String(trackingCss({ site: { tracking: { css: 'a{color:red}' } } })), '<style>a{color:red}</style>');
  assert.equal(String(trackingCss({ site: {} })), '');
  assert.match(String(trackingCss({ site: { tracking: { css: '</style><script>alert(1)</script>' } } })), /^<style><\\\/style><script>alert\(1\)<\/script><\/style>$/);
});

// ---- una pagina vera, nel processo isolato --------------------------------------------------------------------------------------------

const withSite = (patch) => { const d = structuredClone(loadData(TPL)); patch(d); return d; };
const build = async (patch) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-seo-')), 'dist');
  const data = withSite(patch);
  assert.deepEqual(validateData(data).errors, [], 'i dati di prova devono restare validi');
  await buildSite(data, { outDir: out, assetsDir: path.join(TPL, 'assets') });
  return { home: fs.readFileSync(path.join(out, 'index.html'), 'utf8'), out };
};

test('nella pagina vera: tracciamento negli stessi 4 punti, robots per pagina, tipo Open Graph', async () => {
  const { home } = await build((d) => {
    d.site.tracking = { headCode: '<script>console.log("head")</script>', css: '.x{color:red}', bodyStartCode: '<noscript>ns</noscript>', bodyEndCode: '<script>console.log("end")</script>' };
    d.pages.find((p) => p.key === 'home').noai = true;
    d.pages.find((p) => p.key === 'home').ogType = 'article';
  });
  // headCode subito dopo il viewport, prima del titolo; bodyStartCode subito dopo <body>; bodyEndCode dopo gli script del template, prima di </body>
  assert.match(home, /<meta name="viewport"[^>]*>\s*<script>console\.log\("head"\)<\/script><title>/);
  assert.match(home, /<body>\s*<noscript>ns<\/noscript><a class="skip"/);
  assert.match(home, /<script src="\/assets\/js\/mm\.js" defer><\/script>\s*<script>console\.log\("end"\)<\/script><\/body>/);
  assert.match(home, /<style>\.x\{color:red\}<\/style>\s*<\/head>/, 'trackingCss per ultimo, dopo il resto della testa');
  assert.match(home, /<meta name="robots" content="noai, noimageai">/);
  assert.match(home, /<meta property="og:type" content="article">/);
});

test('senza tracciamento impostato: nessuna traccia nell\'HTML', async () => {
  const { home } = await build(() => {});
  assert.doesNotMatch(home, /<script>console|noscript|tracking/i);
});

test('llms.txt: pubblicato solo se il testo non è vuoto, così com\'è scritto', async () => {
  const withText = await build((d) => { d.site.geo = { llmsText: '# Prova\n\nTesto.' }; });
  assert.equal(fs.readFileSync(path.join(withText.out, 'llms.txt'), 'utf8'), '# Prova\n\nTesto.\n');
  const withoutText = await build((d) => { delete d.site.geo; });   // i contenuti di esempio hanno già un testo: qui si prova il caso vuoto
  assert.equal(fs.existsSync(path.join(withoutText.out, 'llms.txt')), false, 'senza testo, nessun file');
});

test('blocco "Codice HTML": esce così com\'è nella pagina, anche via blocco condiviso', async () => {
  const raw = '<div class="widget" data-x="1"><script>track()</script></div>';
  const direct = await build((d) => { d.pages.find((p) => p.key === 'home').blocks.push({ id: 'demo-html', type: 'html', surface: 'light', anchor: 'demo-html', html: raw }); });
  assert.match(direct.home, /<section class="html-block" data-surface="light" id="demo-html">.*<\/section>/s);
  assert.ok(direct.home.includes(raw), 'il codice non viene alterato né sanificato');
  const shared = await build((d) => {
    d.shared['demo-shared-html'] = { id: 'demo-shared-html', type: 'html', surface: 'light', html: raw };
    d.pages.find((p) => p.key === 'home').blocks.push({ id: 'ref-html', type: 'shared', ref: 'demo-shared-html' });
  });
  assert.ok(shared.home.includes(raw), 'anche passando da un blocco condiviso');
});

// ---- controlli lato server: solo un admin scrive codice -------------------------------------------------------------------------------

test('unsafeText: i campi di codice del sito sono ammessi solo se dichiarati (kind "site"), non altrove', () => {
  const withHead = { tracking: { headCode: '<script>x</script>' } };
  assert.equal(unsafeText(withHead, allowedCode('site')), null, 'esentato per kind site');
  assert.equal(unsafeText(withHead), '/tracking/headCode', 'senza il predicato, resta vietato');
  assert.equal(unsafeText(withHead, allowedCode('page')), '/tracking/headCode', 'un altro kind non lo esenta');
  const geo = { geo: { llmsText: '<script>x</script>' } };
  assert.equal(unsafeText(geo, allowedCode('site')), null);
});

test('unsafeText: il campo "html" di un blocco "html" è ammesso; lo stesso testo altrove no', () => {
  const okBlock = { blocks: [{ id: 'a', type: 'html', html: '<script>x</script>' }] };
  assert.equal(unsafeText(okBlock, allowedCode('page')), null);
  const wrongType = { blocks: [{ id: 'a', type: 'rich-text', html: '<script>x</script>' }] };
  assert.equal(unsafeText(wrongType, allowedCode('page')), '/blocks/0/html', 'solo un blocco davvero di tipo "html"');
  const otherField = { blocks: [{ id: 'a', type: 'html', html: 'ok', extra: '<script>x</script>' }] };
  assert.equal(unsafeText(otherField, allowedCode('page')), '/blocks/0/extra', 'solo il campo "html", non altri campi dello stesso blocco');
});

test('controllo lato server: il codice di un blocco HTML lo scrive o lo cambia solo un admin', () => {
  const block = (html, id = 'h1') => ({ id, type: 'html', html, surface: 'light' });
  const old = { key: 'p', blocks: [block('<p>vecchio</p>')] };
  assert.equal(htmlBlockProblem('page', structuredClone(old), old), null, 'invariato');
  assert.match(htmlBlockProblem('page', { key: 'p', blocks: [block('<p>nuovo</p>')] }, old), /cambiare il codice/);
  assert.match(htmlBlockProblem('page', { key: 'p', blocks: [...old.blocks, block('<p>x</p>', 'h2')] }, old), /aggiungere un blocco/);
  assert.equal(htmlBlockProblem('page', { key: 'p', blocks: [] }, old), null, 'togliere il blocco non è un cambio di codice');
  const shared = { m: block('<p>vecchio</p>') };
  assert.match(htmlBlockProblem('shared', { m: block('<p>nuovo</p>') }, shared), /cambiare il codice/);
  assert.match(htmlBlockProblem('page', { key: 'p', blocks: [block('<p>x</p>')] }, undefined), /aggiungere un blocco/);
  // un blocco di un altro tipo, anche con un campo "html", non lo riguarda
  assert.equal(htmlBlockProblem('page', { key: 'p', blocks: [{ id: 'f1', type: 'form', html: 'x' }] }, { key: 'p', blocks: [] }), null);
});

test('deliveryProblem continua a funzionare dopo la fattorizzazione con htmlBlockProblem', () => {
  const form = (delivery, id = 'f1') => ({ id, type: 'form', delivery });
  const old = { key: 'p', blocks: [form({ recipients: ['a@x.ch'], subject: 'S' })] };
  assert.equal(deliveryProblem('page', structuredClone(old), old), null);
  assert.match(deliveryProblem('page', { key: 'p', blocks: [form({ recipients: ['evil@x.ch'], subject: 'S' })] }, old), /destinatari/);
});
