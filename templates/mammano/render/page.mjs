// Una pagina = testata comune + blocchi in ordine + piè di pagina. Restituisce il documento HTML completo.
import { html, raw, toString, engineScript } from '@cms/kit';
import { blocks as renderers, SECTION_TYPES } from './blocks.mjs';
import { head, header, footer, quickbar } from './chrome.mjs';
import { jsonLd } from './jsonld.mjs';

// Blocchi visibili, con i riferimenti ai blocchi condivisi già risolti.
export function resolveBlocks(ctx, page) {
  return page.blocks
    .filter((b) => b.visible !== false)
    .map((b) => {
      if (b.type !== 'shared') return b;
      const s = Object.hasOwn(ctx.shared, b.ref) ? ctx.shared[b.ref] : undefined;
      if (!s) throw new Error(`${page.key}: blocco condiviso "${b.ref}" inesistente`);
      return { ...s, id: b.id };
    })
    .filter((b) => b.visible !== false);
}

// Briciole di pane: home, antenati, pagina corrente.
export function crumbsOf(ctx, page) {
  const chain = [];
  for (let p = page, depth = 0; p && depth++ < 12; p = p.parent ? ctx.byKey[p.parent] : null) chain.unshift(p);
  const home = { key: 'home', name: ctx.t(ctx.site.strings.breadcrumbHome), href: ctx.pathOf('home') };
  return page.key === 'home' ? [home] : [home, ...chain.map((p) => ({ key: p.key, name: ctx.t(p.name), href: ctx.pathOf(p.key) }))];
}

export function renderPage(baseCtx, page) {
  const ctx = { ...baseCtx, page };
  ctx.crumbs = crumbsOf(ctx, page);
  const blocks = resolveBlocks(ctx, page);

  let prev = null;
  const body = blocks.map((b) => {
    const render = renderers[b.type];
    if (!render) throw new Error(`${page.key}: tipo di blocco sconosciuto "${b.type}"`);
    const flush = SECTION_TYPES.has(b.type) && prev && SECTION_TYPES.has(prev.type) && prev.surface === b.surface;
    prev = b;
    return render(ctx, b, { flush });
  });

  const doc = html`<!doctype html>
<html lang="${ctx.tag}"${raw(Object.entries(ctx.meta.htmlAttrs).map(([k, v]) => ` ${k}="${v}"`).join(''))}>
${head(ctx, page, jsonLd(ctx, page, blocks))}
<body>
<div class="progress" aria-hidden="true"></div>
${header(ctx, { overlay: blocks[0]?.type === 'hero' })}
<main id="main">
${body}
</main>
${footer(ctx)}
${quickbar(ctx)}
${engineScript()}
<script src="/assets/js/main.js" defer></script>
<script src="/assets/js/fx.js" defer></script>
</body>
</html>
`;
  return toString(doc);
}
