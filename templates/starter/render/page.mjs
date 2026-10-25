// Una pagina = <head> + intestazione + blocchi + piè di pagina. Restituisce il documento HTML completo (una stringa).
import { html, raw, attr, toString, engineScript, consentHead, preferencesLink, robotsMeta, seoHead, trackingHead, trackingCss, trackingBodyStart, trackingBodyEnd } from '@cms/kit';
import { blocks } from './blocks.mjs';
import { SECTION_TYPES } from './mm-blocks.mjs';
import { renderGate } from './gate.mjs';
import { button, img } from './common.mjs';
import { postDate } from './blocks.mjs';

// Header e footer: se il sito li scorpora (Admin → Header / Footer) ogni pagina usa quello scelto (campi "header" e "footer" della pagina);
// altrimenti, nei siti più vecchi, si ricadono i dati del sito (menu e piè di pagina di Dati del sito).
const headerOf = (ctx, page) => {
  const h = ctx.layout('header', page);
  if (h !== undefined) return h;
  return ctx.site.nav ? { brandName: ctx.site.brand.name, nav: ctx.site.nav, surface: 'dark' } : null;
};
const footerOf = (ctx, page) => {
  const f = ctx.layout('footer', page);
  if (f !== undefined) return f;
  return ctx.site.footer ? { surface: 'dark', text: ctx.site.footer.text, legal: ctx.site.footer.legal } : null;
};

// Menu a hamburger (campo "mobileMenu" dell'header): sempre, mai, o sotto una larghezza scelta. Per la larghezza si scrive una @media dedicata
// (le media query non leggono variabili): il numero è un intero validato dallo schema (320–1920), mai testo libero.
const burger = (h) => {
  const m = h.mobileMenu ?? {};
  const mode = (h.nav ?? []).length ? (m.mode ?? 'breakpoint') : 'never';
  const bp = Math.min(1920, Math.max(320, Math.round(Number(m.breakpoint)) || 900));
  return { mode, bp };
};
const burgerCss = (mode, bp) => (mode === 'breakpoint'
  ? `@media (max-width: ${bp}px) { .sh-bp-${bp} .menu-toggle { display: inline-flex; } .sh-bp-${bp} .site-header__nav { display: none; } .sh-bp-${bp}.is-open .site-header__nav { display: block; } }`
  : '');

const header = (ctx, page) => {
  const h = headerOf(ctx, page);
  if (!h) return '';
  const { mode, bp } = burger(h);
  const cls = ['site-header', h.sticky ? 'site-header--sticky' : '', mode === 'always' ? 'is-burger' : '', mode === 'breakpoint' ? `sh-bp-${bp}` : ''].filter(Boolean).join(' ');
  return html`${burgerCss(mode, bp) ? raw(`<style>${burgerCss(mode, bp)}</style>`) : ''}<header class="${cls}" data-surface="${h.surface ?? 'dark'}">
  <div class="wrap site-header__in">
    <a class="brand" href="${h.logoLink ? ctx.link(h.logoLink) : ctx.pathOf('home')}">${h.logo ? html`<img class="brand__logo" src="${ctx.assetImg(h.logo.src)}" alt="${ctx.t(h.logo.alt)}">` : h.brandName}</a>
    ${mode !== 'never' ? html`<button class="menu-toggle" type="button" aria-expanded="false" aria-label="${ctx.t(ctx.site.strings.navLabel)}"><span aria-hidden="true"></span></button>` : ''}
    <nav class="site-header__nav" aria-label="${ctx.t(ctx.site.strings.navLabel)}"><ul>${(h.nav ?? []).map((n) => html`<li${attr('class', n.cssClass)}><a href="${ctx.link(n.link)}">${ctx.t(n.label)}</a></li>`)}</ul></nav>
    ${h.cta ? button(ctx, h.cta, ' site-header__cta') : ''}
  </div>
</header>`;
};

const footer = (ctx, page) => {
  const f = footerOf(ctx, page);
  if (!f) return '';
  return html`<footer class="site-footer" data-surface="${f.surface ?? 'dark'}">
  <div class="wrap">
    ${(f.columns ?? []).length ? html`<div class="site-footer__cols">${f.columns.map((c) => html`<div><p class="site-footer__title">${ctx.t(c.title)}</p><ul>${c.links.map((l) => html`<li${attr('class', l.cssClass)}><a href="${ctx.link(l.link)}">${ctx.t(l.label)}</a></li>`)}</ul></div>`)}</div>` : ''}
    <p>${ctx.t(f.text)}${(f.legal ?? []).map((l) => html` · <a${attr('class', l.cssClass)} href="${ctx.link(l.link)}">${ctx.t(l.label)}</a>`)}${f.showCookiePreferences === false ? '' : preferencesLink(ctx)}</p>
  </div>
</footer>`;
};

// Intestazione di una pagina autore (le pagine virtuali del motore portano `page.profile`): immagine, qualifica, nome, biografia e profili social.
const authorHead = (ctx, pr) => html`<header class="mod author-head" data-surface="light">
  <div class="wrap author-head__in">
    ${pr.avatar ? html`<div class="author-head__photo">${img(ctx, { src: pr.avatar, alt: { it: pr.name } })}</div>` : ''}
    <div class="author-head__body">
      ${pr.jobTitle ? html`<p class="author-head__role">${pr.jobTitle}</p>` : ''}
      <h1>${pr.name}</h1>
      ${pr.description ? html`<p class="author-head__bio">${pr.description}</p>` : ''}
      ${pr.links?.length ? html`<ul class="author-head__links">${pr.links.map((l) => html`<li><a href="${l.url}" rel="me noopener" target="_blank">${l.label}</a></li>`)}</ul>` : ''}
    </div>
  </div>
</header>`;

// Intestazione di un articolo del blog (le pagine virtuali del motore portano `page.post`): categorie, titolo, data e autore, immagine.
const postHead = (ctx, post) => html`<header class="mod post-head" data-surface="light">
  <div class="wrap">
    ${post.categories.length ? html`<p class="post-head__cats">${post.categories.map((k) => { const c = ctx.categories().find((x) => x.key === k); return c ? html`<a href="${c.path}">${ctx.t(c.name)}</a>` : ''; })}</p>` : ''}
    <h1>${ctx.t(post.title)}</h1>
    <p class="post-head__meta"><time datetime="${post.date}">${postDate(ctx, post.date)}</time>${post.author ? (ctx.authors().find((a) => a.key === post.authorKey) ? html` · <a href="${ctx.authors().find((a) => a.key === post.authorKey).path}">${post.author}</a>` : html` · ${post.author}`) : ''}</p>
    ${post.tags?.length ? html`<p class="post-head__tags">${post.tags.map((k) => { const c = ctx.tags().find((x) => x.key === k); return c ? html`<a href="${c.path}">#${ctx.t(c.name)}</a>` : ''; })}</p>` : ''}
    ${post.image ? html`<div class="post-head__media media media--${post.imageCorners ?? 'round-md'}">${img(ctx, post.image, { priority: true })}</div>` : ''}
  </div>
</header>`;

// Briciole di pane (blocco "page-intro"): home, antenati, pagina corrente.
function crumbsOf(ctx, page) {
  const chain = [];
  for (let p = page, depth = 0; p && depth++ < 12; p = p.parent ? ctx.byKey?.[p.parent] : null) chain.unshift(p);
  const home = { key: 'home', name: ctx.t(ctx.site.strings.breadcrumbHome ?? { it: 'Home' }), href: ctx.pathOf('home') };
  return page.key === 'home' ? [home] : [home, ...chain.map((p) => ({ key: p.key, name: ctx.t(p.name), href: ctx.pathOf(p.key) }))];
}

export function renderPage(baseCtx, page) {
  const ctx = { ...baseCtx, page };
  ctx.crumbs = crumbsOf(ctx, page);
  const title = ctx.t(page.title);
  const desc = ctx.t(page.description);
  const url = ctx.urlOf(page.key);
  // Pagina protetta (campo pagina "protected"): l'HTML statico contiene solo la schermata con la password, mai i blocchi reali
  // (si vedono solo via /api/private-access/<chiave>, dopo la verifica lato server).
  let prev = null;
  const visible = page.blocks.filter((b) => b.visible !== false).map((b) => (b.type === 'shared' ? { ...ctx.shared[b.ref], id: b.id } : b));
  const body = page.protected ? [renderGate(ctx, page)] : page.blocks
    .filter((b) => b.visible !== false)
    .map((b) => {
      const block = b.type === 'shared' ? { ...ctx.shared[b.ref], id: b.id } : b;
      if (block.visible === false) return '';
      const render = blocks[block.type];
      if (!render) throw new Error(`${page.key}: tipo di blocco sconosciuto "${block.type}"`);
      // "flush": un blocco con sezione dei moduli interni che segue un altro con la stessa superficie non ripete lo spazio sopra.
      const flush = SECTION_TYPES.has(block.type) && prev && SECTION_TYPES.has(prev.type) && prev.surface === block.surface;
      prev = block;
      return render(ctx, block, { flush });
    });
  const bodyWithHead = page.post && !page.protected ? [postHead(ctx, page.post), ...body] : page.profile && !page.protected ? [authorHead(ctx, page.profile), ...body] : body;
  return toString(html`<!doctype html>
<html lang="${ctx.tag}"${raw(Object.entries(ctx.meta.htmlAttrs).map(([k, v]) => ` ${k}="${v}"`).join(''))}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${trackingHead(ctx)}<title>${title}</title>
  <meta name="description" content="${desc}">
  ${robotsMeta(page)}
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="${page.ogType ?? 'website'}">
  <meta property="og:site_name" content="${ctx.site.seo.siteName}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url}">
  ${seoHead(ctx, page, { blocks: page.protected ? [] : visible })}
  <link rel="icon" href="${ctx.assetImg(ctx.site.seo.favicon)}">
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/${ctx.meta.fontsCss}">
  <link rel="stylesheet" href="/assets/css/site.css">
  <link rel="stylesheet" href="/assets/css/modules.css">
  <link rel="stylesheet" href="/assets/css/mm.css">
  ${consentHead(ctx)}${trackingCss(ctx)}</head>
<body>
${trackingBodyStart(ctx)}<a class="skip" href="#main">${ctx.t(ctx.site.strings.skipLink)}</a>
${header(ctx, page)}
<main id="main">
${bodyWithHead}
</main>
${footer(ctx, page)}
${engineScript()}
<script src="/assets/js/main.js" defer></script>
<script src="/assets/js/mm.js" defer></script>
${page.protected ? html`<script src="/assets/js/gate.js" defer></script>` : ''}
${trackingBodyEnd(ctx)}</body>
</html>
`);
}
