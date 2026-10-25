import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../render/build.mjs';
import { loadData } from '../render/context.mjs';
import { providerOf } from '../render/consent.mjs';
import { validateData } from '../schema/validate.mjs';
import { toPreviewHtml } from '../lib/preview.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TPL = path.join(ROOT, 'templates/starter');
const MAP_PAGE = 'moduli-interni';   // la pagina di starter con il blocco «contacts» e la mappa
const IUBENDA = { provider: 'iubenda', iubendaSiteId: '1234567', iubendaCookiePolicyId: '7654321' };
const withConsent = (consent) => { const d = structuredClone(loadData(TPL)); if (consent === undefined) delete d.site.consent; else d.site.consent = consent; return d; };
const errorsOf = (consent) => validateData(withConsent(consent)).errors;
const build = async (consent) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-consent-')), 'dist');
  await buildSite(withConsent(consent), { outDir: out, assetsDir: path.join(TPL, 'assets') });
  return (p) => fs.readFileSync(path.join(out, p, 'index.html'), 'utf8');
};
// Indirizzi caricati subito dal browser (src, href di stylesheet/script): niente di Google finché non c'è il consenso.
const eagerGoogle = (html) => [...html.matchAll(/\s(?:src|data-preview)="(https?:\/\/[^"]*(?:google|gstatic)[^"]*)"/g)].map((m) => m[1]);

test('integrata: la mappa non ha un indirizzo finché non si clicca, e non c\'è traccia di iubenda', async () => {
  const page = await build({ provider: 'builtin' });
  const html = page(MAP_PAGE);
  assert.deepEqual(eagerGoogle(html), [], 'nessun caricamento da Google all\'apertura della pagina');
  assert.match(html, /<div class="map-consent" data-map-consent="builtin">/);
  assert.match(html, /<iframe class="map"[^>]* data-src="https:\/\/www\.google\.com\/maps\?q=Studio\+Esempio\+Lugano&amp;output=embed"[^>]* hidden><\/iframe>/);
  assert.doesNotMatch(html.match(/<iframe[^>]*>/)[0], /\ssrc=/);
  assert.match(html, /<button type="button" class="btn btn--secondary" data-map-show>Mostra la mappa<\/button>/);
  assert.match(html, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Studio\+Esempio\+Lugano" target="_blank" rel="noopener noreferrer">Apri in Google Maps/);
  for (const p of ['', 'contatti', MAP_PAGE]) assert.doesNotMatch(page(p), /iubenda|_iub|data-cms-consent/i, `pagina "${p || 'home'}"`);
});

test('senza l\'impostazione (siti già esistenti) vale l\'integrata', async () => {
  const page = await build(undefined);
  assert.match(page(MAP_PAGE), /data-map-consent="builtin"/);
  assert.doesNotMatch(page(''), /iubenda/i);
});

test('iubenda: script in testa con i soli numeri validati, mappa bloccata secondo la guida di iubenda, link alle preferenze', async () => {
  const page = await build(IUBENDA);
  const html = page(MAP_PAGE);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<script data-cms-consent>var _iub = _iub \|\| \[\]; _iub\.csConfiguration = \{"siteId":1234567,"cookiePolicyId":7654321,"lang":"it","storage":\{"useSiteId":true\}\};<\/script>/);
  assert.match(head, /<script data-cms-consent src="https:\/\/cdn\.iubenda\.com\/cs\/iubenda_cs\.js" charset="UTF-8" async><\/script>/);
  assert.ok(head.indexOf('_iub.csConfiguration') < head.indexOf('iubenda_cs.js'), 'prima la configurazione, poi lo script');
  assert.ok(html.indexOf('iubenda_cs.js') < html.indexOf('/assets/js/main.js'), 'iubenda arriva prima degli altri script');

  const frame = html.match(/<iframe[^>]*>/)[0];
  assert.match(frame, /class="map _iub_cs_activate"/);
  assert.match(frame, /data-iub-purposes="3"/, 'categoria "Esperienza"');
  assert.match(frame, /suppressedsrc="https:\/\/www\.google\.com\/maps\?q=Studio\+Esempio\+Lugano&amp;output=embed"/);
  assert.match(frame, / src="about:blank"/);
  assert.deepEqual(eagerGoogle(html), [], 'nessun caricamento da Google prima del consenso');
  assert.match(html, /<button type="button" class="btn btn--secondary iubenda-cs-preferences-link">Gestisci le preferenze<\/button>/);
  assert.doesNotMatch(html, /data-map-show/);
  for (const p of ['', 'contatti', MAP_PAGE]) assert.match(page(p), /<a href="#" class="iubenda-cs-preferences-link">Preferenze cookie<\/a>/, `footer di "${p || 'home'}"`);
});

test('schema: con iubenda servono i due numeri, e solo numeri (niente codice incollato)', () => {
  assert.deepEqual(errorsOf({ provider: 'builtin' }), []);
  assert.deepEqual(errorsOf(IUBENDA), []);
  assert.deepEqual(errorsOf({ provider: 'builtin', iubendaSiteId: '1', iubendaCookiePolicyId: '2' }), [], 'i dati di iubenda inutilizzati non danno errore');
  assert.ok(errorsOf({ provider: 'iubenda' }).length, 'iubenda senza i dati');
  assert.ok(errorsOf({ provider: 'iubenda', iubendaSiteId: '123' }).length, 'manca cookiePolicyId');
  for (const bad of ['1};alert(1)//', '<script>', '12 34', '', 'abc', '1e5', '-1', '1234567890123', 123]) {
    assert.ok(errorsOf({ provider: 'iubenda', iubendaSiteId: bad, iubendaCookiePolicyId: '1' }).length, `siteId ${JSON.stringify(bad)}`);
    assert.ok(errorsOf({ provider: 'iubenda', iubendaSiteId: '1', iubendaCookiePolicyId: bad }).length, `cookiePolicyId ${JSON.stringify(bad)}`);
  }
  assert.ok(errorsOf({ provider: 'altro' }).length);
  assert.ok(errorsOf({ ...IUBENDA, script: '<script src=//evil.example></script>' }).length, 'nessun campo libero per codice');
  assert.ok(errorsOf({ provider: 'builtin', extra: 1 }).length);
});

test('se i dati di iubenda mancano, il sito ricade sull\'integrata (mai un banner a metà)', () => {
  const ctx = (consent) => ({ site: { consent } });
  assert.equal(providerOf(ctx(undefined)), 'builtin');
  assert.equal(providerOf(ctx({ provider: 'builtin' })), 'builtin');
  assert.equal(providerOf(ctx({ provider: 'iubenda' })), 'builtin');
  assert.equal(providerOf(ctx(IUBENDA)), 'iubenda');
});

test('anteprima dell\'admin: gli script di iubenda si tolgono, il resto della pagina no', async () => {
  const html = (await build(IUBENDA))(MAP_PAGE);
  const preview = toPreviewHtml(html, loadData(TPL).tokens);
  assert.doesNotMatch(preview, /_iub\.csConfiguration|cdn\.iubenda\.com|data-cms-consent/);
  assert.match(preview, /suppressedsrc=/, 'la mappa resta bloccata anche nell\'anteprima');
  assert.match(preview, /iubenda-cs-preferences-link/);
  assert.match(preview, /<\/head>/);
});
