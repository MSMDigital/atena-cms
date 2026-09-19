import test from 'node:test';
import assert from 'node:assert/strict';
import { toPreviewHtml } from '../lib/preview.mjs';
import { signPreviewPath, verifyPreviewToken } from '../lib/preview-token.mjs';
import { loadData } from '../render/context.mjs';

process.env.SETTINGS_SECRET = 'chiave-di-prova-per-i-token-1234';
const tokens = loadData(new URL('../templates/mammano', import.meta.url).pathname).tokens;

test('token dell\'anteprima: valido per quel file, a scadenza, non falsificabile', () => {
  const t = signPreviewPath('uploads/foto-abc.webp');
  assert.equal(verifyPreviewToken('uploads/foto-abc.webp', t), true);
  assert.equal(verifyPreviewToken('uploads/altra-def.webp', t), false, 'un token vale per un solo file');
  assert.equal(verifyPreviewToken('uploads/foto-abc.webp', t.replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false);
  const [exp, mac] = t.split('.');
  assert.equal(verifyPreviewToken('uploads/foto-abc.webp', `${Number(exp) + 1}.${mac}`), false, 'la scadenza non si cambia');
  const expired = signPreviewPath('uploads/foto-abc.webp', -1000);
  assert.equal(verifyPreviewToken('uploads/foto-abc.webp', expired), false);
  for (const bad of ['', undefined, null, 'x', '1.2', `${exp}.${'z'.repeat(32)}`]) assert.equal(verifyPreviewToken('uploads/foto-abc.webp', bad), false, String(bad));
  const other = process.env.SETTINGS_SECRET; process.env.SETTINGS_SECRET = 'un-altra-chiave-lunga-e-diversa-99';
  try { assert.equal(verifyPreviewToken('uploads/foto-abc.webp', t), false, 'con un\'altra chiave non vale'); } finally { process.env.SETTINGS_SECRET = other; }
});

test('senza chiavi non si emettono token (le immagini caricate non si vedono, ma nulla si apre)', () => {
  const a = process.env.SETTINGS_SECRET; const b = process.env.IP_HASH_SECRET; delete process.env.SETTINGS_SECRET; delete process.env.IP_HASH_SECRET;
  try { assert.equal(signPreviewPath('uploads/x.webp'), null); assert.equal(verifyPreviewToken('uploads/x.webp', '9999999999999.' + 'a'.repeat(32)), false); }
  finally { process.env.SETTINGS_SECRET = a; if (b !== undefined) process.env.IP_HASH_SECRET = b; }
});

test('anteprima: le immagini caricate ricevono il token, quelle del template no', () => {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="/assets/css/tokens.css"><link rel="stylesheet" href="/assets/css/fonts.css"></head><body><img src="/assets/img/uploads/foto-abc.webp"><img src="/assets/img/hero-mammano.jpg"></body></html>';
  const out = toPreviewHtml(html, tokens);
  assert.match(out, /src="\/admin\/preview-assets\/img\/uploads\/foto-abc\.webp\?t=\d{13}\.[0-9a-f]{32}"/);
  assert.match(out, /src="\/admin\/preview-assets\/img\/hero-mammano\.jpg"/);
  const t = out.match(/foto-abc\.webp\?t=([^"]+)"/)[1];
  assert.equal(verifyPreviewToken('uploads/foto-abc.webp', t), true);
});
