// Una pagina = <head> + intestazione + blocchi + piè di pagina. Restituisce il documento HTML completo (una stringa).
import { html, raw, toString, engineScript, consentHead, preferencesLink } from '@cms/kit';
import { blocks } from './blocks.mjs';

const header = (ctx) => html`<header class="site-header" data-surface="dark">
  <div class="wrap site-header__in">
    <a class="brand" href="${ctx.pathOf('home')}">${ctx.site.brand.name}</a>
    <nav aria-label="${ctx.t(ctx.site.strings.navLabel)}"><ul>${ctx.site.nav.map((n) => html`<li><a href="${ctx.link(n.link)}">${ctx.t(n.label)}</a></li>`)}</ul></nav>
  </div>
</header>`;

const footer = (ctx) => html`<footer class="site-footer" data-surface="dark">
  <div class="wrap">
    <p>${ctx.t(ctx.site.footer.text)}${(ctx.site.footer.legal ?? []).map((l) => html` · <a href="${ctx.link(l.link)}">${ctx.t(l.label)}</a>`)}${preferencesLink(ctx)}</p>
  </div>
</footer>`;

export function renderPage(ctx, page) {
  const title = ctx.t(page.title);
  const body = page.blocks
    .filter((b) => b.visible !== false)
    .map((b) => {
      const block = b.type === 'shared' ? { ...ctx.shared[b.ref], id: b.id } : b;
      const render = blocks[block.type];
      if (!render) throw new Error(`${page.key}: tipo di blocco sconosciuto "${block.type}"`);
      return render(ctx, block);
    });
  return toString(html`<!doctype html>
<html lang="${ctx.tag}"${raw(Object.entries(ctx.meta.htmlAttrs).map(([k, v]) => ` ${k}="${v}"`).join(''))}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${ctx.t(page.description)}">
  ${page.noindex ? raw('<meta name="robots" content="noindex">') : ''}
  <link rel="canonical" href="${ctx.urlOf(page.key)}">
  <link rel="icon" href="${ctx.assetImg(ctx.site.seo.favicon)}">
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/${ctx.meta.fontsCss}">
  <link rel="stylesheet" href="/assets/css/site.css">
  ${consentHead(ctx)}</head>
<body>
<a class="skip" href="#main">${ctx.t(ctx.site.strings.skipLink)}</a>
${header(ctx)}
<main id="main">
${body}
</main>
${footer(ctx)}
${engineScript()}
</body>
</html>
`);
}
