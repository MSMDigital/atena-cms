// Libreria media: dati dell'immagine, sostituzione, ritaglio e ridimensionamento.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const px = (w, h, c = { r: 200, g: 80, b: 40 }) => ({ create: { width: w, height: h, channels: 3, background: c } });

test('media: titolo e didascalia, sostituzione tenendo il percorso, ritaglio e scala (sul posto o in copia)', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-media-edit-'));
  process.env.MEDIA_DIR = media;
  const { closeDb, query } = await import('../lib/db.mjs');
  const M = await import('../lib/media.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); fs.rmSync(media, { recursive: true, force: true }); delete process.env.MEDIA_DIR; });
  const meta = async (logical) => sharp(fs.readFileSync(path.join(media, logical))).metadata();
  const jpeg = (w, h, c) => sharp(px(w, h, c)).jpeg().toBuffer();
  const fails = (p, re) => assert.rejects(p, (e) => e instanceof M.UploadError && re.test(e.message));

  const a = await M.saveUpload(await jpeg(800, 600), 'foto.jpg', null);

  await t.test('titolo, didascalia, descrizione e testo alternativo si salvano (e si ripuliscono)', async () => {
    assert.equal(await M.updateMeta(a.path, { alt: ' Un tramonto ', title: 'Tramonto', caption: 'Dal molo', description: 'Una\nlunga descrizione' }), true);
    const item = (await M.listMedia()).find((i) => i.path === a.path);
    assert.deepEqual([item.alt, item.title, item.caption, item.description], ['Un tramonto', 'Tramonto', 'Dal molo', 'Una\nlunga descrizione']);
    await M.updateMeta(a.path, { alt: '', title: 'x'.repeat(500) });
    const again = (await M.listMedia()).find((i) => i.path === a.path);
    assert.equal(again.alt, ''); assert.equal(again.title.length, 200); assert.equal(again.caption, '');
    await M.updateMeta(a.path, { alt: 'Tramonto', title: 'Tramonto', caption: 'Dal molo', description: '' });
  });

  await t.test('sostituire: stesso percorso, nuove dimensioni e contenuto, dati conservati', async () => {
    const before = fs.readFileSync(path.join(media, a.path));
    const item = await M.replaceUpload(a.path, await jpeg(400, 300, { r: 10, g: 20, b: 30 }), 'nuova.jpg', null);
    assert.equal(item.path, a.path);
    assert.deepEqual([item.width, item.height], [400, 300]);
    assert.equal(item.title, 'Tramonto');
    assert.notDeepEqual(fs.readFileSync(path.join(media, a.path)), before);
    assert.deepEqual([(await meta(a.path)).width, (await meta(a.path)).format], [400, 'webp']);
    await fails(M.replaceUpload(a.path, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), 'x.svg', null), /non con un SVG/);
    await fails(M.replaceUpload(a.path, Buffer.from('non è un\'immagine'), 'x.jpg', null), /Formato non supportato/);
    await fails(M.replaceUpload('uploads/non-esiste.webp', await jpeg(10, 10), 'x.jpg', null), /non esiste/);
  });

  await t.test('un SVG si sostituisce solo con un SVG', async () => {
    const svg = (n) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><rect width="${n}" height="${n}"/></svg>`);
    const s = await M.saveUpload(svg(20), 'logo.svg', null);
    const r = await M.replaceUpload(s.path, svg(40), 'logo2.svg', null);
    assert.deepEqual([r.path, r.width], [s.path, 40]);
    await fails(M.replaceUpload(s.path, await jpeg(10, 10), 'x.jpg', null), /con un altro SVG/);
    await fails(M.editImage(s.path, { width: 10, mode: 'copy' }, null), /SVG non si possono/);
    await fails(M.replaceUpload(s.path, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg', null), /SVG non ammesso/);
  });

  await t.test('ritaglio e scala in copia: l\'originale resta, i dati passano alla copia', async () => {
    const big = await M.saveUpload(await jpeg(1000, 500), 'ampia.jpg', null);
    await M.updateMeta(big.path, { alt: 'Ampia', title: 'Titolo', caption: 'Did', description: 'Desc' });
    const copy = await M.editImage(big.path, { crop: { x: 100, y: 50, width: 600, height: 300 }, width: 300, mode: 'copy' }, null);
    assert.notEqual(copy.path, big.path);
    assert.deepEqual([copy.width, copy.height], [300, 150]);
    assert.deepEqual([copy.alt, copy.title, copy.caption, copy.description], ['Ampia', 'Titolo', 'Did', 'Desc']);
    assert.deepEqual([(await meta(big.path)).width, (await meta(big.path)).height], [1000, 500], 'l\'originale non cambia');
  });

  await t.test('ritaglio e scala sul posto: stesso percorso, nuove dimensioni', async () => {
    const x = await M.saveUpload(await jpeg(900, 600, { r: 1, g: 2, b: 3 }), 'sul-posto.jpg', null);
    const item = await M.editImage(x.path, { crop: { x: 0, y: 0, width: 600, height: 600 }, mode: 'replace' }, null);
    assert.equal(item.path, x.path);
    assert.deepEqual([item.width, item.height], [600, 600]);
    const scaled = await M.editImage(x.path, { width: 200, mode: 'replace' }, null);
    assert.deepEqual([scaled.width, scaled.height], [200, 200]);
    assert.deepEqual([(await meta(x.path)).width, (await meta(x.path)).height], [200, 200]);
  });

  await t.test('ritaglio: un\'eccedenza di 1-2 px per arrotondamento si riporta dentro, oltre è un errore chiaro', async () => {
    const z = await M.saveUpload(await jpeg(1000, 500, { r: 4, g: 5, b: 6 }), 'bordo.jpg', null);
    const ok = await M.editImage(z.path, { crop: { x: 1, y: 0, width: 1000, height: 500 }, mode: 'copy' }, null);   // x + larghezza = 1001
    assert.deepEqual([ok.width, ok.height], [999, 500]);
    const tall = await M.editImage(z.path, { crop: { x: 0, y: 2, width: 400, height: 500 }, mode: 'copy' }, null);   // y + altezza = 502
    assert.deepEqual([tall.width, tall.height], [400, 498]);
    await fails(M.editImage(z.path, { crop: { x: 0, y: 0, width: 1010, height: 500 }, mode: 'copy' }, null), /esce dall'immagine \(1000 × 500 px\)/);
    await fails(M.editImage(z.path, { crop: { x: 0, y: 0, width: 10, height: 100 }, mode: 'copy' }, null), /troppo piccolo/);
  });

  await t.test('rinominare il file: percorso, riferimenti in bozza e online (anche nei testi), collisioni e immagini del progetto', async () => {
    const r = await M.saveUpload(await jpeg(300, 200, { r: 50, g: 60, b: 70 }), 'Foto Vecchia.jpg', null);
    const rich = `<p>Ciao</p><img src="/assets/img/${r.path}" alt="x">`;
    const page = (extra = {}) => JSON.stringify({ key: 'p1', hero: { image: { src: r.path } }, other: { src: 'altra.jpg' }, text: { it: rich }, ...extra });
    await query("INSERT INTO docs (kind, doc_key, draft, published) VALUES ('page', 'p1', ?, ?)", [page(), page()]);
    assert.deepEqual((await M.mediaUsage(r.path)).map((u) => [u.key, u.inDraft, u.online]), [['p1', true, true]], 'l\'uso conta anche le immagini dentro i testi');
    await fails(M.deleteMedia(r.path).then((x) => { if (!x.ok) throw new M.UploadError(x.error); }), /ancora usata/);

    const out = await M.renameMedia(r.path, 'Nuovo Nome Città!.webp');
    assert.equal(out.item.path, 'uploads/nuovo-nome-citta.webp');
    assert.equal(out.item.name, 'nuovo-nome-citta.webp');
    assert.equal(out.updated, 1);
    assert.equal(fs.existsSync(path.join(media, r.path)), false);
    assert.equal(fs.existsSync(path.join(media, out.item.path)), true);
    const row = (await query("SELECT draft, published FROM docs WHERE doc_key = 'p1'"))[0];
    for (const col of [row.draft, row.published]) {
      const d = JSON.parse(col);
      assert.equal(d.hero.image.src, 'uploads/nuovo-nome-citta.webp');
      assert.equal(d.other.src, 'altra.jpg', 'gli altri file non cambiano');
      assert.match(d.text.it, /src="\/assets\/img\/uploads\/nuovo-nome-citta\.webp"/);
    }
    assert.equal(row.draft, row.published, 'un documento già pubblicato resta uguale alla versione online');
    assert.equal((await query("SELECT rev FROM docs WHERE doc_key = 'p1'"))[0].rev >= 2, true, 'chi ha il documento aperto vede il conflitto');
    assert.equal((await M.listMedia()).some((i) => i.path === r.path), false);

    const other = await M.saveUpload(await jpeg(100, 100, { r: 1, g: 1, b: 1 }), 'seconda.jpg', null);
    await fails(M.renameMedia(other.path, 'nuovo nome citta'), /Esiste già un file chiamato «nuovo-nome-citta\.webp»/);
    await fails(M.renameMedia(other.path, '***'), /Scrivi un nome/);
    await fails(M.renameMedia('uploads/non-esiste.webp', 'x'), /non esiste/);
    await fails(M.renameMedia(other.path, other.path.replace(/^uploads\//, '')), /già questo/);
    await query("UPDATE media SET source = 'project' WHERE path = ?", [other.path]);
    await fails(M.renameMedia(other.path, 'altro'), /del progetto non si rinominano/);
  });

  await t.test('richieste non valide: ritaglio fuori, troppo piccolo, ingrandire, niente da fare', async () => {
    const y = await M.saveUpload(await jpeg(500, 400, { r: 9, g: 9, b: 9 }), 'limiti.jpg', null);
    await fails(M.editImage(y.path, { crop: { x: 400, y: 0, width: 200, height: 100 }, mode: 'copy' }, null), /esce dall'immagine/);
    await fails(M.editImage(y.path, { crop: { x: 0, y: 0, width: 8, height: 8 }, mode: 'copy' }, null), /troppo piccolo/);
    await fails(M.editImage(y.path, { width: 800, mode: 'copy' }, null), /solo ridurre/);
    await fails(M.editImage(y.path, { mode: 'copy' }, null), /Niente da modificare/);
    await fails(M.editImage(y.path, { width: 100, mode: 'boh' }, null), /Modo non valido/);
    await fails(M.editImage('../x.webp', { width: 100, mode: 'copy' }, null), /non esiste/);
    await query("UPDATE media SET source = 'project' WHERE path = ?", [y.path]);
    await fails(M.editImage(y.path, { width: 100, mode: 'replace' }, null), /non si modificano sul posto/);
    const c = await M.editImage(y.path, { width: 100, mode: 'copy' }, null);
    assert.equal(c.source, 'upload', 'di un\'immagine del progetto si può salvare una copia');
    await fails(M.replaceUpload(y.path, await jpeg(10, 10), 'x.jpg', null), /del progetto non si sostituiscono/);
  });
});
