// Una pagina = <head> + intestazione + blocchi + piè di pagina. Restituisce il documento HTML completo (una stringa).
import { html, raw, attr, toString, engineScript, consentHead, preferencesLink, robotsMeta, seoHead, trackingHead, trackingCss, trackingBodyStart, trackingBodyEnd } from '@cms/kit';
import { blocks } from './blocks.mjs';
import { renderGate } from './gate.mjs';
import { button, img, newTab } from './common.mjs';
import { network, icon, chevron, arrow } from './icons.mjs';
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

// Marchio: il logo (dell'header, altrimenti quello dei Dati del sito) se c'è; altrimenti il nome con lo slogan sotto.
const brandMark = (ctx, h) => {
  const logo = h.logo ? { src: h.logo.src, alt: ctx.t(h.logo.alt) } : ctx.site.brand?.logo ? { src: ctx.site.brand.logo, alt: ctx.site.brand.name } : null;
  if (logo) return html`<img class="brand__logo" src="${ctx.assetImg(logo.src)}" alt="${logo.alt}"${(() => { const z = ctx.imageSize(logo.src); return z ? raw(` width="${z.width}" height="${z.height}"`) : ''; })()}>`;
  const tagline = h.tagline ?? ctx.site.brand?.tagline;
  return html`<span class="brand__name">${h.brandName ?? ctx.site.brand?.name}</span>${tagline ? html`<span class="brand__tag">${ctx.t(tagline)}</span>` : ''}`;
};

// Voce di menu con tendina (campo "menu" della voce): link alla pagina, titolo del gruppo e voci con icona, durata ed etichetta (per esempio le sessioni prenotabili).
const dropdown = (ctx, n) => html`<div class="nav-dd__panel"><div class="nav-dd__box">
    <a class="nav-dd__lead" href="${ctx.link(n.link)}"${newTab(n.link)}><span>${ctx.t(n.menu.lead ?? n.label)}</span>${arrow()}</a>
    ${n.menu.groupTitle ? html`<p class="nav-dd__group">${ctx.t(n.menu.groupTitle)}</p>` : ''}
    ${(n.menu.items ?? []).map((m) => html`<a class="dd-item" href="${ctx.link(m.link)}"${newTab(m.link)}>
      <span class="dd-item__ic dd-item__ic--${m.tone ?? 'sky'}">${m.icon ? icon(m.icon, 22) : ''}</span>
      <span class="dd-item__tx"><span class="dd-item__t">${ctx.t(m.title)}</span><span class="dd-item__meta">${m.duration ? html`<span class="dd-item__dur">${icon('clock', 14, 2)}${ctx.t(m.duration)}</span>` : ''}${m.badge ? html`<span class="dd-item__badge dd-item__badge--${m.tone ?? 'sky'}">${ctx.t(m.badge)}</span>` : ''}</span></span>
      ${arrow()}
    </a>`)}
  </div></div>`;

const navItem = (ctx, n) => (n.menu
  ? html`<li class="nav-dd${n.cssClass ? ` ${n.cssClass}` : ''}"><a href="${ctx.link(n.link)}" aria-haspopup="true"${newTab(n.link)}>${ctx.t(n.label)}${chevron()}</a>${dropdown(ctx, n)}</li>`
  : html`<li${attr('class', n.cssClass)}><a href="${ctx.link(n.link)}"${newTab(n.link)}>${ctx.t(n.label)}</a></li>`);

const header = (ctx, page) => {
  const h = headerOf(ctx, page);
  if (!h) return '';
  const { mode, bp } = burger(h);
  const cls = ['site-header', h.sticky ? 'site-header--sticky' : '', mode === 'always' ? 'is-burger' : '', mode === 'breakpoint' ? `sh-bp-${bp}` : ''].filter(Boolean).join(' ');
  return html`${burgerCss(mode, bp) ? raw(`<style>${burgerCss(mode, bp)}</style>`) : ''}<header class="${cls}" data-surface="${h.surface ?? 'dark'}">
  <div class="wrap site-header__in">
    <a class="brand" href="${h.logoLink ? ctx.link(h.logoLink) : ctx.pathOf('home')}">${brandMark(ctx, h)}</a>
    ${mode !== 'never' ? html`<button class="menu-toggle" type="button" aria-expanded="false" aria-label="${ctx.t(ctx.site.strings.navLabel)}"><span aria-hidden="true"></span></button>` : ''}
    <nav class="site-header__nav" aria-label="${ctx.t(ctx.site.strings.navLabel)}"><ul>${(h.nav ?? []).map((n) => navItem(ctx, n))}</ul></nav>
    ${h.cta ? button(ctx, h.cta, ' site-header__cta') : ''}
  </div>
</header>`;
};

const footer = (ctx, page) => {
  const f = footerOf(ctx, page);
  if (!f) return '';
  return html`<footer class="site-footer" data-surface="${f.surface ?? 'light'}">
  <div class="wrap">
    <div class="site-footer__top">
      <div class="site-footer__about">
        ${ctx.site.brand?.logo ? html`<img class="site-footer__logo" src="${ctx.assetImg(ctx.site.brand.logo)}" alt="${ctx.site.brand.name}" loading="lazy">` : f.brandTitle ? html`<p class="site-footer__brand">${ctx.t(f.brandTitle)}</p>` : ''}
        ${f.intro ? html`<p>${ctx.t(f.intro)}</p>` : ''}
        ${(f.logos ?? []).length ? html`<div class="site-footer__logos">${f.logos.map((l) => { const im = html`<img src="${ctx.assetImg(l.image.src)}" alt="${ctx.t(l.image.alt)}" loading="lazy">`; return l.link ? html`<a href="${ctx.link(l.link)}">${im}</a>` : im; })}</div>` : ''}
        ${f.tagline ? html`<p class="site-footer__tag">${ctx.t(f.tagline)}</p>` : ''}
      </div>
      ${(f.columns ?? []).map((c) => html`<nav class="site-footer__nav" aria-label="${ctx.t(c.title ?? ctx.site.strings.navLabel)}">${c.title ? html`<p class="site-footer__title">${ctx.t(c.title)}</p>` : ''}<ul>${c.links.map((l) => html`<li${attr('class', l.cssClass)}><a href="${ctx.link(l.link)}"${newTab(l.link)}>${ctx.t(l.label)}</a></li>`)}</ul></nav>`)}
      ${(f.socials ?? []).length ? html`<div class="site-footer__social">${f.socialTitle ? html`<p class="site-footer__title">${ctx.t(f.socialTitle)}</p>` : ''}<ul class="socials">${f.socials.map((s) => html`<li><a href="${ctx.link(s.link)}" aria-label="${ctx.t(s.label)}"${newTab(s.link)}>${network(s.network)}</a></li>`)}</ul>${f.signature ? html`<p class="site-footer__sig">${ctx.t(f.signature).split('\n').flatMap((l, i) => (i ? [raw('<br>'), l] : [l]))}</p>` : ''}</div>` : ''}
    </div>
    <p class="site-footer__legal"><span>${ctx.t(f.text)}</span><span>${(f.legal ?? []).map((l, i) => html`${i ? ' · ' : ''}<a${attr('class', l.cssClass)} href="${ctx.link(l.link)}">${ctx.t(l.label)}</a>`)}${f.showCookiePreferences === false ? '' : preferencesLink(ctx)}</span></p>
  </div>
</footer>`;
};

// Intestazione di una pagina autore (le pagine virtuali del motore portano `page.profile`): immagine, qualifica, nome, biografia e profili social.
const authorHead = (ctx, pr) => html`<header class="author-head" data-surface="light">
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
const postHead = (ctx, post) => html`<header class="post-head" data-surface="light">
  <div class="wrap">
    ${post.categories.length ? html`<p class="post-head__cats">${post.categories.map((k) => { const c = ctx.categories().find((x) => x.key === k); return c ? html`<a href="${c.path}">${ctx.t(c.name)}</a>` : ''; })}</p>` : ''}
    <h1>${ctx.t(post.title)}</h1>
    <p class="post-head__meta"><time datetime="${post.date}">${postDate(ctx, post.date)}</time>${post.author ? (ctx.authors().find((a) => a.key === post.authorKey) ? html` · <a href="${ctx.authors().find((a) => a.key === post.authorKey).path}">${post.author}</a>` : html` · ${post.author}`) : ''}</p>
    ${post.tags?.length ? html`<p class="post-head__tags">${post.tags.map((k) => { const c = ctx.tags().find((x) => x.key === k); return c ? html`<a href="${c.path}">#${ctx.t(c.name)}</a>` : ''; })}</p>` : ''}
    ${post.image ? html`<div class="post-head__media">${img(ctx, post.image, { priority: true })}</div>` : ''}
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
  const visible = page.blocks.filter((b) => b.visible !== false).map((b) => (b.type === 'shared' ? { ...ctx.shared[b.ref], id: b.id } : b));
  const body = page.protected ? [renderGate(ctx, page)] : page.blocks
    .filter((b) => b.visible !== false)
    .map((b) => {
      const block = b.type === 'shared' ? { ...ctx.shared[b.ref], id: b.id } : b;
      if (block.visible === false) return '';
      const render = blocks[block.type];
      if (!render) throw new Error(`${page.key}: tipo di blocco sconosciuto "${block.type}"`);
      return render(ctx, block);
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
${page.protected ? html`<script src="/assets/js/gate.js" defer></script>` : ''}
${trackingBodyEnd(ctx)}</body>
</html>
`);
}
