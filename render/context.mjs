// Dati del sito + contesto di rendering (lingua, URL, link, testi ricchi).
import fs from 'node:fs';
import path from 'node:path';
import { raw } from './html.mjs';
import { sanitizeRich } from './sanitize.mjs';
import { imageSize } from './image-size.mjs';
import { formatDate } from './format.mjs';
import { indexTranslations, asPage } from './translations.mjs';

export function loadData(root) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const pagesDir = path.join(root, 'content/pages');
  const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.json')).sort().map((f) => read(`content/pages/${f}`));
  return {
    root,
    site: read('content/site.json'),
    shared: read('content/shared.json'),
    ...(fs.existsSync(path.join(root, 'content/categories.json')) ? { categories: read('content/categories.json') } : {}),
    ...(fs.existsSync(path.join(root, 'content/tags.json')) ? { tags: read('content/tags.json') } : {}),
    posts: fs.existsSync(path.join(root, 'content/posts')) ? fs.readdirSync(path.join(root, 'content/posts')).filter((f) => f.endsWith('.json')).sort().map((f) => read(`content/posts/${f}`)) : [],
    ...(fs.existsSync(path.join(root, 'content/headers.json')) ? { headers: read('content/headers.json') } : {}),
    ...(fs.existsSync(path.join(root, 'content/footers.json')) ? { footers: read('content/footers.json') } : {}),
    tokens: read('tokens.json'),
    meta: fs.existsSync(path.join(root, 'assets/css/tokens.meta.json')) ? read('assets/css/tokens.meta.json') : null,
    pages,
  };
}

const WA = (n) => `https://wa.me/${n.replace(/\D/g, '')}`;

export function createContext(data, locale, opts = {}) {
  const { site, pages } = data;
  const def = site.locales.default;
  const base = site.locales.base ?? def;   // la lingua in cui sono scritte le pagine di base
  const byKey = Object.assign(Object.create(null), Object.fromEntries(pages.map((p) => [p.key, p])));   // senza prototipo: una chiave come "constructor" non deve trovare nulla
  // Versioni per lingua (pagine pubblicate, una per lingua): la pagina «home» in inglese è un documento a sé con la stessa chiave logica.
  const trBy = indexTranslations(data.translations);
  // La pagina nella lingua `l`: la sua versione se c'è, altrimenti quella di base (che può avere anche testi in più lingue, come prima).
  const pageIn = (key, l = locale) => (trBy[key]?.[l] ? asPage(trBy[key][l]) : byKey[key]);
  // Cartelle in cui cercare i file delle immagini (progetto, poi caricamenti): servono per width/height.
  const imgDirs = opts.imgDirs ?? (data.root ? [opts.imgDir ?? path.join(data.root, 'assets/img')] : []);   // senza root (processo isolato) le dimensioni arrivano da opts.images

  const isLiveIn = (p, l) => {
    if (!site.locales.enabled.includes(l)) return false;
    const tr = trBy[p.key]?.[l];
    if (tr) return tr.status === 'published';
    const own = byKey[p.key] ?? p;
    return own.status === 'published' && (l === (own.lang ?? base) || !!own.title?.[l]);
  };

  const t = (v) => (v == null ? '' : typeof v === 'string' ? v : v[locale] ?? v[def] ?? v[base] ?? '');
  // Lo slug finisce in un percorso di file e in un indirizzo: solo minuscole, cifre e trattini (mai ../). Uno slug non valido è come vuoto.
  const slugOf = (p, l) => { const s = p.slug?.[l] ?? p.slug?.[def] ?? p.slug?.[base] ?? ''; return typeof s === 'string' && /^[a-z0-9-]*$/.test(s) ? s : ''; };

  // Un indirizzo per lingua: prefisso lingua (tranne la predefinita) + slug di ogni antenato + slug della pagina.
  const pathOf = (key, l = locale) => {
    if (!byKey[key]) return null;
    const segs = [];
    let depth = 0;   // limite: un ciclo tra pagine padre non deve bloccare la build (la validazione lo segnala)
    for (let p = pageIn(key, l); p && depth++ < 12; p = p.parent ? pageIn(p.parent, l) : null) { const s = slugOf(p, l); if (s) segs.unshift(s); }
    return '/' + [...(l === def ? [] : [l]), ...segs].map((s) => s + '/').join('');
  };
  const urlOf = (key, l = locale) => site.siteUrl + pathOf(key, l);

  // Gli articoli (e i loro conteggi) di una lingua sono quelli online in quella lingua.
  const postsHere = () => (data.blog?.posts ?? []).filter((p) => { const pg = byKey[p.pageKey]; return pg ? isLiveIn(pg, locale) : true; });
  const company = site.company;
  const channel = (c) => {
    const ch = company.channels;
    if (c === 'phone' || c === 'mobile') return { href: `tel:${ch[c].number}`, display: ch[c].display };
    if (c === 'whatsapp') return { href: WA(ch.whatsapp.number), display: '' };
    if (c === 'email') return { href: `mailto:${ch.email.address}`, display: ch.email.address };
    throw new Error(`canale sconosciuto: ${c}`);
  };

  const link = (l) => {
    if (l.type === 'page') { const p = pathOf(l.page); return p ? p + (l.anchor ? `#${l.anchor}` : '') : '#'; }   // pagina non ancora creata
    if (l.type === 'anchor') return `#${l.anchor}`;
    if (l.type === 'channel') return channel(l.channel).href;
    return /^(?:https?:|mailto:|tel:)/i.test(l.url ?? '') ? l.url : '#';   // mai javascript: o data: da un indirizzo scritto a mano
  };

  // href="page:chiave#ancora" e href="channel:canale" nei testi ricchi diventano indirizzi veri.
  const resolveHref = (h) => {
    const pg = h.match(/^page:([a-z0-9-]+)(?:#([a-z][a-z0-9-]*))?$/); if (pg) return link({ type: 'page', page: pg[1], anchor: pg[2] });
    const chn = h.match(/^channel:(\w+)$/); if (chn && ['phone', 'mobile', 'whatsapp', 'email'].includes(chn[1])) return link({ type: 'channel', channel: chn[1] });
    return null;
  };
  const richStr = (s) => sanitizeRich(s).replace(/href="([^"]*)"/g, (m, h) => { const r = resolveHref(h); return r ? `href="${r}"` : m; });

  return {
    data, site, tokens: data.tokens, meta: data.meta, shared: data.shared, pages, byKey, locale, def, imgDirs,
    tag: site.locales.tags[locale],
    t,
    rich: (v) => raw(richStr(t(v))),
    richStr,
    pathOf, urlOf, link, channel,
    // Impostazioni generali (fuso, formati) e una data scritta secondo il formato scelto in Impostazioni → Generale (senza scelta: «3 novembre 2026»).
    settings: data.settings ?? {},
    formatDate: (d) => formatDate(d, data.settings ?? {}, site.locales.tags[locale]?.slice(0, 2) ?? locale),
    // Blog: articoli (dal più recente) e categorie con articoli. `category`: chiave; `limit`: quanti. Ogni articolo ha l'indirizzo e le categorie con nome e indirizzo.
    posts: ({ category, tag, author, limit } = {}) => {
      const cats = data.blog?.categories ?? {};
      const tags = data.blog?.tags ?? {};
      const people = data.blog?.authors ?? {};
      return postsHere().filter((p) => (!category || p.categories.includes(category)) && (!tag || p.tags.includes(tag)) && (!author || p.authorKey === author)).slice(0, limit ?? 1000).map((p) => ({
        key: p.key, title: p.title, excerpt: p.excerpt, image: p.image, date: p.date, author: p.author, authorKey: p.authorKey, authorPath: p.authorKey && people[p.authorKey] ? pathOf(people[p.authorKey].pageKey) : null, url: urlOf(p.pageKey), path: pathOf(p.pageKey),
        categories: p.categories.map((k) => ({ key: k, name: cats[k]?.name, url: urlOf(cats[k]?.pageKey), path: pathOf(cats[k]?.pageKey) })),
        tags: p.tags.map((k) => ({ key: k, name: tags[k]?.name, url: urlOf(tags[k]?.pageKey), path: pathOf(tags[k]?.pageKey) })),
      }));
    },
    // Autori con una pagina pubblica (solo se attivate in Impostazioni → SEO & Geo): nome, qualifica, descrizione, immagine, indirizzo, articoli.
    authors: () => Object.entries(data.blog?.authors ?? {}).map(([key, a]) => ({ key, ...a, url: urlOf(a.pageKey), path: pathOf(a.pageKey), count: postsHere().filter((p) => p.authorKey === key).length })),
    // Tag con articoli (più usati prima, poi per nome).
    tags: () => Object.entries(data.blog?.tags ?? {}).map(([key, t]) => ({ key, name: t.name, url: urlOf(t.pageKey), path: pathOf(t.pageKey), count: postsHere().filter((p) => p.tags.includes(key)).length })).sort((a, b) => b.count - a.count || String(a.name.it).localeCompare(String(b.name.it))),
    categories: () => Object.entries(data.blog?.categories ?? {}).map(([key, c]) => ({ key, name: c.name, description: c.description ?? null, url: urlOf(c.pageKey), path: pathOf(c.pageKey), count: postsHere().filter((p) => p.categories.includes(key)).length })),
    // Header / footer della pagina (campi "header" e "footer"): l'oggetto scelto, null se la pagina non ne vuole, undefined se il sito non li scorpora
    // (allora il template usa i dati del sito, come prima). Senza scelta: quello chiamato "default", o il primo.
    layout: (kind, page) => {
      const map = kind === 'header' ? data.headers : data.footers;
      if (!map || !Object.keys(map).length) return undefined;
      const want = page?.[kind];
      if (want === 'none') return null;
      const key = want && Object.hasOwn(map, want) ? want : Object.hasOwn(map, 'default') ? 'default' : Object.keys(map)[0];
      return map[key];
    },
    slugOf,
    enabled: site.locales.enabled,
    // Una pagina è online in una lingua se quella lingua è attiva e c'è la sua versione pubblicata; senza versione dedicata vale la pagina di
    // base (nella sua lingua) o, come prima, i testi di quella lingua scritti nella stessa pagina.
    isLive: (p, l) => isLiveIn(p, l),
    // Esiste una versione della pagina in quella lingua (anche in bozza)? Serve all'anteprima, che mostra le bozze.
    hasVersion: (key, l) => !!trBy[key]?.[l] || (!!byKey[key] && (l === (byKey[key].lang ?? base) || !!byKey[key].title?.[l])),
    pageIn,
    pageOf: (key) => pageIn(key, locale),
    assetImg: (src) => `/assets/img/${src}`,
    // Dimensioni di un'immagine (per width/height): dalla mappa già calcolata dal motore (nel processo isolato non si leggono file) o dalle cartelle.
    imageSize: (src) => (opts.images ? opts.images[src] ?? null : imgDirs.map((d) => imageSize(path.join(d, src))).find(Boolean) ?? null),
    interp: (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m),
  };
}
