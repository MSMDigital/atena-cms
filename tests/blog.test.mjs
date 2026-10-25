// Blog: articoli e categorie diventano pagine «virtuali» (indirizzi, ordine, bozze, categorie senza articoli) e si validano.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blogData, withBlog, supportsBlog } from '../schema/blog.mjs';
import { validateData } from '../schema/validate.mjs';
import { createContext, loadData } from '../render/context.mjs';
import { loadTemplateFrom } from '../lib/template.mjs';
import { buildSite } from '../render/build.mjs';
import { stopRenderers } from '../render/host.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tpl = loadTemplateFrom(path.join(ROOT, 'templates/starter'));
test.after(() => stopRenderers());
const data = () => structuredClone(loadData(tpl.dir));

test('solo i template con il blocco «posts-list» supportano il blog', () => {
  assert.equal(supportsBlog(tpl), true);
  // lo stesso template senza il blocco «posts-list»: il blog non è supportato
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-noblog-'));
  try {
    fs.cpSync(tpl.dir, copy, { recursive: true });
    const file = path.join(copy, 'schema/blocks.json');
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    schema.blocks = schema.blocks.filter((b) => !b.$id?.endsWith('/posts-list.json'));
    fs.writeFileSync(file, JSON.stringify(schema));
    assert.equal(supportsBlog(loadTemplateFrom(copy)), false);
  } finally { fs.rmSync(copy, { recursive: true, force: true }); }
});

test('blogData: pagine sotto quella del blog, dal più recente; le bozze restano fuori; una pagina per categoria con articoli', () => {
  const d = data();
  d.posts.push({ ...structuredClone(d.posts[0]), key: 'bozza', status: 'draft', slug: { it: 'bozza' }, date: '2026-12-01', categories: ['guide'] });
  d.categories.vuota = { name: { it: 'Vuota' } };
  const b = blogData(d);
  assert.deepEqual(b.blog.posts.map((p) => p.key), ['come-usare-i-moduli', 'benvenuto-nel-blog']);
  assert.deepEqual(Object.keys(b.blog.categories).sort(), ['guide', 'novita'], 'niente categoria senza articoli pubblicati');
  const p = b.pages.find((x) => x.key === 'post-benvenuto-nel-blog');
  assert.equal(p.parent, 'blog');
  assert.equal(p.ogType, 'article');
  assert.equal(p.title.it, 'Benvenuto nel blog | Studio Esempio');
  assert.equal(p.post.categories[0], 'novita');
  assert.equal(blogData(d, { previewKey: 'bozza' }).blog.posts[0].key, 'bozza', 'l\'anteprima mostra anche la bozza aperta');
});

test('ctx.posts / ctx.categories: indirizzi, filtro per categoria e limite', () => {
  const d = withBlog(data());
  const ctx = createContext(d, 'it');
  assert.equal(ctx.posts().length, 2);
  assert.deepEqual(ctx.posts({ category: 'guide' }).map((p) => p.path), ['/blog/come-usare-i-moduli/']);
  assert.equal(ctx.posts({ limit: 1 }).length, 1);
  assert.deepEqual(ctx.categories().map((c) => [c.key, c.count, c.path]).sort(), [['guide', 1, '/blog/categoria-guide/'], ['novita', 2, '/blog/categoria-novita/']]);
});

test('validazione: categoria inesistente, indirizzo già usato, articolo in bozza = solo avvisi', () => {
  const d = data();
  assert.deepEqual(validateData(d, tpl).errors, []);
  d.posts[0].categories = ['non-esiste'];
  assert.match(validateData(d, tpl).errors.join('\n'), /La categoria "non-esiste" non esiste/);
  d.posts[0].categories = [];
  d.posts[1].slug = { it: d.posts[0].slug.it };
  assert.match(validateData(d, tpl).errors.join('\n'), /Lo stesso indirizzo \/blog\/.* è già usato/);
  d.posts[0].status = 'draft'; d.posts[0].categories = ['x'];
  const r = validateData(d, tpl);
  assert.deepEqual(r.errors.filter((e) => /post|articolo|categoria/i.test(e) && /x/.test(e)), [], 'una bozza non blocca la pubblicazione');
});

test('pubblicazione: articoli e categorie nel sito, nella sitemap e con JSON-LD Article; le bozze non escono', async () => {
  const d = data();
  d.posts.push({ ...structuredClone(d.posts[0]), key: 'segreto', status: 'draft', slug: { it: 'segreto' }, title: { it: 'Segreto' } });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-blog-')), 'dist');
  await buildSite(d, { outDir: out, assetsDir: path.join(tpl.dir, 'assets'), template: tpl });
  for (const f of ['blog/index.html', 'blog/benvenuto-nel-blog/index.html', 'blog/categoria-guide/index.html']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.equal(fs.existsSync(path.join(out, 'blog/segreto/index.html')), false);
  const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sm, /\/blog\/come-usare-i-moduli\//);
  assert.doesNotMatch(sm, /segreto/);
  const post = fs.readFileSync(path.join(out, 'blog/come-usare-i-moduli/index.html'), 'utf8');
  assert.match(post, /"@type":"Article"/);
  assert.match(post, /<h1>Come usare i moduli<\/h1>/);
  assert.match(fs.readFileSync(path.join(out, 'blog/index.html'), 'utf8'), /Benvenuto nel blog/);
});

test('tag: elenco gestito, pagina per tag con articoli, filtro, tag inesistente = errore', () => {
  const d = data();
  d.tags.vuoto = { name: { it: 'Vuoto' } };
  const b = blogData(d);
  assert.deepEqual(Object.keys(b.blog.tags).sort(), ['guide-pratiche', 'novita', 'smart-working'], 'niente tag senza articoli pubblicati');
  assert.ok(b.pages.some((p) => p.key === 'tag-smart-working' && p.tagKey === 'smart-working' && p.description.it));
  const ctx = createContext(withBlog(d), 'it');
  assert.equal(ctx.posts({ tag: 'smart-working' }).length, 2);
  assert.deepEqual(ctx.posts({ tag: 'novita' }).map((p) => p.tags.map((t) => t.path)), [['/blog/tag-novita/', '/blog/tag-smart-working/']]);
  assert.deepEqual(ctx.tags().map((t) => [t.key, t.count, t.path]).sort(), [['guide-pratiche', 1, '/blog/tag-guide-pratiche/'], ['novita', 1, '/blog/tag-novita/'], ['smart-working', 2, '/blog/tag-smart-working/']]);
  assert.deepEqual(validateData(d, tpl).errors, []);
  d.posts[0].tags = ['non-esiste'];
  assert.match(validateData(d, tpl).errors.join('\n'), /Il tag "non-esiste" non esiste/);
});

test('pubblicazione pianificata: fuori dal sito finché l\'ora non passa, poi esce con la data di uscita', () => {
  const d = data();
  d.posts[0].status = 'scheduled';
  d.posts[0].publishAt = '2026-11-03T09:00';
  const key = d.posts[0].key;
  assert.equal(blogData(d, { now: '2026-11-03T08:59' }).blog.posts.some((p) => p.key === key), false, 'un minuto prima: nascosto');
  const after = blogData(d, { now: '2026-11-03T09:00' });
  const p = after.blog.posts.find((x) => x.key === key);
  assert.ok(p, 'all\'ora esatta: online');
  assert.equal(p.date, '2026-11-03', 'la data è quella di uscita');
  assert.equal(blogData(d, { now: '2026-11-03T08:59', previewKey: key }).blog.posts.some((x) => x.key === key), true, 'l\'anteprima lo mostra');
  assert.deepEqual(validateData(d, tpl).errors, []);
  delete d.posts[0].publishAt;
  assert.match(validateData(d, tpl).errors.join('\n'), /Indica quando pubblicare/);
});

test('semaforo SEO / GEO: rosso senza riassunto e autore, verde con tutto a posto', async () => {
  const { checkPost } = await import('../lib/post-seo.mjs');
  const bad = checkPost({ title: { it: 'Ciao' }, blocks: [] });
  assert.equal(bad.seo.level, 'red');
  assert.equal(bad.geo.level, 'red');
  const empty = checkPost({});
  assert.ok(empty.seo.checks.some((c) => /Manca il titolo/.test(c.text)) && empty.geo.checks.some((c) => /Manca l'autore/.test(c.text)), 'anche a campi vuoti elenca i controlli');
  const mid = checkPost({ title: { it: 'Come scegliere il template giusto' }, excerpt: { it: 'x'.repeat(100) }, author: 'A', categories: ['c'], focusKeyword: 'template' });
  assert.ok(mid.seo.checks.some((c) => c.level === 'ok' && /Titolo SEO: 33 caratteri/.test(c.text)), 'mostra la lunghezza attuale del titolo');
  assert.ok(mid.seo.checks.some((c) => c.level === 'warn' && /non compare nella descrizione/.test(c.text)), 'controlla la coerenza con la parola chiave');
  const words = Array.from({ length: 320 }, (_, i) => `parola${i}`).join(' ');
  const good = checkPost({
    title: { it: 'Come scegliere il template giusto per il sito' }, excerpt: { it: 'Una guida pratica per capire quale template scegliere, in base al tipo di sito, ai contenuti e al pubblico che vuoi raggiungere.' },
    image: '/media/a.webp', author: 'Anna', categories: ['guide'], dateModified: '2026-01-01', focusKeyword: 'template', slug: { it: 'come-scegliere-il-template' },
    facts: [{ label: { it: 'Anno' }, value: { it: '2026' } }], blocks: [{ id: 'x', type: 'text', content: { it: `<p>${words}</p>` } }],
  });
  assert.equal(good.seo.level, 'green', JSON.stringify(good.seo.issues));
  assert.equal(good.geo.level, 'green', JSON.stringify(good.geo.issues));
});

test('editor: tag, categorie e autore dell\'articolo usano il loro selettore, non l\'elenco generico', async () => {
  const { createModel } = await import('../lib/schema-form.mjs');
  const { schemasFor } = await import('../schema/index.mjs');
  const s = schemasFor(tpl);
  const model = createModel(s.allSchemas);
  const prop = (k) => s.post.properties[k];
  assert.equal(model.kindOf(prop('tags')).kind, 'tagPicker');
  assert.equal(model.kindOf(prop('categories')).kind, 'categoryPicker');
  assert.equal(model.kindOf(prop('author')).kind, 'authorRef');
  assert.equal(model.kindOf(prop('publishAt')).kind, 'string');
});

test('articolo: campi SEO e GEO, testo con immagine e video escono nella pagina e nei dati strutturati', async () => {
  const img = fs.readdirSync(path.join(tpl.dir, 'assets/img')).find((f) => /\.(webp|jpg|png)$/.test(f));
  const d = data();
  const p = d.posts[0];
  Object.assign(p, {
    seoTitle: { it: 'Titolo per Google' }, seoDescription: { it: 'Descrizione per Google' }, noindex: true, geoSummary: { it: 'Riassunto per le AI.' },
    facts: [{ label: { it: 'Anno' }, value: { it: '2026' } }], faq: [{ question: { it: 'Perché?' }, answer: { it: 'Perché sì.' } }],
  });
  p.blocks = [{ id: 'rich-1', type: 'text', surface: 'light', content: { it: `<p style="text-align:center;">Ciao</p><img src="/assets/img/${img}" alt="Foto"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Video" loading="lazy" allowfullscreen></iframe>` } }];
  assert.deepEqual(validateData(d, tpl).errors, []);
  const b = blogData(d);
  const page = b.pages.find((x) => x.key === `post-${p.key}`);
  assert.equal(page.title.it, 'Titolo per Google | Studio Esempio');
  assert.equal(page.description.it, 'Descrizione per Google');
  assert.equal(page.noindex, true);
  assert.equal(page.geoSummary.it, 'Riassunto per le AI.');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-blog-')), 'dist');
  await buildSite(d, { outDir: out, assetsDir: path.join(tpl.dir, 'assets'), template: tpl });
  const html = fs.readFileSync(path.join(out, `blog/${p.slug.it}/index.html`), 'utf8');
  assert.match(html, /<p style="text-align:center;">Ciao<\/p>/);
  assert.match(html, new RegExp(`<img src="/assets/img/${img.replace('.', '\\.')}" alt="Foto">`));
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(html, /"abstract":"Riassunto per le AI\."/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /noindex/);
});

test('semaforo delle pagine: titolo, descrizione, parola chiave, riassunto per le AI; la home non ha indirizzo da controllare', async () => {
  const { checkPage } = await import('../lib/post-seo.mjs');
  const empty = checkPage({ blocks: [] });
  assert.equal(empty.seo.level, 'red');
  assert.ok(empty.seo.checks.some((c) => /Manca il titolo SEO/.test(c.text)));
  const words = Array.from({ length: 160 }, (_, i) => `parola${i}`).join(' ');
  const page = {
    title: { it: 'Traslochi in Ticino con esperienza' }, description: { it: 'Traslochi privati e aziendali in tutto il Ticino: preventivo gratuito, squadre esperte e assicurazione inclusa nel servizio.' },
    focusKeyword: 'traslochi', slug: { it: '' }, ogImage: { src: 'a.webp' }, geoSummary: { it: 'Azienda di traslochi in Ticino: servizi, zone servite, preventivo gratuito e assicurazione inclusa per ogni cliente.' },
    facts: [{ label: { it: 'Anno' }, value: { it: '2001' } }], dateModified: '2026-01-01', blocks: [{ id: 'x', type: 'text', content: { it: `<p>${words}</p>` } }],
  };
  const ok = checkPage(page);
  assert.equal(ok.seo.level, 'green', JSON.stringify(ok.seo.issues));
  assert.equal(ok.geo.level, 'green', JSON.stringify(ok.geo.issues));
  assert.equal(ok.seo.checks.some((c) => /nell'indirizzo/.test(c.text)), false, 'home: indirizzo vuoto, nessun controllo');
  assert.ok(checkPage({ ...page, focusKeyword: 'giardinaggio' }).seo.issues.some((c) => /non compare nel titolo/.test(c.text)));
  assert.ok(checkPage({ ...page, noai: true }).geo.issues.some((c) => /esclusa dai motori di intelligenza artificiale/.test(c.text)));
  assert.equal(checkPage({ ...page, ogImage: undefined }).seo.issues.some((c) => /immagine di condivisione/.test(c.text)), true);
  assert.equal(checkPage({ ...page, ogImage: undefined }, { defaultOg: true }).seo.issues.length, 0, 'l\'immagine predefinita del sito basta');
});

test('pagine: parola chiave, riassunto per le AI e autore dagli utenti sono campi validi della pagina', () => {
  const d = data();
  Object.assign(d.pages[0], { focusKeyword: 'moduli', geoSummary: { it: 'Riassunto.' }, author: 'Anna' });
  assert.deepEqual(validateData(d, tpl).errors, []);
});

test('autori: pagina pubblica solo se attivata, indicizzazione, filtro, dati strutturati; niente dati riservati', async () => {
  const authors = [
    { username: 'anna', name: 'Anna Rossi', description: 'Scrivo di organizzazione.', avatar: 'demo-1.jpg', linkedin: 'https://www.linkedin.com/in/anna', socials: [{ label: 'Instagram', url: 'https://instagram.com/anna' }], seo: { jobTitle: 'Coach', knowsAbout: ['leadership'] } },
    { username: 'bruno', name: 'Bruno Bianchi', description: '', avatar: '', linkedin: '', socials: [], seo: { noindex: true } },
  ];
  const d = data();
  d.authors = authors;
  d.posts[0].author = 'Anna Rossi';       // per nome
  d.posts[1].author = 'bruno';            // per nome utente
  // spenta (default): nessuna pagina e nessun profilo
  const off = blogData(d);
  assert.equal(off.pages.some((p) => p.authorKey), false);
  assert.equal(off.pages.find((p) => p.post)?.authorProfile, undefined);
  // accesa
  d.site.authors = { enabled: true, indexable: true };
  const on = blogData(d);
  const pa = on.pages.find((p) => p.key === 'author-anna');
  assert.ok(pa && pa.contentType === 'profile' && !pa.noindex);
  assert.deepEqual(pa.profile.sameAs, ['https://www.linkedin.com/in/anna', 'https://instagram.com/anna']);
  assert.equal(pa.blocks[0].author, 'anna');
  assert.equal(on.pages.find((p) => p.key === 'author-bruno').noindex, true, 'l\'autore può escludersi dall\'indicizzazione');
  assert.equal(on.blog.posts.find((p) => p.key === d.posts[1].key).authorKey, 'bruno');
  // indicizzazione spenta per tutti
  d.site.authors.indexable = false;
  assert.equal(blogData(d).pages.find((p) => p.key === 'author-anna').noindex, true);
  d.site.authors.indexable = true;
  // contesto
  const ctx = createContext(withBlog(d), 'it');
  assert.deepEqual(ctx.posts({ author: 'anna' }).map((p) => p.authorPath), ['/blog/autore-anna/']);
  assert.equal(ctx.authors().length, 2);
  assert.deepEqual(validateData(d, tpl).errors, []);
  // build: pagina autore, JSON-LD Person/ProfilePage, sitemap senza l'autore noindex
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-blog-')), 'dist');
  d.avatarFix = undefined;
  await buildSite(d, { outDir: out, assetsDir: path.join(tpl.dir, 'assets'), template: tpl });
  const page = fs.readFileSync(path.join(out, 'blog/autore-anna/index.html'), 'utf8');
  assert.match(page, /<h1>Anna Rossi<\/h1>/);
  assert.match(page, /"@type":"ProfilePage"/);
  assert.match(page, /"@type":"Person"/);
  assert.match(page, /"jobTitle":"Coach"/);
  assert.match(page, /instagram\.com\/anna/);
  const art = fs.readFileSync(path.join(out, `blog/${d.posts[0].slug.it}/index.html`), 'utf8');
  assert.match(art, /<a href="\/blog\/autore-anna\/">Anna Rossi<\/a>/);
  assert.match(art, /"author":\{"@type":"Person","name":"Anna Rossi","url":"[^"]*\/blog\/autore-anna\/"/);
  const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sm, /autore-anna/);
  assert.doesNotMatch(sm, /autore-bruno/);
  const all = fs.readdirSync(out, { recursive: true }).filter((f) => String(f).endsWith('.html')).map((f) => fs.readFileSync(path.join(out, f), 'utf8')).join('\n');
  assert.doesNotMatch(all, /@example\.ch|password_hash/, 'nessun dato riservato nel sito');
});
