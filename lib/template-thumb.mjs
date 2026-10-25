// Anteprima in miniatura di UN template installato (attivo o no), accanto al suo nome in Admin → Template. Usa SEMPRE i contenuti di esempio
// del template stesso (mai il database): un template appena caricato, non ancora attivato, non ha documenti nel database.
// Gira nello stesso processo isolato del rendering normale (render/host.mjs): il codice del template non cambia comportamento per il fatto
// di essere "solo una miniatura".
import path from 'node:path';
import fs from 'node:fs';
import { TEMPLATE_ID, templatesDir, loadTemplateFrom } from './template.mjs';
import { loadData, createContext } from '../render/context.mjs';
import { renderPages } from '../render/host.mjs';
import { imageInfo } from '../render/build.mjs';
import { tokensToCss, previewFontsHref, htmlAttrs } from '../render/tokens.mjs';
import { signPreviewPath } from './preview-token.mjs';

// Il documento arriva a un iframe sandbox SENZA "allow-same-origin" (niente cookie): ogni file del template porta un token firmato,
// valido solo per quel template e quel percorso. Scade in fretta: è solo per il tempo di vedere la pagina Template.
const TTL_MS = 5 * 60_000;
const assetUrl = (id, rel) => {
  const t = signPreviewPath(`tpl/${id}/${rel}`, TTL_MS);
  return t ? `/admin/preview-assets/${rel}?tpl=${encodeURIComponent(id)}&t=${t}` : null;
};

export async function renderTemplateThumb(id) {
  if (!TEMPLATE_ID.test(id ?? '')) return { error: 'Template non valido.' };
  const dir = path.join(templatesDir(), id);
  if (!fs.existsSync(path.join(dir, 'template.json'))) return { error: 'Template non trovato.' };
  let tpl;
  try { tpl = loadTemplateFrom(dir); }
  catch (e) { return { error: `Template non valido: ${e.message}` }; }

  let data;
  try { data = loadData(dir); }
  catch (e) { return { error: `Contenuti di esempio non validi: ${e.message}` }; }
  const locale = data.site?.locales?.default ?? 'it';
  let page;
  try { const ctx = createContext(data, locale); page = data.pages.find((p) => p.key === 'home') ?? data.pages[0]; if (!page) throw new Error('nessuna pagina'); void ctx; }
  catch { return { error: 'Il template non ha pagine di esempio da mostrare.' }; }

  const meta = { fontsCss: 'css/fonts.css', preload: [], htmlAttrs: htmlAttrs(data.tokens) };
  const full = { ...data, meta };
  const images = imageInfo(full, [path.join(tpl.assetsDir, 'img')]);

  let html;
  try {
    const [r] = await renderPages(tpl, { data: full, jobs: [{ locale, keys: [page.key] }], images }, { timeoutMs: 15_000 });
    html = r.html;
  } catch (e) {
    return { error: `Anteprima non disponibile: ${e.message}` };
  }

  const out = html
    .replace('<link rel="stylesheet" href="/assets/css/tokens.css">', `<style>${tokensToCss(data.tokens)}</style>`)
    .replace('<link rel="stylesheet" href="/assets/css/fonts.css">', `<link rel="stylesheet" href="${previewFontsHref(data.tokens, signPreviewPath('fonts'))}">`)
    .replace(/<script data-cms-consent[^>]*>[\s\S]*?<\/script>\s*/g, '')   // niente banner cookie nella miniatura
    .replace('<head>', '<head>\n  <meta name="robots" content="noindex">')
    .replace(/(href|src)="\/assets\/([^"]*)"/g, (m, attr, rel) => { const u = assetUrl(id, rel); return u ? `${attr}="${u}"` : m; });
  return { html: out };
}
