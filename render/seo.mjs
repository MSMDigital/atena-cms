// SEO e GEO generati dal motore, uguali per ogni template: JSON-LD (organizzazione, sito, pagina, briciole, servizio, FAQ, fatti),
// Open Graph e Twitter card, hreflang; più robots.txt e sitemap.xml alla pubblicazione. Tutto è puro (nessun accesso a file o rete).
import { html, raw, esc } from './html.mjs';

const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const DAY = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };

// Toglie i valori vuoti (undefined, null, '', [], {}) in profondità: il JSON-LD non deve avere campi a metà.
function clean(v) {
  if (Array.isArray(v)) { const a = v.map(clean).filter((x) => x !== undefined); return a.length ? a : undefined; }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c !== undefined) o[k] = c; }
    return Object.keys(o).length ? o : undefined;
  }
  return v === null || v === '' || v === undefined ? undefined : v;
}
const textOf = (ctx, v) => (v ? plain(ctx.t(v)) : '');
const propertyValues = (ctx, list) => (list ?? []).map((f) => ({ '@type': 'PropertyValue', name: textOf(ctx, f.label), value: textOf(ctx, f.value) }));
const abs = (ctx, src) => (src ? `${ctx.site.siteUrl}${ctx.assetImg(src)}` : undefined);

// L'organizzazione dai dati del sito (Dati del sito → Organizzazione). Un template con dati propri può passarne una sua (opts.org).
export function organizationNode(ctx) {
  const o = ctx.site.organization;
  if (!o) return null;
  const base = ctx.site.siteUrl;
  return clean({
    '@type': o.type ?? 'Organization', '@id': `${base}/#organization`,
    name: o.name ?? ctx.site.seo?.siteName, legalName: o.legalName, url: `${base}/`,
    description: textOf(ctx, o.description) || textOf(ctx, ctx.site.geo?.summary),
    slogan: textOf(ctx, o.slogan),
    logo: abs(ctx, o.logo), image: abs(ctx, o.image),
    foundingDate: o.foundingYear ? String(o.foundingYear) : undefined,
    founder: o.founder && { '@type': 'Person', name: o.founder },
    email: o.email, telephone: o.phone,
    address: o.address && { '@type': 'PostalAddress', streetAddress: o.address.street, postalCode: o.address.zip, addressLocality: o.address.city, addressRegion: o.address.region, addressCountry: o.address.country },
    geo: o.geo && { '@type': 'GeoCoordinates', latitude: o.geo.lat, longitude: o.geo.lng },
    openingHoursSpecification: (o.hours ?? []).map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days.map((d) => DAY[d]), opens: h.opens, closes: h.closes })),
    areaServed: o.areaServed, knowsLanguage: o.languages, sameAs: o.social, priceRange: o.priceRange,
    additionalProperty: propertyValues(ctx, ctx.site.geo?.facts),
  });
}

// Briciole di pane: home, antenati, pagina corrente.
export function crumbsOf(ctx, page) {
  const chain = [];
  for (let p = page, depth = 0; p && depth++ < 12; p = p.parent ? ctx.byKey[p.parent] : null) chain.unshift(p);
  const home = { name: ctx.t(ctx.site.strings.breadcrumbHome ?? { it: 'Home' }), href: ctx.pathOf('home') };
  return page.key === 'home' ? [home] : [home, ...chain.map((p) => ({ name: ctx.t(p.name), href: ctx.pathOf(p.key) }))];
}

// Una persona (autore) per i dati strutturati: nome, qualifica, competenze, profili social (sameAs) e immagine.
const personNode = (ctx, p, url) => ({
  '@type': 'Person', name: p.name, url,
  jobTitle: p.jobTitle || undefined, description: p.description ? plain(p.description).slice(0, 300) : undefined,
  image: p.avatar ? abs(ctx, p.avatar) : undefined,
  knowsAbout: p.knowsAbout?.length ? p.knowsAbout : undefined, sameAs: p.sameAs?.length ? p.sameAs : undefined,
});

const PAGE_TYPE = { page: 'WebPage', about: 'AboutPage', contact: 'ContactPage', collection: 'CollectionPage', article: 'Article', service: 'WebPage', profile: 'ProfilePage' };

// opts: { blocks: blocchi visibili della pagina (per le FAQ), org: organizzazione propria del template, service: { name, areaServed } }
export function jsonLdNodes(ctx, page, opts = {}) {
  const { site } = ctx;
  const base = site.siteUrl;
  const orgId = `${base}/#organization`;
  const url = ctx.urlOf(page.key);
  const isHome = page.key === 'home';
  const org = opts.org ?? organizationNode(ctx);
  const nodes = [];
  if (org && isHome) nodes.push({ '@id': orgId, ...org });
  if (isHome) nodes.push({ '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: site.seo?.siteName, inLanguage: ctx.tag, publisher: org ? { '@id': orgId } : undefined });

  const type = page.contentType ?? 'page';
  const imgSrc = page.ogImage?.src ?? site.seo?.defaultOgImage?.src;
  const crumbs = crumbsOf(ctx, page);
  const facts = propertyValues(ctx, page.facts);
  const node = {
    '@type': PAGE_TYPE[type] ?? 'WebPage', '@id': `${url}#webpage`, url,
    ...(type === 'article' ? { headline: ctx.t(page.post?.title ?? page.title), mainEntityOfPage: url } : { name: ctx.t(page.title) }),
    description: textOf(ctx, page.description), abstract: textOf(ctx, page.geoSummary) || undefined, inLanguage: ctx.tag,
    isPartOf: { '@id': `${base}/#website` },
    image: abs(ctx, imgSrc),
    datePublished: page.datePublished, dateModified: page.dateModified,
    author: page.authorProfile ? personNode(ctx, page.authorProfile, page.authorPage ? ctx.urlOf(page.authorPage) : undefined) : page.author ? { '@type': 'Person', name: page.author } : undefined,
    ...(page.profile ? { mainEntity: { '@id': `${url}#person` } } : {}),
    publisher: org ? { '@id': orgId } : undefined,
    breadcrumb: crumbs.length > 1 ? { '@id': `${url}#breadcrumb` } : undefined,
    about: facts.length ? { '@type': 'Thing', name: ctx.t(page.name), additionalProperty: facts } : (org && !isHome ? { '@id': orgId } : undefined),
  };
  nodes.push(node);
  if (page.profile) nodes.push({ '@id': `${url}#person`, ...personNode(ctx, page.profile, url) });   // pagina autore: la persona è l'entità principale

  const svc = type === 'service' || opts.service ? (opts.service ?? {}) : null;
  if (svc) {
    const name = svc.name ? ctx.t(svc.name) : ctx.t(page.name);
    nodes.push({ '@type': 'Service', '@id': `${url}#service`, name, serviceType: name, provider: org ? { '@id': orgId } : undefined, areaServed: svc.areaServed ? ctx.t(svc.areaServed) : site.organization?.areaServed, url });
  }
  if (crumbs.length > 1) nodes.push({ '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: base + c.href })) });

  const fromBlocks = (opts.blocks ?? []).filter((b) => b.type === 'faq').flatMap((b) => b.items ?? []);
  const seen = new Set();
  const questions = [...(page.faq ?? []), ...fromBlocks].filter((q) => { const k = plain(ctx.t(q.question)); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  if (questions.length) nodes.push({ '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: questions.map((q) => ({ '@type': 'Question', name: plain(ctx.t(q.question)), acceptedAnswer: { '@type': 'Answer', text: plain(ctx.t(q.answer)) } })) });
  return nodes.map(clean).filter(Boolean);
}

export function jsonLdScript(ctx, page, opts) {
  const graph = { '@context': 'https://schema.org', '@graph': jsonLdNodes(ctx, page, opts) };
  return raw(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`);
}

// Da mettere nel <head> (dopo i tag og:title/description/url del template): lingua, immagine di condivisione, Twitter card, hreflang, JSON-LD.
export function seoHead(ctx, page, opts = {}) {
  const { site } = ctx;
  // Pagina protetta: l'HTML statico è pubblico, quindi niente FAQ, fatti, autore o date che ne anticipino il contenuto.
  if (page.protected) { page = { ...page, faq: [], facts: [], author: undefined, datePublished: undefined, dateModified: undefined }; opts = { ...opts, blocks: [], service: undefined }; }
  const out = [];
  out.push(html`<meta property="og:locale" content="${ctx.tag.replace('-', '_')}">`);
  const live = ctx.enabled.filter((l) => ctx.isLive(page, l));
  for (const l of live) if (l !== ctx.locale) out.push(html`<meta property="og:locale:alternate" content="${site.locales.tags[l].replace('-', '_')}">`);
  const im = page.ogImage ?? site.seo?.defaultOgImage;
  const title = ctx.t(page.title);
  const desc = textOf(ctx, page.description);
  if (im?.src) {
    const size = ctx.imageSize(im.src);
    out.push(html`<meta property="og:image" content="${abs(ctx, im.src)}">`);
    if (im.alt) out.push(html`<meta property="og:image:alt" content="${ctx.t(im.alt)}">`);
    if (size) out.push(html`<meta property="og:image:width" content="${String(size.width)}"><meta property="og:image:height" content="${String(size.height)}">`);
  }
  out.push(html`<meta name="twitter:card" content="${im?.src ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}">`);
  if (im?.src) out.push(html`<meta name="twitter:image" content="${abs(ctx, im.src)}">`);
  if ((page.ogType ?? 'website') === 'article') {
    if (page.datePublished) out.push(html`<meta property="article:published_time" content="${page.datePublished}">`);
    if (page.dateModified) out.push(html`<meta property="article:modified_time" content="${page.dateModified}">`);
    if (page.author) out.push(html`<meta property="article:author" content="${page.author}">`);
  }
  if (live.length > 1) {
    for (const l of live) out.push(html`<link rel="alternate" hreflang="${site.locales.tags[l]}" href="${ctx.urlOf(page.key, l)}">`);
    out.push(html`<link rel="alternate" hreflang="x-default" href="${ctx.urlOf(page.key, ctx.def)}">`);
  }
  out.push(jsonLdScript(ctx, page, opts));
  return html`${out.map((x) => html`${x}\n  `)}`;
}

// ---- robots.txt e sitemap.xml (usati dalla pubblicazione, non dai template) ----------------------------------------------------------

export const AI_BOTS = {
  aiTraining: ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'Meta-ExternalAgent', 'cohere-ai'],
  aiSearch: ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'],
  aiUser: ['ChatGPT-User', 'Claude-User', 'Perplexity-User'],
};
const AI_LABEL = { aiTraining: 'addestramento', aiSearch: 'ricerca e citazioni', aiUser: 'su richiesta di un utente' };

// pagine: [{ page, paths: [percorsi nelle lingue online] }] solo per quelle pubblicate; `noaiPaths`: percorsi delle pagine «escludi AI».
export function robotsTxt(site, { noaiPaths = [] } = {}) {
  const c = site.crawling ?? {};
  const closed = c.mode === 'closed';
  const dis = c.disallowPaths ?? [];
  const delay = c.crawlDelay ? [`Crawl-delay: ${c.crawlDelay}`] : [];
  const L = ['# Generato dal CMS (Dati del sito → Crawling). Non si modifica a mano: si cambia da lì.', '', 'User-agent: *'];
  if (closed) L.push('Disallow: /');
  else if (dis.length) L.push(...dis.map((p) => `Disallow: ${p}`));
  else L.push('Allow: /');
  L.push(...delay);
  if (!closed) {
    for (const [key, bots] of Object.entries(AI_BOTS)) {
      const block = c[key] === 'block';
      const extra = !block && c.honorNoai !== false ? noaiPaths : [];
      if (!block && !extra.length) continue;
      L.push('', `# AI: ${AI_LABEL[key]}${block ? ' (bloccato)' : ' (pagine escluse)'}`);
      for (const b of bots) L.push(`User-agent: ${b}`);
      if (block) L.push('Disallow: /');
      else L.push(...dis.map((p) => `Disallow: ${p}`), ...extra.map((p) => `Disallow: ${p}`), ...(dis.length || extra.length ? [] : ['Allow: /']), ...delay);
    }
  }
  L.push('', `Sitemap: ${site.siteUrl}/sitemap.xml`, '');
  return L.join('\n');
}

// entries: [{ loc, lastmod?, alternates?: [{ lang, href }], image?: url }]
export function sitemapXml(entries) {
  const e = (s) => esc(String(s));
  const url = (u) => `  <url><loc>${e(u.loc)}</loc>${u.lastmod ? `<lastmod>${e(u.lastmod)}</lastmod>` : ''}${(u.alternates ?? []).map((a) => `<xhtml:link rel="alternate" hreflang="${e(a.lang)}" href="${e(a.href)}"/>`).join('')}${u.image ? `<image:image><image:loc>${e(u.image)}</image:loc></image:image>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.map(url).join('\n')}\n</urlset>\n`;
}
