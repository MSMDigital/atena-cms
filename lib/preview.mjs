// Anteprima dell'admin: la pagina resa con le bozze, con il CSS dei token in un <style> aggiornabile dal vivo e gli indirizzi riscritti sotto /admin/preview.
import path from 'node:path';
import { ROOT } from './env.mjs';
import { loadData } from './docs.mjs';
import { createContext } from '../render/context.mjs';
import { renderPages } from '../render/host.mjs';
import { imageInfo } from '../render/build.mjs';
import { requireTemplate } from './template.mjs';
import { signPreviewPath } from './preview-token.mjs';
import { mediaDir } from './media.mjs';
import { withBlog } from '../schema/blog.mjs';
import { tokensToCss, previewFontsHref, htmlAttrs } from '../render/tokens.mjs';

// Lo script dell'anteprima (stile dal vivo e link) è un file esterno, public/cms-preview.js: l'admin ha una CSP che vieta gli script inline,
// quindi anche un <script> arrivato per errore dentro un testo non potrebbe girare.
const runtime = (intercept) => `<script src="/cms-preview.js"${intercept ? ' data-intercept' : ''}></script>`;

export function toPreviewHtml(html, tokens, { intercept = false } = {}) {
  return html
    .replace('<link rel="stylesheet" href="/assets/css/tokens.css">', `<style id="live-tokens">${tokensToCss(tokens)}</style>`)
    .replace('<link rel="stylesheet" href="/assets/css/fonts.css">', `<link id="live-fonts" rel="stylesheet" href="${previewFontsHref(tokens, signPreviewPath('fonts'))}">`)
    .replace(/<script data-cms-consent[^>]*>[\s\S]*?<\/script>\s*/g, '')   // il banner di iubenda non deve comparire (né impostare cookie) nell'admin
    .replace('<head>', '<head>\n  <meta name="robots" content="noindex">')
    .replace(/(href|src|data-preview)="\/assets\//g, '$1="/admin/preview-assets/')
    // Immagini caricate: l'anteprima sta in un documento senza cookie, quindi l'indirizzo porta un token firmato e a scadenza.
    .replace(/src="(\/admin\/preview-assets\/img\/(uploads\/[a-z0-9_.\/-]+))"/gi, (m, url, rel) => { const t = signPreviewPath(rel); return t ? `src="${url}?t=${t}"` : m; })
    .replace(/href="\/(?!admin\/)([^"]*)"/g, 'href="/admin/preview/$1"')
    .replace('</body>', `${runtime(intercept)}\n</body>`);
}

// Rende una pagina con il template attivo (in un processo isolato) e restituisce l'HTML.
async function renderOne(data, page, locale) {
  const tpl = requireTemplate();
  const meta = { fontsCss: 'css/fonts.css', preload: [], htmlAttrs: htmlAttrs(data.tokens) };
  const full = { ...data, meta };
  const images = imageInfo(full, [path.join(tpl.assetsDir, 'img'), mediaDir()]);
  const [r] = await renderPages(tpl, { data: full, jobs: [{ locale, keys: [page.key] }], images }, { timeoutMs: 20_000 });
  return r.html;
}

// pathname: percorso pubblico della pagina, es. "/servizi/". Restituisce null se la pagina non esiste.
export async function renderPreview(pathname) {
  const data = withBlog(await loadData('draft'));
  if (!data.tokens || !data.site) return { error: 'Database vuoto: installa i contenuti di esempio del template o completa l\'installazione' };
  // Un indirizzo per lingua (/servizi/, /en/services/…): vale la prima lingua in cui la pagina ha una versione con quell'indirizzo.
  for (const locale of data.site.locales.enabled) {
    const ctx = createContext(data, locale);
    const page = data.pages.find((p) => ctx.hasVersion(p.key, locale) && ctx.pathOf(p.key, locale) === pathname);
    if (!page) continue;
    try { return { html: toPreviewHtml(await renderOne(data, ctx.pageIn(page.key, locale), locale), data.tokens, { intercept: true }) }; }
    catch (e) { return { error: `Anteprima non disponibile: ${e.message}` }; }
  }
  return null;
}

// Elenco delle pagine per il selettore dell'anteprima: { key, name, path }.
export async function previewPages() {
  const data = await loadData('draft');
  if (!data.site) return [];
  // Una voce per ogni versione: la pagina di base (chiave «home») e le traduzioni (chiave del documento, «home--en»).
  const out = [];
  for (const locale of data.site.locales.enabled) {
    const ctx = createContext(data, locale);
    for (const p of data.pages) {
      if (!ctx.hasVersion(p.key, locale)) continue;
      const v = ctx.pageIn(p.key, locale);
      out.push({ key: v === p || !v.translationOf ? p.key : `${p.key}--${locale}`, name: ctx.t(v.name), path: ctx.pathOf(p.key, locale), locale });
    }
  }
  return out;
}

// Anteprima di un documento con le modifiche non ancora salvate: sostituisce il documento nelle bozze e rende la pagina.
// kind: 'page' | 'site' | 'shared' | 'headers' | 'footers'. Per tutti tranne page si sceglie la pagina da mostrare con `pathname` (default: home).
// Non lancia: se i dati sono incompleti e il template non ce la fa, restituisce { error }.
export async function renderDraftPreview({ kind, key, data }, pathname) {
  const base = await loadData('draft');
  if (!base.tokens || !base.site) return { error: 'Database vuoto: installa i contenuti di esempio del template o completa l\'installazione' };
  const pages = [...base.pages];
  let translations = base.translations ?? [];
  const isTr = kind === 'page' && !!data?.translationOf;
  if (isTr) translations = translations.some((p) => p.key === key) ? translations.map((p) => (p.key === key ? data : p)) : [...translations, data];
  else if (kind === 'page') { const i = pages.findIndex((p) => p.key === key); if (i >= 0) pages[i] = data; else pages.push(data); }
  const site = kind === 'site' ? data : base.site;
  const shared = kind === 'shared' ? data : base.shared;
  const headers = kind === 'headers' ? data : base.headers;
  const footers = kind === 'footers' ? data : base.footers;
  const categories = kind === 'categories' ? data : base.categories;
  const tags = kind === 'tags' ? data : base.tags;
  let posts = base.posts ?? [];
  let postTranslations = base.postTranslations ?? [];
  const isPostTr = kind === 'post' && !!data?.translationOf;
  if (isPostTr) postTranslations = postTranslations.some((p) => p.key === key) ? postTranslations.map((p) => (p.key === key ? data : p)) : [...postTranslations, data];
  else if (kind === 'post') posts = posts.some((p) => p.key === key) ? posts.map((p) => (p.key === key ? data : p)) : [...posts, data];
  try {
    const merged = withBlog({ ...base, site, shared, headers, footers, categories, tags, posts, postTranslations, pages, translations }, { previewKey: kind === 'post' ? key : null });
    const locale = isTr || isPostTr ? data.lang : kind === 'page' || kind === 'post' ? data.lang ?? site.locales?.base ?? site.locales?.default ?? 'it' : site.locales?.default ?? 'it';   // la pagina si vede nella lingua in cui è scritta
    const ctx = createContext(merged, locale);
    const page = isTr ? ctx.pageIn(data.translationOf, locale) : kind === 'page' ? data : isPostTr ? ctx.pageIn(`post-${data.translationOf}`, locale) : kind === 'post' ? merged.pages.find((p) => p.key === `post-${key}`) : merged.pages.find((p) => ctx.pathOf(p.key) === pathname) ?? merged.pages.find((p) => p.key === 'home') ?? merged.pages[0];
    if (!page) return { error: 'Nessuna pagina da mostrare.' };
    return { html: toPreviewHtml(await renderOne(merged, page, locale), base.tokens, { intercept: true }), path: ctx.pathOf(page.key, locale) };
  } catch (e) {
    return { error: `Anteprima non disponibile con questi dati: ${e.message}` };
  }
}
