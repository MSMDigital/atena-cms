import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
const STARTER = fileURLToPath(new URL('../templates/starter/', import.meta.url));
const jsonFiles = (dir) => (fs.existsSync(path.join(STARTER, dir)) ? fs.readdirSync(path.join(STARTER, dir)).filter((f) => f.endsWith('.json')) : []);
const PAGES = jsonFiles('content/pages').length;   // tutte le pagine dei contenuti (la privacy è in bozza, le altre pubblicate)
const SEEDED = PAGES + jsonFiles('content/posts').length + 3 + ['headers', 'footers', 'categories', 'tags'].filter((k) => fs.existsSync(path.join(STARTER, `content/${k}.json`))).length;   // + stile, dati del sito, blocchi condivisi e gli elenchi del template
const TOKENS = JSON.parse(fs.readFileSync(path.join(STARTER, 'tokens.json'), 'utf8'));
// Pagine scritte dalla pubblicazione: ogni index.html (404.html non è una pagina del sito e non si conta).
const built = (dir) => { let n = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) if (e.isFile() && e.name === 'index.html') n++; return n; };

test('documenti: bozza, cronologia, pubblicazione', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  let LIVE = 0;   // pagine del sito dopo la prima pubblicazione
  await setupTestDb();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-out-'));
  process.env.SITE_OUT_DIR = out;
  const { query, closeDb } = await import('../lib/db.mjs');
  const D = await import('../lib/docs.mjs');
  const { validateData } = await import('../schema/validate.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); fs.rmSync(out, { recursive: true, force: true }); });

  await query("INSERT INTO users (email, name, password_hash, role) VALUES ('t@example.ch', 'T', 'x', 'admin')");
  const uid = 1;

  await t.test('l\'importazione dei file produce dati identici e validi', async () => {
    const r = await D.seedFromFiles({ userId: uid });
    assert.equal(r.inserted, SEEDED);
    assert.equal((await D.seedFromFiles({ userId: uid })).skipped, SEEDED, 'seconda importazione: non tocca nulla');
    const data = await D.loadData('draft');
    assert.equal(data.pages.length, PAGES);
    assert.equal(data.pages[0].key, 'home');
    assert.deepEqual(validateData(data).errors, []);
    assert.deepEqual(data.tokens, TOKENS);
  });

  await t.test('salvare una modifica: stato "modified" e una revisione; salvare lo stesso contenuto non crea nulla', async () => {
    const tokens = (await D.getDoc('tokens', 'main')).draft;
    assert.equal(D.docState(await D.getDoc('tokens', 'main')), 'clean');
    tokens.colors.brand = '#c2185b';
    assert.equal((await D.saveDraft('tokens', 'main', tokens, uid)).changed, true);
    assert.equal(D.docState(await D.getDoc('tokens', 'main')), 'modified');
    assert.equal((await D.saveDraft('tokens', 'main', tokens, uid)).changed, false);
    assert.equal((await D.revisions('tokens', 'main')).filter((r) => r.action === 'save').length, 1);
    assert.equal((await D.getDoc('tokens', 'main')).published.colors.brand, TOKENS.colors.brand, 'la versione online non cambia salvando la bozza');
  });

  await t.test('pubblicazione con dati non validi: niente cambia, viene registrata come fallita', async () => {
    const tokens = (await D.getDoc('tokens', 'main')).draft;
    const good = structuredClone(tokens);
    tokens.buttons.effect = 'bounce';
    await D.saveDraft('tokens', 'main', tokens, uid);
    const r = await D.publishAll(uid);
    assert.equal(r.ok, false);
    assert.match(r.details.join(' '), /buttons\.effect/);
    assert.equal(fs.existsSync(path.join(out, 'index.html')), false, 'il sito non viene scritto');
    assert.equal(D.docState(await D.getDoc('tokens', 'main')), 'modified');
    assert.equal((await query("SELECT COUNT(*) AS n FROM publications WHERE status = 'failed'"))[0].n, 1);
    await D.saveDraft('tokens', 'main', good, uid);
  });

  await t.test('pubblicazione riuscita: sito scritto con il nuovo colore, documenti pubblicati', async () => {
    const r = await D.publishAll(uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    LIVE = r.pages;
    assert.equal(LIVE, built(out), 'ogni pagina pubblicata è un file del sito');
    assert.ok(LIVE >= PAGES - 1, 'almeno le pagine pubblicate dei contenuti (la privacy è in bozza)');
    assert.deepEqual(r.changed, ['tokens:main']);
    assert.match(fs.readFileSync(path.join(out, 'assets/css/tokens.css'), 'utf8'), /--c-brand: #c2185b;/);
    assert.ok(fs.existsSync(path.join(out, 'contatti/index.html')));
    assert.equal(D.docState(await D.getDoc('tokens', 'main')), 'clean');
    assert.equal((await D.publishAll(uid)).nothing, true, 'niente da pubblicare la seconda volta');
    assert.equal((await D.lastPublication()).status, 'ok');
  });

  await t.test('modifiche concorrenti: chi salva con una revisione vecchia riceve un conflitto e non sovrascrive', async () => {
    const before = await D.getDoc('page', 'contatti');
    const edited = structuredClone(before.draft); edited.name.it = 'Contatti (A)';
    const a = await D.saveDraft('page', 'contatti', edited, uid, { expectedRev: before.rev });
    assert.deepEqual([a.changed, a.rev], [true, before.rev + 1]);
    const other = structuredClone(before.draft); other.name.it = 'Contatti (B)';
    const b = await D.saveDraft('page', 'contatti', other, uid, { expectedRev: before.rev });
    assert.equal(b.conflict, true);
    assert.equal(b.reason, 'rev');
    assert.equal((await D.getDoc('page', 'contatti')).draft.name.it, 'Contatti (A)', 'la seconda scrittura non deve passare');
    edited.name.it = before.draft.name.it;
    await D.saveDraft('page', 'contatti', edited, uid, { expectedRev: a.rev });
  });

  await t.test('creare una pagina: controlli su chiave, indirizzo e duplicati', async () => {
    assert.equal((await D.createPage({ key: 'Non Valida', name: 'x', slug: 'x' }, uid)).ok, false);
    assert.equal((await D.createPage({ key: 'x', name: 'x', slug: 'Con Spazi' }, uid)).ok, false);
    assert.equal((await D.createPage({ key: 'home', name: 'x', slug: 'x' }, uid)).ok, false, 'chiave già esistente');
    assert.equal((await D.createPage({ key: 'nuova', name: 'Nuova', slug: 'contatti', parent: null }, uid)).ok, false, 'indirizzo già usato allo stesso livello');
    assert.equal((await D.createPage({ key: 'nuova', name: 'Nuova', slug: 'nuova', parent: 'inesistente' }, uid)).ok, false);
    assert.equal((await D.createPage({ key: 'nuova', name: 'Nuova', slug: 'nuova', parent: 'moduli' }, uid)).ok, true);
    const d = await D.getDoc('page', 'nuova');
    assert.deepEqual([d.draft.status, d.draft.parent, d.draft.blocks.length], ['draft', 'moduli', 0]);
  });

  await t.test('una pagina incompleta in bozza non blocca la pubblicazione e non finisce online', async () => {
    const r = await D.publishAll(uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pages, LIVE, 'la bozza non viene costruita');
    assert.equal(fs.existsSync(path.join(out, 'moduli/nuova/index.html')), false);
  });

  await t.test('eliminare: home e pagine ancora usate sono protette', async () => {
    assert.equal((await D.deletePage('home', uid)).ok, false);
    const r = await D.deletePage('moduli', uid);
    assert.equal(r.ok, false);
    assert.ok(r.refs.some((x) => x.why === 'pagina figlia'), 'le pagine figlie la usano');
    assert.ok(r.refs.some((x) => x.kind === 'headers'), 'il menu la usa');
  });

  await t.test('eliminare una pagina già pubblicata: sparisce dal sito alla prossima pubblicazione', async () => {
    // la pubblichiamo davvero, poi la eliminiamo
    const d = (await D.getDoc('page', 'nuova')).draft;
    Object.assign(d, { status: 'published', title: { it: 'Nuova pagina' }, description: { it: 'Una pagina di prova.' } });
    await D.saveDraft('page', 'nuova', d, uid);
    assert.equal((await D.publishAll(uid)).pages, LIVE + 1);
    assert.ok(fs.existsSync(path.join(out, 'moduli/nuova/index.html')));

    const del = await D.deletePage('nuova', uid);
    assert.deepEqual([del.ok, del.pending], [true, true]);
    assert.equal((await D.listDocs()).find((x) => x.key === 'nuova').state, 'deleted');
    assert.equal((await D.loadData('draft')).pages.some((p) => p.key === 'nuova'), false, 'la bozza non la contiene più');
    assert.equal((await D.loadData('published')).pages.some((p) => p.key === 'nuova'), true, 'online c\'è ancora');
    assert.ok(fs.existsSync(path.join(out, 'moduli/nuova/index.html')), 'il sito non cambia finché non si pubblica');

    const r = await D.publishAll(uid);
    assert.equal(r.ok, true);
    assert.ok(r.changed.includes('page:nuova (eliminata)'));
    assert.equal(fs.existsSync(path.join(out, 'moduli/nuova/index.html')), false);
    assert.equal((await D.listDocs()).find((x) => x.key === 'nuova').state, 'trashed', 'resta nel cestino, non più online');
  });

  await t.test('cestino: ripristino (torna in bozza, offline) ed eliminazione definitiva solo dal cestino', async () => {
    assert.deepEqual((await D.listTrash()).map((x) => [x.kind, x.key, x.stillOnline]), [['page', 'nuova', false]]);
    assert.equal((await D.purgeDoc('page', 'moduli')).ok, false, 'una pagina non nel cestino non si elimina per sempre');
    const r = await D.restoreDoc('page', 'nuova', uid);
    assert.equal(r.ok, true);
    const back = await D.getDoc('page', 'nuova');
    assert.equal(back.deleted_at, null);
    assert.equal(back.draft.status, 'draft', 'torna in bozza');
    assert.equal(D.docState(back), 'unpublished');
    assert.equal((await D.loadData('published')).pages.some((p) => p.key === 'nuova'), false);
    assert.equal((await D.trashDoc('page', 'nuova', uid)).ok, true);
    assert.equal((await D.purgeDoc('page', 'nuova')).ok, true);
    assert.equal(await D.getDoc('page', 'nuova'), null);
  });

  await t.test('una pagina mai pubblicata va nel cestino senza toccare il sito', async () => {
    await D.createPage({ key: 'temp', name: 'Temp', slug: 'temp' }, uid);
    const r = await D.deletePage('temp', uid);
    assert.deepEqual([r.ok, r.pending], [true, false]);
    assert.equal(D.docState(await D.getDoc('page', 'temp')), 'trashed');
    assert.equal((await D.createPage({ key: 'temp', name: 'Temp', slug: 'temp' }, uid)).ok, false, 'la chiave è ancora occupata dal cestino');
  });
});

