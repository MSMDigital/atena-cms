import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { imageSize } from '../render/image-size.mjs';
import { collectImageRefs } from '../render/images.mjs';
import { buildSite, BuildError } from '../render/build.mjs';
import { loadData } from '../render/context.mjs';
import { isSameOrigin } from '../lib/origin.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const TPL = path.join(ROOT, 'templates/mammano');
const PAGES = fs.readdirSync(path.join(TPL, 'content/pages')).filter((f) => f.endsWith('.json')).length;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cms-media-'));
const px = (w, h) => ({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } });

test('dimensioni di WebP (lossy, lossless, con trasparenza), JPEG e PNG', async () => {
  const dir = tmp();
  const cases = {
    'lossy.webp': await sharp(px(123, 45)).webp({ quality: 70 }).toBuffer(),
    'lossless.webp': await sharp(px(77, 31)).webp({ lossless: true }).toBuffer(),
    'alpha.webp': await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).webp({ quality: 80 }).toBuffer(),
    'a.jpg': await sharp(px(300, 200)).jpeg().toBuffer(),
    'a.png': await sharp(px(50, 60)).png().toBuffer(),
  };
  const expected = { 'lossy.webp': [123, 45], 'lossless.webp': [77, 31], 'alpha.webp': [64, 48], 'a.jpg': [300, 200], 'a.png': [50, 60] };
  for (const [name, buf] of Object.entries(cases)) {
    fs.writeFileSync(path.join(dir, name), buf);
    const s = imageSize(path.join(dir, name));
    assert.deepEqual([s.width, s.height], expected[name], name);
  }
  assert.equal(imageSize(path.join(dir, 'non-esiste.webp')), null);
});

test('un file mancante non viene memorizzato: se compare dopo, si vede', async () => {
  const f = path.join(tmp(), 'dopo.webp');
  assert.equal(imageSize(f), null);
  fs.writeFileSync(f, await sharp(px(10, 10)).webp().toBuffer());
  assert.deepEqual(imageSize(f) && [imageSize(f).width, imageSize(f).height], [10, 10]);
});

test('collectImageRefs: solo pagine pubblicate, più dati del sito e blocchi condivisi', () => {
  const img = (src) => ({ src, alt: { it: 'x' } });
  const refs = collectImageRefs({
    site: { company: { logoImage: 'logo.png', image: 'hero.jpg' }, seo: { favicon: 'ico.jpg', defaultOgImage: img('og.jpg') } },
    shared: { a: { type: 'gallery', items: [{ image: img('s1.jpg') }] } },
    pages: [
      { key: 'p1', status: 'published', blocks: [{ type: 'hero', image: img('h.jpg') }, { type: 'items', items: [{ previewImage: img('prev.jpg') }] }] },
      { key: 'p2', status: 'draft', blocks: [{ type: 'hero', image: img('solo-bozza.jpg') }] },
    ],
  });
  assert.deepEqual([...refs].sort(), ['h.jpg', 'hero.jpg', 'ico.jpg', 'logo.png', 'og.jpg', 'prev.jpg', 's1.jpg']);
});

test('controllo dell\'origine: solo la stessa origine dell\'app', () => {
  const h = (o) => new Headers(o);
  assert.equal(isSameOrigin(h({ origin: 'http://localhost:3000', host: 'localhost:3000' })), true);
  assert.equal(isSameOrigin(h({ origin: 'https://evil.example', host: 'localhost:3000' })), false);
  assert.equal(isSameOrigin(h({ host: 'localhost:3000' })), false, 'senza Origin non si fida');
  assert.equal(isSameOrigin(h({ origin: 'null', host: 'localhost:3000' })), false);
  assert.equal(isSameOrigin(h({ origin: 'http://localhost:3000.evil.example', host: 'localhost:3000' })), false, 'il prefisso non basta');
});

// ---- pubblicazione delle immagini ----

const withBlock = (data, block, status = 'published') => {
  const d = structuredClone(data);
  d.pages.find((p) => p.key === 'chi-siamo').blocks.push(block);
  d.pages.find((p) => p.key === 'chi-siamo').status = status;
  return d;
};
const wide = (src) => ({ id: 'wide-test', type: 'wide-image', image: { src, alt: { it: 'Prova' } } });

test('build: si pubblicano solo i caricamenti usati, con le dimensioni nell\'HTML', async () => {
  const media = tmp(); const out = path.join(tmp(), 'dist');
  fs.mkdirSync(path.join(media, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(media, 'uploads/usata-abc.webp'), await sharp(px(640, 360)).webp().toBuffer());
  fs.writeFileSync(path.join(media, 'uploads/non-usata-def.webp'), await sharp(px(50, 50)).webp().toBuffer());
  const r = await buildSite(withBlock(loadData(TPL), wide('uploads/usata-abc.webp')), { outDir: out, assetsDir: path.join(TPL, 'assets'), mediaDir: media });
  assert.equal(r.pages, PAGES);
  assert.ok(fs.existsSync(path.join(out, 'assets/img/uploads/usata-abc.webp')), 'l\'immagine usata viene copiata');
  assert.equal(fs.existsSync(path.join(out, 'assets/img/uploads/non-usata-def.webp')), false, 'quella non usata no: non deve essere pubblica');
  const html = fs.readFileSync(path.join(out, 'chi-siamo/index.html'), 'utf8');
  assert.match(html, /src="\/assets\/img\/uploads\/usata-abc\.webp"[^>]*width="640" height="360"/);
});

test('build: un\'immagine mancante blocca la pubblicazione e non tocca l\'output esistente', async () => {
  const out = path.join(tmp(), 'dist');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'marcatore.txt'), 'sito precedente');
  await assert.rejects(
    buildSite(withBlock(loadData(TPL), wide('uploads/sparita-000.webp')), { outDir: out, assetsDir: path.join(TPL, 'assets'), mediaDir: tmp() }),
    (e) => e instanceof BuildError && /mancanti/.test(e.message) && e.details.some((d) => d.includes('sparita-000.webp')),
  );
  assert.equal(fs.readFileSync(path.join(out, 'marcatore.txt'), 'utf8'), 'sito precedente', 'la cartella di output non va svuotata');
});

test('build: un\'immagine mancante in una pagina in bozza non blocca il resto del sito', async () => {
  const out = path.join(tmp(), 'dist');
  const r = await buildSite(withBlock(loadData(TPL), wide('uploads/mancante-in-bozza.webp'), 'draft'), { outDir: out, assetsDir: path.join(TPL, 'assets'), mediaDir: tmp() });
  assert.equal(r.pages, PAGES - 1, 'la pagina in bozza non viene costruita');
});

test('build: un percorso che tenta di uscire dalla cartella dei caricamenti è considerato mancante', async () => {
  const media = tmp();
  fs.writeFileSync(path.join(path.dirname(media), 'segreto.webp'), 'x');
  await assert.rejects(
    buildSite(withBlock(loadData(TPL), wide(`../${path.basename(path.dirname(media))}/segreto.webp`)), { outDir: path.join(tmp(), 'dist'), assetsDir: path.join(TPL, 'assets'), mediaDir: media }),
    BuildError,
  );
});
