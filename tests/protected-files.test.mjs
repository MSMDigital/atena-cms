// File protetti: regola di accesso (da dentro il sito sì, indirizzo diretto/altro sito/crawler no), indirizzi nei contenuti, pubblicazione.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedRequest } from '../lib/protected-files.mjs';
import { createContext, loadData } from '../render/context.mjs';
import { collectImageRefs } from '../render/images.mjs';
import { robotsTxt } from '../render/seo.mjs';
import { loadTemplateFrom } from '../lib/template.mjs';
import { buildSite } from '../render/build.mjs';
import { stopRenderers } from '../render/host.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
test.after(() => stopRenderers());
const H = (o) => new Headers(o);
const HOSTS = ['www.esempio.ch', null, 'esempio.ch'];

test('accesso: solo se la richiesta nasce da una pagina del sito', () => {
  // un'immagine nella pagina, un link interno cliccato, un PDF in un riquadro
  assert.equal(allowedRequest(H({ 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'image' }), HOSTS), true);
  assert.equal(allowedRequest(H({ 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'document', referer: 'https://www.esempio.ch/certificazioni/' }), HOSTS), true);
  // indirizzo digitato / segnalibro, un altro sito, un sito vicino senza referer giusto
  assert.equal(allowedRequest(H({ 'sec-fetch-site': 'none', 'sec-fetch-dest': 'document' }), HOSTS), false);
  assert.equal(allowedRequest(H({ 'sec-fetch-site': 'cross-site', referer: 'https://www.esempio.ch/' }), HOSTS), false, 'cross-site vince sul Referer');
  assert.equal(allowedRequest(H({ 'sec-fetch-site': 'same-site' }), HOSTS), false);
  assert.equal(allowedRequest(H({ 'sec-fetch-site': 'same-site', referer: 'https://esempio.ch/pagina/' }), HOSTS), true);
  // senza Sec-Fetch-* (browser vecchi, curl): conta il Referer
  assert.equal(allowedRequest(H({}), HOSTS), false);
  assert.equal(allowedRequest(H({ referer: 'https://www.esempio.ch/certificazioni/' }), HOSTS), true);
  assert.equal(allowedRequest(H({ referer: 'https://altro.example/pagina' }), HOSTS), false);
  assert.equal(allowedRequest(H({ referer: 'https://www.esempio.ch.evil.example/' }), HOSTS), false, 'host simile ma diverso');
  assert.equal(allowedRequest(H({ referer: 'non un indirizzo' }), HOSTS), false);
});

test('contenuti: indirizzi /api/files per i file protetti (immagini, link, testi ricchi); gli altri restano /assets/img', () => {
  const tpl = loadTemplateFrom(path.join(ROOT, 'templates/starter'));
  const d = { ...loadData(tpl.dir), protectedMedia: ['uploads/cert-1.pdf', 'uploads/cert-1.webp'] };
  const ctx = createContext(d, 'it');
  assert.equal(ctx.assetImg('uploads/cert-1.webp'), '/api/files/uploads/cert-1.webp');
  assert.equal(ctx.assetImg('uploads/altra.webp'), '/assets/img/uploads/altra.webp');
  assert.equal(ctx.link({ type: 'file', file: 'uploads/cert-1.pdf' }), '/api/files/uploads/cert-1.pdf');
  assert.equal(ctx.link({ type: 'file', file: 'uploads/libero.pdf' }), '/assets/img/uploads/libero.pdf');
  const rich = String(ctx.rich({ it: '<p><a href="file:uploads/cert-1.pdf">Certificato</a> <img src="/assets/img/uploads/cert-1.webp" alt="x"> <img src="/assets/img/uploads/altra.webp" alt="y"></p>' }));
  assert.match(rich, /href="\/api\/files\/uploads\/cert-1\.pdf"/);
  assert.match(rich, /src="\/api\/files\/uploads\/cert-1\.webp"/);
  assert.match(rich, /src="\/assets\/img\/uploads\/altra\.webp"/);
  assert.equal(ctx.isProtected('uploads/cert-1.pdf'), true);
});

test('robots.txt: /api/files/ è sempre vietato ai crawler', () => {
  assert.match(robotsTxt({ siteUrl: 'https://x.ch' }), /Disallow: \/api\/files\//);
  assert.match(robotsTxt({ siteUrl: 'https://x.ch', crawling: { aiTraining: 'block' } }), /User-agent: \*\nDisallow: \/api\/files\//);
});

test('pubblicazione: un file protetto non finisce tra i file statici (nemmeno se è un\'immagine del progetto) e si elenca come protetto', async () => {
  const tpl = loadTemplateFrom(path.join(ROOT, 'templates/starter'));
  const d = loadData(tpl.dir);
  d.protectedMedia = ['demo-lago.jpg'];   // immagine del progetto usata dal template di esempio
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-prot-')), 'dist');
  const r = await buildSite(d, { outDir: out, assetsDir: path.join(tpl.dir, 'assets'), template: tpl });
  assert.equal(fs.existsSync(path.join(out, 'assets/img/demo-lago.jpg')), false, 'non pubblico');
  assert.equal(fs.existsSync(path.join(out, 'assets/img/demo-neve.jpg')), true, 'gli altri sì');
  assert.ok(r.protectedRefs.includes('demo-lago.jpg'));
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const blog = fs.readFileSync(path.join(out, 'blog/index.html'), 'utf8');
  assert.match(blog, /\/api\/files\/demo-lago\.jpg/, 'l\'immagine nella pagina punta all\'app');
  assert.doesNotMatch(blog, /\/assets\/img\/demo-lago\.jpg/);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'), /demo-lago/);
  assert.match(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8'), /Disallow: \/api\/files\//);
  assert.ok(home.length > 0);
});
