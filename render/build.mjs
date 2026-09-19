// Pubblicazione: dati (file o database) → cartella di output con HTML statico, asset, CSS dei token, font, sitemap e robots.
// Prima valida contenuti e token: con dati non validi non scrive nulla.
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from './image-size.mjs';
import { renderPages } from './host.mjs';
import { requireTemplate } from '../lib/template.mjs';
import { ROOT } from '../lib/env.mjs';
import { tokensToCss, validateTokens, htmlAttrs } from './tokens.mjs';
import { ensureFonts } from './fonts.mjs';
import { validateData } from '../schema/validate.mjs';
import { collectImageRefs } from './images.mjs';
import { esc } from './html.mjs';
import { isSafeLogical } from './images.mjs';

const isInside = (root, file) => path.resolve(file).startsWith(path.resolve(root) + path.sep);

export class BuildError extends Error {
  constructor(message, details = []) { super(message); this.details = details; }
}

// data: { site, pages, shared, tokens }. assetsDir: sorgente degli asset (css/js/img/fonts). outDir: destinazione (viene svuotata).
// mediaDir: cartella delle immagini caricate dall'admin (stessa struttura di assets/img); se ne pubblicano solo quelle usate.
// Costruisce il sito in `outDir`: valida, copia i file del template e i caricamenti usati, genera CSS e font dai token, fa scrivere l'HTML
// al template (in un processo isolato) e aggiunge sitemap e robots. Con dati non validi non tocca nulla.
export async function buildSite(data, { outDir, assetsDir, mediaDir, template, fontSourceDirs = [], fontCacheDir } = {}) {
  const tpl = template ?? requireTemplate();
  assetsDir ??= tpl.assetsDir;
  const tokenErrors = validateTokens(data.tokens);
  if (tokenErrors.length) throw new BuildError('Token non validi', tokenErrors);
  const { errors, warnings } = validateData(data, tpl);
  if (errors.length) throw new BuildError('Contenuti non validi', errors);

  // Un file d'immagine mancante blocca la pubblicazione (una pagina con un'immagine rotta non deve andare online), prima di toccare nulla.
  const imageRefs = collectImageRefs(data);
  const missing = [...imageRefs].filter((ref) => !isSafeLogical(ref) || (!fs.existsSync(path.join(assetsDir, 'img', ref)) && !(mediaDir && isInside(mediaDir, path.join(mediaDir, ref)) && fs.existsSync(path.join(mediaDir, ref)))));   // un percorso non sicuro conta come mancante
  if (missing.length) throw new BuildError('Immagini mancanti', missing.map((m) => `file non trovato: ${m}`));

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'assets');
  fs.cpSync(assetsDir, out, { recursive: true, filter: (src) => !/dev-shot\.css$|tokens\.meta\.json$|\.DS_Store$/.test(src) });
  fs.mkdirSync(path.join(out, 'cms'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'render/client/cms.js'), path.join(out, 'cms/cms.js'));   // lo script del motore (moduli, consenso)

  // Le immagini caricate si copiano solo se usate.
  for (const ref of imageRefs) {
    if (fs.existsSync(path.join(assetsDir, 'img', ref))) continue;
    fs.mkdirSync(path.dirname(path.join(out, 'img', ref)), { recursive: true });
    fs.copyFileSync(path.join(mediaDir, ref), path.join(out, 'img', ref));
  }

  // CSS e font vengono sempre dai token, non da eventuali copie vecchie negli asset.
  fs.mkdirSync(path.join(out, 'css'), { recursive: true });
  fs.writeFileSync(path.join(out, 'css/tokens.css'), tokensToCss(data.tokens));
  const fonts = await ensureFonts(data.tokens, { fontsDir: path.join(out, 'fonts'), cssPath: path.join(out, 'css/fonts.css'), sourceDirs: [path.join(assetsDir, 'fonts'), ...fontSourceDirs], sourceCss: [path.join(assetsDir, 'css/fonts.css')], cacheDir: fontCacheDir });
  const full = { ...data, meta: { fontsCss: 'css/fonts.css', preload: fonts.preload, htmlAttrs: htmlAttrs(data.tokens) } };

  const images = imageInfo(full, [path.join(assetsDir, 'img'), ...(mediaDir ? [mediaDir] : [])]);
  const jobs = data.site.locales.enabled.map((locale) => ({ locale, keys: [] }));
  const ctxFor = await import('./context.mjs');
  const urls = [];
  for (const job of jobs) {
    const ctx = ctxFor.createContext(full, job.locale, { images });
    for (const page of data.pages) if (ctx.isLive(page, job.locale)) { job.keys.push(page.key); if (!page.noindex) urls.push(ctx.urlOf(page.key, job.locale)); }
  }
  const rendered = await renderPages(tpl, { data: full, jobs, images });
  const ctxOf = Object.fromEntries(jobs.map((j) => [j.locale, ctxFor.createContext(full, j.locale, { images })]));
  let count = 0;
  for (const { locale, key, html } of rendered) {
    const dir = path.join(outDir, ctxOf[locale].pathOf(key));
    if (!isInside(outDir, path.join(dir, 'index.html'))) throw new BuildError('Indirizzo non valido', [`la pagina "${key}" finirebbe fuori dalla cartella del sito`]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    count++;
  }
  const base = data.site.siteUrl;
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  return { pages: count, warnings, fontNote: fonts.note };
}

// Larghezza e altezza di ogni immagine usata (anche in bozza): il processo isolato non legge file, quindi si calcolano qui.
export function imageInfo(data, dirs) {
  const map = {};
  for (const ref of collectImageRefs(data, { drafts: true })) {
    if (!isSafeLogical(ref)) continue;
    const size = dirs.map((d) => imageSize(path.join(d, ref))).find(Boolean);
    if (size) map[ref] = size;
  }
  return map;
}
