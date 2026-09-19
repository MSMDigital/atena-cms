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
import { tokensToCss, googleFontsHref, htmlAttrs } from '../render/tokens.mjs';

// Lo script dell'anteprima (stile dal vivo e link) è un file esterno, public/cms-preview.js: l'admin ha una CSP che vieta gli script inline,
// quindi anche un <script> arrivato per errore dentro un testo non potrebbe girare.
const runtime = (intercept) => `<script src="/cms-preview.js"${intercept ? ' data-intercept' : ''}></script>`;

export function toPreviewHtml(html, tokens, { intercept = false } = {}) {
  return html
    .replace('<link rel="stylesheet" href="/assets/css/tokens.css">', `<style id="live-tokens">${tokensToCss(tokens)}</style>`)
    .replace('<link rel="stylesheet" href="/assets/css/fonts.css">', `<link id="live-fonts" rel="stylesheet" href="${googleFontsHref(tokens)}">`)
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
  const data = await loadData('draft');
  if (!data.tokens || !data.site) return { error: 'Database vuoto: installa i contenuti di esempio del template o completa l\'installazione' };
  const ctx = createContext(data, data.site.locales.default);
  const page = data.pages.find((p) => ctx.pathOf(p.key) === pathname);
  if (!page) return null;
  try { return { html: toPreviewHtml(await renderOne(data, page, data.site.locales.default), data.tokens, { intercept: true }) }; }
  catch (e) { return { error: `Anteprima non disponibile: ${e.message}` }; }
}

// Elenco delle pagine per il selettore dell'anteprima: { key, name, path }.
export async function previewPages() {
  const data = await loadData('draft');
  if (!data.site) return [];
  const ctx = createContext(data, data.site.locales.default);
  return data.pages.map((p) => ({ key: p.key, name: ctx.t(p.name), path: ctx.pathOf(p.key) }));
}

// Anteprima di un documento con le modifiche non ancora salvate: sostituisce il documento nelle bozze e rende la pagina.
// kind: 'page' | 'site' | 'shared'. Per site e shared si sceglie la pagina da mostrare con `pathname` (default: home).
// Non lancia: se i dati sono incompleti e il template non ce la fa, restituisce { error }.
export async function renderDraftPreview({ kind, key, data }, pathname) {
  const base = await loadData('draft');
  if (!base.tokens || !base.site) return { error: 'Database vuoto: installa i contenuti di esempio del template o completa l\'installazione' };
  const pages = [...base.pages];
  if (kind === 'page') { const i = pages.findIndex((p) => p.key === key); if (i >= 0) pages[i] = data; else pages.push(data); }
  const site = kind === 'site' ? data : base.site;
  const shared = kind === 'shared' ? data : base.shared;
  try {
    const merged = { ...base, site, shared, pages };
    const locale = site.locales?.default ?? 'it';
    const ctx = createContext(merged, locale);
    const page = kind === 'page' ? data : pages.find((p) => ctx.pathOf(p.key) === pathname) ?? pages.find((p) => p.key === 'home') ?? pages[0];
    if (!page) return { error: 'Nessuna pagina da mostrare.' };
    return { html: toPreviewHtml(await renderOne(merged, page, locale), base.tokens, { intercept: true }), path: ctx.pathOf(page.key) };
  } catch (e) {
    return { error: `Anteprima non disponibile con questi dati: ${e.message}` };
  }
}
