import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
const PAGES = fs.readdirSync(new URL('../templates/mammano/content/pages/', import.meta.url)).filter((f) => f.endsWith('.json')).length;   // tutte le pagine dei contenuti (sono pubblicate)

test('documenti: bozza, cronologia, pubblicazione', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
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
    assert.equal(r.inserted, PAGES + 3);   // le pagine + stile, dati del sito e blocchi condivisi
    assert.equal((await D.seedFromFiles({ userId: uid })).skipped, PAGES + 3, 'seconda importazione: non tocca nulla');
    const data = await D.loadData('draft');
    assert.equal(data.pages.length, PAGES);
    assert.equal(data.pages[0].key, 'home');
    assert.deepEqual(validateData(data).errors, []);
    assert.deepEqual(data.tokens, JSON.parse(fs.readFileSync(new URL('../templates/mammano/tokens.json', import.meta.url), 'utf8')));
  });

  await t.test('salvare una modifica: stato "modified" e una revisione; salvare lo stesso contenuto non crea nulla', async () => {
    const tokens = (await D.getDoc('tokens', 'main')).draft;
    assert.equal(D.docState(await D.getDoc('tokens', 'main')), 'clean');
    tokens.colors.brand = '#c2185b';
    assert.equal((await D.saveDraft('tokens', 'main', tokens, uid)).changed, true);
    assert.equal(D.docState(await D.getDoc('tokens', 'main')), 'modified');
    assert.equal((await D.saveDraft('tokens', 'main', tokens, uid)).changed, false);
    assert.equal((await D.revisions('tokens', 'main')).filter((r) => r.action === 'save').length, 1);
    assert.equal((await D.getDoc('tokens', 'main')).published.colors.brand, '#0348ad', 'la versione online non cambia salvando la bozza');
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
    assert.equal(r.pages, PAGES);
    assert.deepEqual(r.changed, ['tokens:main']);
    assert.match(fs.readFileSync(path.join(out, 'assets/css/tokens.css'), 'utf8'), /--c-brand: #c2185b;/);
    assert.ok(fs.existsSync(path.join(out, 'servizi/traslochi-privati/index.html')));
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
    edited.name.it = 'Contatti';
    await D.saveDraft('page', 'contatti', edited, uid, { expectedRev: a.rev });
  });

  await t.test('creare una pagina: controlli su chiave, indirizzo e duplicati', async () => {
    assert.equal((await D.createPage({ key: 'Non Valida', name: 'x', slug: 'x' }, uid)).ok, false);
    assert.equal((await D.createPage({ key: 'x', name: 'x', slug: 'Con Spazi' }, uid)).ok, false);
    assert.equal((await D.createPage({ key: 'home', name: 'x', slug: 'x' }, uid)).ok, false, 'chiave già esistente');
    assert.equal((await D.createPage({ key: 'nuova', name: 'Nuova', slug: 'chi-siamo', parent: null }, uid)).ok, false, 'indirizzo già usato allo stesso livello');
    assert.equal((await D.createPage({ key: 'nuova', name: 'Nuova', slug: 'nuova', parent: 'inesistente' }, uid)).ok, false);
    assert.equal((await D.createPage({ key: 'nuova', name: 'Nuova', slug: 'nuova', parent: 'servizi' }, uid)).ok, true);
    const d = await D.getDoc('page', 'nuova');
    assert.deepEqual([d.draft.status, d.draft.parent, d.draft.blocks.length], ['draft', 'servizi', 0]);
  });

  await t.test('una pagina incompleta in bozza non blocca la pubblicazione e non finisce online', async () => {
    const r = await D.publishAll(uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pages, PAGES, 'la bozza non viene costruita');
    assert.equal(fs.existsSync(path.join(out, 'servizi/nuova/index.html')), false);
  });

  await t.test('eliminare: home e pagine ancora usate sono protette', async () => {
    assert.equal((await D.deletePage('home', uid)).ok, false);
    const r = await D.deletePage('servizi', uid);
    assert.equal(r.ok, false);
    assert.ok(r.refs.some((x) => x.why === 'pagina figlia'), 'le pagine figlie la usano');
    assert.ok(r.refs.some((x) => x.kind === 'site'), 'il menu la usa');
  });

  await t.test('eliminare una pagina già pubblicata: sparisce dal sito alla prossima pubblicazione', async () => {
    // la pubblichiamo davvero, poi la eliminiamo
    const d = (await D.getDoc('page', 'nuova')).draft;
    Object.assign(d, { status: 'published', title: { it: 'Nuova pagina' }, description: { it: 'Una pagina di prova.' } });
    await D.saveDraft('page', 'nuova', d, uid);
    assert.equal((await D.publishAll(uid)).pages, PAGES + 1);
    assert.ok(fs.existsSync(path.join(out, 'servizi/nuova/index.html')));

    const del = await D.deletePage('nuova', uid);
    assert.deepEqual([del.ok, del.pending], [true, true]);
    assert.equal((await D.listDocs()).find((x) => x.key === 'nuova').state, 'deleted');
    assert.equal((await D.loadData('draft')).pages.some((p) => p.key === 'nuova'), false, 'la bozza non la contiene più');
    assert.equal((await D.loadData('published')).pages.some((p) => p.key === 'nuova'), true, 'online c\'è ancora');
    assert.ok(fs.existsSync(path.join(out, 'servizi/nuova/index.html')), 'il sito non cambia finché non si pubblica');

    const r = await D.publishAll(uid);
    assert.equal(r.ok, true);
    assert.ok(r.changed.includes('page:nuova (eliminata)'));
    assert.equal(fs.existsSync(path.join(out, 'servizi/nuova/index.html')), false);
    assert.equal(await D.getDoc('page', 'nuova'), null, 'la riga viene rimossa');
  });

  await t.test('una pagina mai pubblicata si elimina subito', async () => {
    await D.createPage({ key: 'temp', name: 'Temp', slug: 'temp' }, uid);
    const r = await D.deletePage('temp', uid);
    assert.deepEqual([r.ok, r.pending], [true, false]);
    assert.equal(await D.getDoc('page', 'temp'), null);
  });
});

