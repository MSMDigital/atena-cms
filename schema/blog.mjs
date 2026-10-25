// Blog: articoli e categorie. Un articolo è un documento (kind "post") con i suoi campi e i blocchi del template; alla pubblicazione (e
// nell'anteprima) il motore lo trasforma in una pagina «virtuale» dell'indirizzo /<pagina-del-blog>/<slug>/, e crea una pagina per ogni
// categoria con articoli (/<pagina-del-blog>/categoria-<chiave>/). Le pagine virtuali non si salvano: si ricalcolano a ogni build, così
// sitemap, SEO/GEO, hreflang, briciole e JSON-LD funzionano come per le pagine normali, senza codice in più nel template.
//
// Un template «supporta il blog» se ha il blocco `posts-list` (elenco di articoli, con i campi `category` e `limit`): per le pagine di
// categoria il motore ne mette uno. Le pagine virtuali portano `page.post` (titolo, data, autore, immagine, categorie, descrizione):
// il template, se c'è, mostra con quello l'intestazione dell'articolo.
import { BASE, LOCALES, ref, text, textLong, image } from './common.mjs';
import { facts, faq } from './seo.mjs';
import { indexTranslations } from '../render/translations.mjs';

// Campi dell'articolo che nell'editor stanno nel blocco espandibile «SEO e GEO» (in questo ordine, divisi in SEO e GEO).
export const SEO_FIELDS = ['seoTitle', 'seoDescription', 'ogImage', 'focusKeyword', 'noindex'];
export const GEO_FIELDS = ['geoSummary', 'facts', 'faq', 'dateModified', 'noai'];

export const BLOG_BLOCK = 'posts-list';
export const supportsBlog = (tpl) => !!tpl?.schema?.blocks?.blocks?.some((b) => b.$id?.endsWith(`/${BLOG_BLOCK}.json`));

const KEY = '^[a-z0-9][a-z0-9-]*$';

// Chiave (indirizzo) da un nome: «Cambio carriera!» → «cambio-carriera». Per categorie e tag creati al volo.
export const keyOf = (name) => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Pubblicazione pianificata: lo stato «scheduled» + `publishAt` (data e ora locali, «2026-11-03T09:30», fuso Europe/Zurich come il resto
// del CMS). Un articolo pianificato resta fuori dal sito finché l'ora non è passata: lo decide il build, ogni volta che gira.
export const zurichNow = (date = new Date(), tz = 'Europe/Zurich') => date.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 16).replace(' ', 'T');   // il fuso è quello del sito (Impostazioni → Generale)
export const isDue = (p, now = zurichNow()) => p?.status === 'scheduled' && typeof p.publishAt === 'string' && p.publishAt <= now;
export const isLivePost = (p, { now = zurichNow(), previewKey = null } = {}) => !!p?.key && (p.status === 'published' || isDue(p, now) || p.key === previewKey);

export function buildBlogSchemas(blockUnion) {
  const post = {
    $id: `${BASE}post.json`,
    title: 'Articolo',
    type: 'object',
    properties: {
      key: { type: 'string', pattern: KEY, title: 'Chiave', description: 'Identificatore stabile. Non cambia se cambia l\'indirizzo.' },
      status: { title: 'Stato', enum: ['draft', 'scheduled', 'published'], default: 'draft' },
      lang: { title: 'Lingua dei testi', enum: LOCALES, description: 'La lingua in cui sono scritti i testi di questo articolo. Vuota: la lingua di base del sito.' },
      translationOf: { type: 'string', pattern: KEY, title: 'Traduzione di', description: 'Se questo articolo è la versione in un\'altra lingua di un articolo, la chiave dell\'articolo di base.' },
      publishAt: { title: 'Pubblica il', type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:00$', 'x-widget': 'datetime', 'x-when': { status: ['scheduled'] }, description: 'Data e ora intera, nel fuso orario del sito (Impostazioni → Generale). Il controllo gira una volta all\'ora: l\'articolo esce alla prima esecuzione dopo quell\'ora.' },
      slug: { title: 'Indirizzo', type: 'object', description: 'Un indirizzo per lingua, sotto la pagina del blog.', properties: Object.fromEntries(LOCALES.map((l) => [l, { type: 'string', pattern: '^[a-z0-9-]+$' }])), required: ['it'], additionalProperties: false },
      title: text('Titolo'),
      excerpt: textLong('Riassunto', { description: 'Due righe per gli elenchi, le condivisioni e i motori di ricerca (è anche la descrizione SEO).' }),
      image: image('Immagine in evidenza'),
      categories: { title: 'Categorie', type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string', pattern: KEY }, 'x-widget': 'categories' },
      tags: { title: 'Tag', type: 'array', maxItems: 30, uniqueItems: true, items: { type: 'string', pattern: KEY }, 'x-widget': 'tags', description: 'Parole chiave più precise delle categorie. Si creano da Articoli → Tag.' },
      // SEO e GEO (nell'editor stanno nel blocco «SEO e GEO»; vedi SEO_FIELDS)
      seoTitle: text('Titolo SEO', { description: 'Il titolo per Google (il tag <title>). Vuoto: si usa il titolo dell\'articolo. Meglio tra 20 e 65 caratteri.' }),
      seoDescription: textLong('Descrizione SEO', { description: 'Il testo sotto il titolo nei risultati di Google. Vuoto: si usa il riassunto. Meglio tra 70 e 170 caratteri.' }),
      ogImage: image('Immagine di condivisione', { description: 'Anteprima nei social e nelle risposte delle AI. Vuota: si usa l\'immagine in evidenza.' }),
      focusKeyword: { title: 'Parola chiave principale', type: 'string', maxLength: 80, description: 'La ricerca per cui vuoi essere trovato. Il semaforo SEO controlla che compaia nel titolo e nella descrizione.' },
      noindex: { title: 'Non indicizzare (SEO)', type: 'boolean', default: false, description: 'Chiede ai motori di ricerca di non mostrare l\'articolo.' },
      geoSummary: textLong('Riassunto per le AI', { description: 'Due o tre frasi neutre che rispondono a «di cosa parla questo articolo?»: le AI le possono citare. Finisce nei dati strutturati (abstract), non nel testo.' }),
      facts: facts('Fatti chiave dell\'articolo'),
      faq: { ...faq, title: 'Domande frequenti dell\'articolo (dati strutturati)' },
      noai: { title: 'Escludi dai motori di intelligenza artificiale (GEO)', type: 'boolean', default: false, description: 'Chiede a ChatGPT, Perplexity e simili di non usare l\'articolo per rispondere. È un segnale: il crawler deve rispettarlo.' },
      date: { title: 'Data di pubblicazione', type: 'string', format: 'date', description: 'Gli articoli si ordinano dal più recente.' },
      dateModified: { title: 'Ultima modifica sostanziale', type: 'string', format: 'date' },
      author: { title: 'Autore', type: 'string', maxLength: 120, 'x-widget': 'author', description: 'Uno degli utenti del CMS.' },
      blocks: { title: 'Contenuto', type: 'array', items: blockUnion },
    },
    required: ['key', 'status', 'slug', 'title', 'date', 'blocks'],
    additionalProperties: false,
  };
  const categories = {
    $id: `${BASE}categories.json`,
    title: 'Categorie del blog',
    type: 'object',
    'x-item': 'categoria',
    propertyNames: { pattern: KEY },
    additionalProperties: { type: 'object', properties: { name: text('Nome'), description: textLong('Descrizione (facoltativa)') }, required: ['name'], additionalProperties: false },
  };
  const tags = {
    $id: `${BASE}tags.json`,
    title: 'Tag del blog',
    type: 'object',
    'x-item': 'tag',
    propertyNames: { pattern: KEY },
    additionalProperties: { type: 'object', properties: { name: text('Nome'), description: textLong('Descrizione (facoltativa)') }, required: ['name'], additionalProperties: false },
  };
  return { post, categories, tags };
}

export const siteBlog = {
  title: 'Blog',
  description: 'Dove si trovano gli articoli.',
  type: 'object',
  properties: {
    page: { ...ref('pageKey'), title: 'Pagina del blog', default: 'blog', description: 'La pagina con l\'elenco degli articoli (di solito «blog»): gli articoli e le categorie stanno sotto il suo indirizzo.' },
  },
  additionalProperties: false,
};

// Autori (gli utenti del CMS): in Impostazioni → SEO & Geo si sceglie se hanno una pagina pubblica e se i motori di ricerca possono indicizzarla.
export const siteAuthors = {
  title: 'Autori',
  description: 'Una pagina pubblica per ogni autore (utenti con ruolo Autore o Amministratore con almeno un articolo pubblicato): biografia, social e i suoi articoli. I dati dell\'autore si gestiscono in Utenti. Anche gli articoli firmati ne guadagnano in dati strutturati (chi scrive, profili social, competenze).',
  type: 'object',
  properties: {
    enabled: { title: 'Attiva le pagine autore', type: 'boolean', default: false, description: 'Spento: nel sito l\'autore è solo un nome nell\'articolo e non si pubblicano profili né dati personali.' },
    indexable: { title: 'Fai indicizzare le pagine autore', type: 'boolean', default: true, description: 'Spento: le pagine autore restano visibili ma chiedono ai motori di ricerca di non indicizzarle (noindex) e non entrano nella sitemap. Ogni autore può inoltre escludersi dal proprio profilo.' },
  },
  additionalProperties: false,
};

const same = (s, a) => String(s ?? '').trim().toLowerCase() === String(a ?? '').trim().toLowerCase();
// Il campo «autore» di un contenuto (nome utente o nome) → il profilo pubblico, se c'è.
export const authorOf = (value, authors = []) => (value ? authors.find((a) => same(a.username, value) || same(a.name, value)) ?? null : null);
const profileOf = (a) => ({
  username: a.username, name: a.name, description: a.description || null, avatar: a.avatar || null, jobTitle: a.seo?.jobTitle ?? null, knowsAbout: a.seo?.knowsAbout ?? [],
  sameAs: [a.linkedin, ...(a.socials ?? []).map((s) => s.url)].filter(Boolean),
  links: [...(a.linkedin ? [{ label: 'LinkedIn', url: a.linkedin }] : []), ...(a.socials ?? []).map((s) => ({ label: s.label, url: s.url }))],
});

const mapText = (v, f) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([l, s]) => [l, f(s, l)])) : v);

// Pagine virtuali e dati del blog. `previewKey`: un articolo che si vuole vedere anche se è in bozza (anteprima dell'editor).
export function blogData({ site, pages = [], posts = [], postTranslations = [], categories = {}, tags = {}, authors = [], settings = null }, { previewKey = null, now = zurichNow(new Date(), settings?.timezone) } = {}) {
  const L = site?.locales?.base ?? 'it';   // la lingua dei contenuti di base
  const base = site?.blog?.page ?? 'blog';
  const parent = pages.some((p) => p.key === base) ? base : null;
  const name = site?.seo?.siteName ?? '';
  const previewBase = typeof previewKey === 'string' ? previewKey.split('--')[0] : null;
  const live = posts.filter((p) => isLivePost(p, { now, previewKey }) || p.key === previewBase).map((p) => (p.status === 'scheduled' && p.publishAt ? { ...p, date: p.publishAt.slice(0, 10) } : p));   // pianificato: la data è quella di uscita
  live.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || a.key.localeCompare(b.key));
  const withName = (t) => mapText(t, (s) => (name ? `${s} | ${name}` : s));
  const catOf = (k) => categories?.[k];
  const tagOf = (k) => tags?.[k];
  const authorsOn = !!site?.authors?.enabled;
  const authorIn = (p) => (authorsOn ? authorOf(p.author, authors) : null);
  const trBy = indexTranslations(postTranslations);   // le versioni in altre lingue degli articoli
  const virtual = [];
  const virtualTr = [];
  const used = new Set();
  const usedAuthors = new Set();
  const usedTags = new Set();
  for (const p of live) {
    (p.categories ?? []).forEach((c) => { if (catOf(c)) used.add(c); });
    (p.tags ?? []).forEach((t) => { if (tagOf(t)) usedTags.add(t); });
    const au = authorIn(p);
    if (au) usedAuthors.add(au.username);
    const asPage = (d, key) => ({
      key, status: 'published', parent, slug: d.slug, name: d.title, title: withName(d.seoTitle ?? d.title),
      description: d.seoDescription ?? d.excerpt ?? d.title, ...(d.ogImage ?? d.image ? { ogImage: d.ogImage ?? d.image } : {}), ogType: 'article', contentType: 'article',
      ...(d.noindex ? { noindex: true } : {}), ...(d.noai ? { noai: true } : {}), ...(d.facts?.length ? { facts: d.facts } : {}), ...(d.faq?.length ? { faq: d.faq } : {}), ...(d.geoSummary ? { geoSummary: d.geoSummary } : {}),
      datePublished: d.date ?? p.date, ...(d.dateModified ? { dateModified: d.dateModified } : {}), ...(d.author ? { author: d.author } : {}),
      blocks: d.blocks ?? [],
      ...(au ? { author: au.name, authorProfile: profileOf(au), authorPage: `author-${au.username}` } : {}),
      post: { key: p.key, title: d.title, excerpt: d.excerpt ?? null, image: d.image ?? null, date: p.date, author: au?.name ?? p.author ?? null, authorKey: au?.username ?? null, categories: (p.categories ?? []).filter(catOf), tags: (p.tags ?? []).filter(tagOf) },
    });
    virtual.push({ ...asPage(p, `post-${p.key}`), ...(p.lang ? { lang: p.lang } : {}) });
    // Le versioni in altre lingue (pubblicate, o quella che si sta guardando in anteprima) sono pagine virtuali «traduzione» della pagina dell'articolo.
    for (const tr of Object.values(trBy[p.key] ?? {})) {
      if (!isLivePost(tr, { now, previewKey })) continue;
      virtualTr.push({ ...asPage(tr, `post-${p.key}--${tr.lang}`), translationOf: `post-${p.key}`, lang: tr.lang });
    }
  }
  for (const k of used) {
    const c = categories[k];
    virtual.push({
      key: `category-${k}`, status: 'published', parent, slug: { [L]: `categoria-${k}` }, name: c.name, title: withName(c.name), description: c.description ?? c.name,
      blocks: [{ id: `category-${k}-list`, type: BLOG_BLOCK, category: k, title: c.name }], categoryKey: k,
    });
  }
  for (const k of usedTags) {
    const t = tags[k];
    virtual.push({
      key: `tag-${k}`, status: 'published', parent, slug: { [L]: `tag-${k}` }, name: t.name, title: withName(t.name), description: t.description ?? t.name,
      blocks: [{ id: `tag-${k}-list`, type: BLOG_BLOCK, tag: k, title: t.name }], tagKey: k,
    });
  }
  const indexable = site?.authors?.indexable !== false;
  for (const u of usedAuthors) {
    const a = authors.find((x) => x.username === u);
    const desc = a.seo?.description ?? (a.description ? a.description.replace(/\s+/g, ' ').slice(0, 160) : `Gli articoli di ${a.name}.`);
    virtual.push({
      key: `author-${u}`, status: 'published', parent, slug: { [L]: `autore-${u}` }, name: { [L]: a.name }, title: withName({ [L]: a.seo?.title ?? a.name }), description: { [L]: desc },
      ...(a.avatar ? { ogImage: { src: a.avatar, alt: { [L]: a.name } } } : {}), ...(!indexable || a.seo?.noindex ? { noindex: true } : {}),
      contentType: 'profile', blocks: [{ id: `author-${u}-list`, type: BLOG_BLOCK, author: u, title: { [L]: a.name } }], authorKey: u, profile: profileOf(a),
    });
  }
  // Nell'elenco i testi di ogni lingua stanno insieme: { it: titolo, en: title }; la pagina dice poi in quali lingue l'articolo è online.
  const merged = (p, field) => { const m = { ...(p[field] && typeof p[field] === 'object' ? p[field] : {}) }; for (const tr of Object.values(trBy[p.key] ?? {})) if (tr[field] && typeof tr[field] === 'object') Object.assign(m, tr[field]); return Object.keys(m).length ? m : null; };
  const list = live.map((p) => ({ key: p.key, pageKey: `post-${p.key}`, title: merged(p, 'title') ?? p.title, excerpt: merged(p, 'excerpt'), image: p.image ?? null, date: p.date, author: authorIn(p)?.name ?? p.author ?? null, authorKey: authorIn(p)?.username ?? null, categories: (p.categories ?? []).filter(catOf), tags: (p.tags ?? []).filter(tagOf) }));
  return {
    pages: virtual,
    translations: virtualTr,
    blog: {
      posts: list,
      categories: Object.fromEntries([...used].map((k) => [k, { ...categories[k], pageKey: `category-${k}` }])),
      tags: Object.fromEntries([...usedTags].map((k) => [k, { ...tags[k], pageKey: `tag-${k}` }])),
      authors: Object.fromEntries([...usedAuthors].map((u) => { const a = authors.find((x) => x.username === u); return [u, { name: a.name, jobTitle: a.seo?.jobTitle ?? null, description: a.description || null, avatar: a.avatar || null, pageKey: `author-${u}` }]; })),
    },
  };
}

// I dati con le pagine virtuali aggiunte (da usare dopo la validazione, prima del rendering).
export function withBlog(data, opts) {
  if (!data.posts?.length) return { ...data, blog: { posts: [], categories: {}, tags: {}, authors: {} } };
  const b = blogData(data, opts);
  return { ...data, pages: [...data.pages, ...b.pages], translations: [...(data.translations ?? []), ...b.translations], blog: b.blog };
}
