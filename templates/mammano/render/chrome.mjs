// Parti comuni a tutte le pagine: head, header, footer, barra di contatto rapido.
import { html, raw, attr, consentHead, preferencesLink } from '@cms/kit';
import { ICONS } from './icons.mjs';
import { button } from './blocks.mjs';

const ldScript = (obj) => raw(`<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`);

export function head(ctx, page, ld) {
  const { site, meta, locale } = ctx;
  const title = ctx.t(page.title);
  const desc = ctx.t(page.description);
  const url = ctx.urlOf(page.key);
  const live = ctx.enabled.filter((l) => ctx.isLive(page, l));
  const themeColor = ctx.tokens.surfaces.dark.bg;
  return html`<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  ${page.noindex ? raw('<meta name="robots" content="noindex">') : ''}
  <link rel="canonical" href="${url}">
  ${live.length > 1 ? [...live.map((l) => html`<link rel="alternate" hreflang="${l}" href="${ctx.urlOf(page.key, l)}">\n  `), html`<link rel="alternate" hreflang="x-default" href="${ctx.urlOf(page.key, ctx.def)}">`] : ''}
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${ctx.tag.replace('-', '_')}">
  <meta property="og:site_name" content="${site.seo.siteName}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url}">
  <meta name="theme-color" content="${themeColor}">
  <link rel="icon" href="${ctx.assetImg(site.seo.favicon)}">
  ${meta.preload.map((p) => html`<link rel="preload" href="/assets/${p}" as="font" type="font/woff2" crossorigin>\n  `)}<link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/${meta.fontsCss}">
  <link rel="stylesheet" href="/assets/css/site.css">
  ${ld.map((o) => html`${ldScript(o)}\n  `)}${consentHead(ctx)}</head>`;
}

const logo = (ctx) => {
  const { site } = ctx;
  return html`<a class="logo" href="${ctx.pathOf('home')}" aria-label="${ctx.interp(ctx.t(site.strings.logoLabel), { name: site.company.name })}"><span class="logo__mark" aria-hidden="true">${site.logo.mark}</span><span class="logo__text"><span class="logo__name">${site.logo.name}</span>${site.logo.claim ? html`<span class="logo__claim">${ctx.t(site.logo.claim)}</span>` : ''}</span></a>`;
};

export function header(ctx, { overlay }) {
  const { site, page } = ctx;
  const st = site.strings;
  const ancestors = new Set(ctx.crumbs.slice(0, -1).map((c) => c.key));
  const target = (it) => (it.link.type === 'page' ? it.link.page : null);
  const isActive = (it) => { const k = target(it); return !!k && (k === page.key || (k !== 'home' && ancestors.has(k))); };

  const nav = site.nav.map((it) => {
    const aria = attr('aria-current', isActive(it) && 'page');
    if (!it.children?.length) return html`<li><a href="${ctx.link(it.link)}"${aria}>${ctx.t(it.label)}</a></li>`;
    const subs = it.children.map((c) => html`<li><a href="${ctx.link(c.link)}"${attr('aria-current', target(c) === page.key && 'page')}>${ctx.t(c.label)}</a></li>`);
    return html`<li class="has-sub"><a href="${ctx.link(it.link)}"${aria}>${ctx.t(it.label)}</a><ul class="sub">${subs}</ul></li>`;
  });

  const langs = ctx.enabled.filter((l) => ctx.isLive(page, l));
  const langLinks = langs.length > 1 ? langs.map((l) => html`<a href="${ctx.urlOf(page.key, l)}" hreflang="${l}" lang="${l}"${attr('aria-current', l === ctx.locale && 'true')}>${l.toUpperCase()}</a>`) : null;
  const phone = site.company.channels.phone;

  return html`<a class="skip" href="#main">${ctx.t(st.skipLink)}</a>
<header data-surface="dark" class="header${overlay ? ' header--overlay' : ''}">
  <div class="wrap">
    ${logo(ctx)}
    <nav class="nav" id="nav" aria-label="${ctx.t(st.navLabel)}"><ul>${nav}</ul>
      ${langLinks ? html`<div class="lang-mobile">${langLinks}</div>` : ''}
    </nav>
    <div class="header__tools">
      ${site.header.showPhone !== false ? html`<a class="header__tel" href="${ctx.channel('phone').href}" aria-label="${ctx.interp(ctx.t(st.callLabel), { number: phone.display })}">${raw(ICONS.phone)}<span>${phone.display}</span></a>` : ''}
      ${langLinks ? html`<nav class="lang" aria-label="${ctx.t(st.langLabel)}">${langLinks}</nav>` : ''}
      ${button(ctx, site.header.cta, ' header__cta')}
      <button class="menu-toggle" aria-expanded="false" aria-controls="nav" aria-label="${ctx.t(st.menuOpen)}" data-label-open="${ctx.t(st.menuOpen)}" data-label-close="${ctx.t(st.menuClose)}">${raw(ICONS.menu)}</button>
    </div>
  </div>
</header>`;
}

export function footer(ctx) {
  const { site } = ctx;
  const c = site.company;
  const ch = c.channels;
  const f = site.footer;
  const col = (column) => html`<div>
        <h2>${ctx.t(column.title)}</h2>
        <ul>${column.items.map((it) => (it.link ? html`<li><a href="${ctx.link(it.link)}">${ctx.t(it.label)}</a></li>` : html`<li>${ctx.t(it.label)}</li>`))}</ul>
      </div>`;
  return html`<footer class="footer" data-surface="dark">
  <div class="wrap">
    <div class="footer__top">
      <div>
        ${logo(ctx)}
        <p class="footer__claim">${ctx.t(f.claim)}</p>
        <address>
          ${c.name}<br>
          ${c.address.street}, ${c.address.zip} ${c.address.city}<br>
          <a href="${ctx.channel('phone').href}">${ch.phone.display}</a>${ch.mobile ? html` · <a href="${ctx.channel('mobile').href}">${ch.mobile.display}</a>` : ''}<br>
          <a href="${ctx.channel('email').href}">${ch.email.address}</a>
        </address>
      </div>
      ${f.columns.map(col)}
    </div>
    <div class="footer__bottom">
      <span>${ctx.t(f.copyright)}</span>
      <span>${f.legal.map((l, i) => html`${i ? ' · ' : ''}<a href="${ctx.link(l.link)}">${ctx.t(l.label)}</a>`)}${preferencesLink(ctx)}</span>
    </div>
  </div>
</footer>`;
}

export function quickbar(ctx) {
  const { site } = ctx;
  const q = site.quickbar;
  const wa = ctx.channel('whatsapp');
  return html`<nav class="quickbar" data-surface="dark" aria-label="${ctx.t(site.strings.quickbarLabel)}">
  ${q.buttons.map((b) => button(ctx, b))}
</nav>
${q.whatsappFloat !== false ? html`<a class="wa-float" href="${wa.href}" aria-label="${ctx.t(site.strings.whatsappFloatLabel)}">${raw(ICONS.wa)}</a>` : ''}`;
}
