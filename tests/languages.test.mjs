import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { renameLocale, projectLocale, shapeForSchema, makeTranslation, indexTranslations, baseOf, textOf } from '../render/translations.mjs';
import { findPageRefs } from '../lib/refs.mjs';
import { blogData } from '../schema/blog.mjs';
import { createContext } from '../render/context.mjs';

test('traduzioni: spostare, copiare e adattare i testi per lingua', () => {
  const doc = { key: 'x', slug: { it: 'chi-siamo' }, name: { it: 'Chi siamo', en: 'About' }, tags: ['a'], blocks: [{ id: 'b1', title: { it: 'Ciao' } }], locales: { it: 'it-CH' } };
  assert.deepEqual(renameLocale(doc, 'it', 'de').name, { de: 'Chi siamo', en: 'About' }, 'i testi dell\'italiano passano alla nuova lingua; le altre lingue restano');
  assert.deepEqual(renameLocale(doc, 'it', 'de').blocks[0].title, { de: 'Ciao' });
  assert.deepEqual(renameLocale(doc, 'it', 'de').locales, { it: 'it-CH' }, 'i codici delle lingue non sono testi');
  const en = projectLocale(doc, 'it', 'en');
  assert.deepEqual(en.slug, { en: 'chi-siamo' });
  assert.deepEqual(en.name, { en: 'About' }, 'se la lingua ha già un testo, vale quello');
  assert.deepEqual(en.blocks[0].title, { en: 'Ciao' });
  assert.deepEqual(shapeForSchema({ name: { en: 'x' }, locales: { it: 'it-CH' } }, 'en'), { name: { it: 'x' }, locales: { it: 'it-CH' } });
  const tr = makeTranslation({ key: 'chi-siamo', name: { it: 'Chi siamo' }, title: { it: 'Chi siamo | Sito' }, slug: { it: 'chi-siamo' }, status: 'published', protected: true, blocks: [] }, 'it', 'en');
  assert.equal(tr.key, 'chi-siamo--en');
  assert.equal(tr.translationOf, 'chi-siamo');
  assert.equal(tr.lang, 'en');
  assert.equal(tr.status, 'draft');
  assert.deepEqual(tr.name, { en: 'Chi siamo - EN' });
  assert.deepEqual(tr.title, { en: 'Chi siamo | Sito - EN' });
  assert.deepEqual(tr.slug, { en: 'chi-siamo' });
  assert.equal(tr.protected, true, 'una pagina protetta non ha una copia pubblica');
  assert.deepEqual(Object.keys(indexTranslations([tr])['chi-siamo']), ['en']);
});

const SITE = { siteUrl: 'https://x.ch', company: { channels: {} }, locales: { default: 'it', base: 'it', enabled: ['it', 'en'], tags: { it: 'it-CH', en: 'en-GB' } } };
const PAGES = [
  { key: 'home', status: 'published', slug: { it: '' }, name: { it: 'Home' }, title: { it: 'Home' }, blocks: [] },
  { key: 'servizi', status: 'published', slug: { it: 'servizi' }, name: { it: 'Servizi' }, title: { it: 'Servizi' }, blocks: [] },
  { key: 'team', status: 'published', slug: { it: 'team' }, parent: 'servizi', name: { it: 'Team' }, title: { it: 'Team' }, blocks: [] },
];

test('contesto: indirizzo e stato per lingua dalle versioni pubblicate', () => {
  const trs = [
    { key: 'servizi--en', translationOf: 'servizi', lang: 'en', status: 'published', slug: { en: 'services' }, name: { en: 'Services' }, title: { en: 'Services' }, blocks: [] },
    { key: 'team--en', translationOf: 'team', lang: 'en', status: 'draft', parent: 'servizi', slug: { en: 'team' }, name: { en: 'Team' }, title: { en: 'Team' }, blocks: [] },
  ];
  const ctx = createContext({ site: SITE, pages: PAGES, translations: trs, shared: {}, tokens: {} }, 'en');
  assert.equal(ctx.pathOf('servizi', 'en'), '/en/services/');
  assert.equal(ctx.pathOf('servizi', 'it'), '/servizi/');
  assert.equal(ctx.pathOf('team', 'en'), '/en/services/team/', 'il padre prende l\'indirizzo della lingua');
  assert.equal(ctx.isLive(PAGES[1], 'en'), true);
  assert.equal(ctx.isLive(PAGES[2], 'en'), false, 'versione in bozza: in inglese non è online');
  assert.equal(ctx.isLive(PAGES[2], 'it'), true);
  assert.equal(ctx.isLive(PAGES[0], 'en'), false, 'nessuna versione inglese');
  assert.equal(ctx.pageOf('servizi').key, 'servizi', 'la versione ha la chiave della pagina di base');
  assert.equal(ctx.t(ctx.pageOf('servizi').name), 'Services');
  assert.equal(ctx.hasVersion('team', 'en'), true, 'l\'anteprima vede anche le bozze');
});

test('lingue: aggiungere una lingua crea le versioni in bozza e le assegna', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-out-'));
  process.env.SITE_OUT_DIR = out;
  const { query, closeDb } = await import('../lib/db.mjs');
  const D = await import('../lib/docs.mjs');
  const L = await import('../lib/languages.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); fs.rmSync(out, { recursive: true, force: true }); });
  await query("INSERT INTO users (email, name, password_hash, role) VALUES ('t@example.ch', 'T', 'x', 'admin')");
  const uid = 1;
  await D.seedFromFiles({ userId: uid });
  const draft0 = await D.loadData('draft');
  const pages = draft0.pages.length;
  const posts = draft0.posts.length;   // starter ha anche degli articoli: anche loro nascono con la versione in bozza

  await t.test('senza dire in che lingua sono i contenuti, non si aggiunge una lingua', async () => {
    const r = await L.applyLocales({ enabled: ['it', 'en'], def: 'it', tags: { it: 'it-CH', en: 'en-GB' } }, uid);
    assert.equal(r.ok, false);
    assert.equal(r.needBase, true);
    assert.deepEqual((await D.getDoc('site', 'main')).draft.locales.enabled, ['it']);
  });

  await t.test('con la lingua di base: una versione in bozza per pagina, «Titolo - EN»', async () => {
    const r = await L.applyLocales({ enabled: ['it', 'en'], def: 'it', tags: { it: 'it-CH', en: 'en-GB' }, baseLang: 'it' }, uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, pages + posts);
    const data = await D.loadData('draft');
    assert.equal(data.pages.length, pages);
    assert.equal(data.translations.length, pages);
    const home = data.translations.find((p) => p.key === 'home--en');
    assert.equal(home.status, 'draft');
    assert.match(home.name.en, / - EN$/);
    assert.equal(home.lang, 'en');
    assert.equal((await D.loadData('published')).translations.length, 0, 'le bozze non sono online');
    assert.equal((await D.getDoc('site', 'main')).draft.locales.base, 'it');
    assert.equal((await D.getDoc('page', 'home')).draft.lang, 'it');
  });

  await t.test('una pagina nuova nasce con le sue versioni', async () => {
    const r = await D.createPage({ key: 'novita', name: 'Novità', slug: 'novita' }, uid);
    assert.equal(r.ok, true);
    assert.ok(await D.getDoc('page', 'novita--en'));
    assert.equal((await D.createPage({ key: 'a--b', name: 'x', slug: 'x' }, uid)).ok, false, '«--» è riservato');
  });

  await t.test('pubblicare una versione la mette online sotto /en/, con hreflang', async () => {
    const tr = (await D.getDoc('page', 'contatti--en')).draft;
    await D.saveDraft('page', 'contatti--en', { ...tr, status: 'published', slug: { en: 'contact-us' }, title: { en: 'Contact us' }, name: { en: 'Contact us' } }, uid);
    await D.saveDraft('page', 'home--en', { ...(await D.getDoc('page', 'home--en')).draft, status: 'published' }, uid);
    const r = await D.publishAll(uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(fs.existsSync(path.join(out, 'en/contact-us/index.html')), 'la versione inglese esce');
    assert.ok(fs.existsSync(path.join(out, 'contatti/index.html')), 'quella italiana resta');
    assert.equal(fs.existsSync(path.join(out, 'en/moduli/index.html')), false, 'le versioni in bozza non escono');
    const html = fs.readFileSync(path.join(out, 'contatti/index.html'), 'utf8');
    assert.match(html, /hreflang="en-GB" href="https:\/\/[^"]+\/en\/contact-us\/"/);
    assert.match(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'), /\/en\/contact-us\//);
  });

  await t.test('un articolo nuovo nasce con le sue versioni, il cestino le porta con sé', async () => {
    assert.equal((await D.createPost({ title: 'X', slug: 'a--b' }, uid)).ok, false, '«--» è riservato anche agli articoli');
    const np = await D.createPost({ title: 'Nuovo articolo', slug: 'nuovo-articolo' }, uid);
    assert.equal(np.ok, true);
    const tr = (await D.getDoc('post', 'nuovo-articolo--en')).draft;
    assert.equal(tr.lang, 'en');
    assert.equal(tr.translationOf, 'nuovo-articolo');
    assert.match(tr.title.en, /Nuovo articolo - EN$/);
    assert.equal((await D.getDoc('post', 'nuovo-articolo')).draft.lang, 'it');
    assert.equal((await D.loadData('draft')).postTranslations.length, posts + 1);
    assert.equal((await D.trashDoc('post', 'nuovo-articolo', uid)).ok, true);
    assert.ok((await D.getDoc('post', 'nuovo-articolo--en')).deleted_at, 'il cestino porta con sé la versione');
    assert.equal((await D.restoreDoc('post', 'nuovo-articolo--en', uid)).ok, false, 'prima l\'articolo di base');
    assert.equal((await D.restoreDoc('post', 'nuovo-articolo', uid)).ok, true);
    assert.equal((await D.getDoc('post', 'nuovo-articolo--en')).deleted_at, null);
    await D.trashDoc('post', 'nuovo-articolo', uid);
    assert.equal((await D.purgeDoc('post', 'nuovo-articolo')).ok, true);
    assert.equal(await D.getDoc('post', 'nuovo-articolo--en'), null);
    assert.equal((await L.createTranslation('inesistente', 'en', uid, 'post')).ok, false);
  });

  await t.test('il cestino porta con sé le versioni, e il ripristino le riporta', async () => {
    const r = await D.trashDoc('page', 'novita', uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok((await D.getDoc('page', 'novita--en')).deleted_at);
    assert.equal((await D.restoreDoc('page', 'novita--en', uid)).ok, false, 'la versione si ripristina dopo la pagina di base');
    assert.equal((await D.restoreDoc('page', 'novita', uid)).ok, true);
    assert.equal((await D.getDoc('page', 'novita--en')).deleted_at, null);
    await D.trashDoc('page', 'novita', uid);
    assert.equal((await D.purgeDoc('page', 'novita')).ok, true);
    assert.equal(await D.getDoc('page', 'novita--en'), null, 'eliminate per sempre insieme');
  });

  await t.test('crea la versione mancante', async () => {
    await D.trashDoc('page', 'privacy--en', uid);
    assert.match((await L.createTranslation('privacy', 'en', uid)).error, /cestino/);
    await D.purgeDoc('page', 'privacy--en');
    const r = await L.createTranslation('privacy', 'en', uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.key, 'privacy--en');
  });

  await t.test('togliere una lingua mette in bozza tutte le sue pagine e articoli, riattivarla li ritrova', async () => {
    const np = await D.createPost({ title: 'Per la prova', slug: 'per-la-prova' }, uid);
    assert.equal(np.ok, true);
    const tr = (await D.getDoc('post', 'per-la-prova--en')).draft;
    await D.saveDraft('post', 'per-la-prova--en', { ...tr, status: 'published' }, uid);
    const pageTr = (await D.getDoc('page', 'contatti--en')).draft;
    assert.equal(pageTr.status, 'published', 'online in inglese prima di toglierla');
    const off = await L.applyLocales({ enabled: ['it'], def: 'it', tags: { it: 'it-CH' } }, uid);
    assert.equal(off.ok, true, JSON.stringify(off));
    assert.ok(off.disabled >= 2, 'almeno la pagina e l\'articolo pubblicati in inglese');
    for (const [kind, key] of [['page', 'contatti--en'], ['page', 'home--en'], ['post', 'per-la-prova--en']]) assert.equal((await D.getDoc(kind, key)).draft.status, 'draft', `${key} in bozza`);
    assert.equal((await D.getDoc('page', 'contatti--en')).deleted_at, null, 'non si perde niente: nel cestino non finisce');
    assert.equal((await D.getDoc('page', 'contatti')).draft.status, 'published', 'la lingua di base resta com\'è');
    const r = await D.publishAll(uid);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(fs.existsSync(path.join(out, 'en/contact-us/index.html')), false, 'l\'inglese non esce più dal sito');
    const on = await L.applyLocales({ enabled: ['it', 'en'], def: 'it', tags: { it: 'it-CH', en: 'en-GB' } }, uid);
    assert.equal(on.ok, true, JSON.stringify(on));
    assert.equal((await D.getDoc('page', 'contatti--en')).draft.name.en, 'Contact us', 'le versioni tornano com\'erano, in bozza');
    assert.equal((await D.getDoc('page', 'contatti--en')).draft.status, 'draft');
  });
});

test('lingue: i contenuti attuali possono essere assegnati a un\'altra lingua', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-out-'));
  process.env.SITE_OUT_DIR = out;
  const { query, closeDb } = await import('../lib/db.mjs');
  const D = await import('../lib/docs.mjs');
  const L = await import('../lib/languages.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); fs.rmSync(out, { recursive: true, force: true }); });
  await query("INSERT INTO users (email, name, password_hash, role) VALUES ('t@example.ch', 'T', 'x', 'admin')");
  await D.seedFromFiles({ userId: 1 });

  const r = await L.applyLocales({ enabled: ['it', 'de'], def: 'de', tags: { it: 'it-CH', de: 'de-CH' }, baseLang: 'de' }, 1);
  assert.equal(r.ok, true, JSON.stringify(r));
  const home = (await D.getDoc('page', 'home')).draft;
  assert.equal(home.lang, 'de');
  assert.ok(home.title.de, 'i testi sono ora in tedesco (la lingua scelta)');
  assert.equal(home.title.it, undefined);
  assert.equal(D.docState(await D.getDoc('page', 'home')), 'clean', 'bozza e pubblicato cambiano insieme');
  assert.ok((await D.getDoc('page', 'home--it')), 'e l\'italiano diventa una versione');
  const { validateData } = await import('../schema/validate.mjs');
  const data = await D.loadData('draft');
  assert.deepEqual(validateData(data).errors, [], 'la base tedesca è valida per lo schema');
});

test('lingua di base: testo da mostrare, riferimenti e pagine virtuali del blog', () => {
  assert.equal(baseOf({ locales: { base: 'de' } }), 'de');
  assert.equal(baseOf({ locales: {} }), 'it');
  assert.equal(textOf({ de: 'Hallo', it: 'Ciao' }, 'de', 'it'), 'Hallo');
  assert.equal(textOf({ en: 'Hi' }, 'de', 'it'), 'Hi', 'in mancanza, il primo testo disponibile');
  assert.equal(textOf(undefined, 'it'), '');
  // la pagina e le sue versioni non contano come riferimenti
  const docs = [
    { kind: 'page', key: 'servizi', data: { key: 'servizi', blocks: [] } },
    { kind: 'page', key: 'servizi--en', data: { key: 'servizi--en', translationOf: 'servizi', parent: 'servizi', blocks: [{ type: 'page', page: 'servizi' }] } },
    { kind: 'page', key: 'team', data: { key: 'team', parent: 'servizi', blocks: [] } },
  ];
  assert.deepEqual(findPageRefs(docs, 'servizi').map((r) => r.key), ['team'], 'solo la pagina figlia vera');
  // le pagine virtuali di categorie, tag e autori usano la lingua di base
  const site = { siteUrl: 'https://x.ch', locales: { default: 'de', base: 'de', enabled: ['de'], tags: { de: 'de-CH' } }, blog: { page: 'blog' } };
  const b = blogData({ site, pages: [{ key: 'blog', status: 'published', slug: { de: 'blog' } }], posts: [{ key: 'a', status: 'published', slug: { de: 'a' }, title: { de: 'A' }, date: '2020-01-01', categories: ['news'], tags: [], blocks: [] }], categories: { news: { name: { de: 'News' } } }, tags: {} });
  assert.deepEqual(b.pages.find((p) => p.key === 'category-news').slug, { de: 'categoria-news' });
});

test('media: titolo, testo alternativo, didascalia e descrizione anche per lingua', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, closeDb } = await import('../lib/db.mjs');
  const M = await import('../lib/media.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); });
  await query("INSERT INTO media (path, mime, width, height, bytes, source) VALUES ('uploads/x-1234567890.webp', 'image/webp', 10, 10, 10, 'upload')");
  assert.equal(await M.updateMeta('uploads/x-1234567890.webp', { alt: 'Un gatto', title: 'Gatto', i18n: { en: { alt: 'A cat', title: ' Cat ', caption: '' }, de: { alt: '' }, xx: { alt: 'ignorata' } } }), true);
  const item = (await query('SELECT * FROM media WHERE path = ?', ['uploads/x-1234567890.webp']))[0];
  assert.equal(item.alt, 'Un gatto');
  assert.deepEqual(JSON.parse(item.meta_i18n), { en: { alt: 'A cat', title: 'Cat' } }, 'solo le lingue note e i campi scritti');
  await M.updateMeta('uploads/x-1234567890.webp', { alt: 'Un gatto' });
  assert.equal((await query('SELECT meta_i18n FROM media WHERE path = ?', ['uploads/x-1234567890.webp']))[0].meta_i18n, null, 'svuotando le altre lingue non resta nulla');
});

test('articoli: le versioni in altre lingue escono con indirizzo e hreflang propri e l\'elenco segue la lingua', async () => {
  const { loadTemplateFrom } = await import('../lib/template.mjs');
  const { buildSite } = await import('../render/build.mjs');
  const { loadData } = await import('../render/context.mjs');
  const { stopRenderers } = await import('../render/host.mjs');
  const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const tpl = loadTemplateFrom(path.join(ROOT, 'templates/starter'));
  const d = structuredClone(loadData(tpl.dir));
  d.site.locales = { default: 'it', base: 'it', enabled: ['it', 'en'], tags: { it: 'it-CH', en: 'en-GB' } };
  const post = d.posts.find((p) => p.status === 'published');
  const other = d.posts.find((p) => p.key !== post.key && p.status === 'published');
  d.posts = d.posts.map((p) => ({ ...p, lang: 'it' }));
  d.translations = [];
  d.postTranslations = [{ ...makeTranslation(post, 'it', 'en'), status: 'published', title: { en: 'English title' }, slug: { en: 'english-slug' } }];
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-build-'));
  try {
    const r = await buildSite(d, { outDir: out, template: tpl, mediaDir: null });
    assert.ok(r.pages > 0);
    const files = fs.readdirSync(out, { recursive: true }).map(String);
    const en = files.find((f) => f.endsWith('english-slug/index.html'));
    assert.ok(en, 'la versione inglese dell\'articolo esce');
    assert.match(en, /^en\/.*english-slug\/index\.html$/);
    assert.equal(files.some((f) => f.startsWith('en/') && f.includes(other.slug.it)), false, 'gli altri articoli non hanno la versione inglese');
    const it = fs.readFileSync(path.join(out, files.find((f) => f.endsWith(`${post.slug.it}/index.html`) && !f.startsWith('en/'))), 'utf8');
    assert.match(it, /hreflang="en-GB" href="[^"]*english-slug\/"/);
    const html = fs.readFileSync(path.join(out, en), 'utf8');
    assert.match(html, /<html[^>]*lang="en-GB"/);
    assert.match(html, /English title/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
    stopRenderers();
  }
});

test('catalogo delle lingue: tutte quelle ISO 639-1, accettate nei testi; codici sconosciuti no', async () => {
  const { LOCALES, DEFAULT_TAG, langName, TAG_PATTERN } = await import('../render/locales.mjs');
  const { loadTemplateFrom } = await import('../lib/template.mjs');
  const { loadData } = await import('../render/context.mjs');
  const { validateData } = await import('../schema/validate.mjs');
  assert.ok(LOCALES.length >= 180);
  assert.equal(new Set(LOCALES).size, LOCALES.length);
  assert.deepEqual(LOCALES.slice(0, 4), ['it', 'en', 'de', 'fr'], 'le quattro di prima restano in testa');
  assert.equal(langName('es', 'it'), 'Spagnolo');
  assert.equal(langName('es', 'en'), 'Spanish');
  assert.equal(DEFAULT_TAG.es, 'es-ES');
  assert.equal(DEFAULT_TAG.eo, 'eo', 'senza un paese ovvio vale la sola lingua');
  assert.ok(Object.values(DEFAULT_TAG).every((t) => new RegExp(TAG_PATTERN).test(t)));
  const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const tpl = loadTemplateFrom(path.join(ROOT, 'templates/starter'));
  const d = structuredClone(loadData(tpl.dir));
  d.site.locales = { default: 'it', enabled: ['it', 'es'], tags: { it: 'it-CH', es: 'es-ES' } };
  d.pages[0].title = { ...d.pages[0].title, es: 'Inicio' };
  assert.deepEqual(validateData(d, tpl).errors, [], 'spagnolo e codice es-ES sono validi');
  d.pages[0].title = { ...d.pages[0].title, zz: 'x' };
  assert.ok(validateData(d, tpl).errors.length > 0, 'una lingua che non esiste no');
});
