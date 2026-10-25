// Dati di contorno per gli editor: elenco pagine (per i link), immagini disponibili, blocchi condivisi, lingue.
import { loadData } from './docs.mjs';
import { query } from './db.mjs';
import { listMedia, maxUploadBytes } from './media.mjs';
import { previewPages } from './preview.mjs';
import { requireTemplate } from './template.mjs';
import { schemasFor } from '../schema/index.mjs';
import { baseOf, textOf } from '../render/translations.mjs';

// Nomi degli utenti attivi del CMS: gli autori di articoli si scelgono da qui.
export async function listAuthors() {
  return (await query("SELECT name FROM users WHERE active = 1 AND role IN ('admin', 'author') ORDER BY name")).map((u) => u.name);
}

export async function editorMeta() {
  const [data, previews] = await Promise.all([loadData('draft'), previewPages()]);
  const tpl = requireTemplate();
  return {
    schemas: schemasFor(tpl),
    ui: JSON.parse(JSON.stringify(tpl.ui)),   // oggetti semplici: quelli senza prototipo non passano ai componenti client
    template: { id: tpl.id, name: tpl.manifest.name, version: tpl.manifest.version },
    pages: previews.filter((p) => !p.key.includes('--') && p.key !== '404' && (p.locale === (data.site?.locales?.base ?? data.site?.locales?.default ?? 'it') || !previews.some((q) => q.key === p.key && q.locale !== p.locale))).map(({ key, name }) => ({ key, name })),   // per i link: una voce per pagina (la versione di base)
    previewPages: previews,
    media: await listMedia(),
    maxUploadMb: Math.round(maxUploadBytes() / 1048576),
    sharedKeys: Object.keys(data.shared ?? {}),
    categories: Object.entries(data.categories ?? {}).map(([key, c]) => ({ key, name: textOf(c?.name, baseOf(data.site), 'it') || key })),
    tags: Object.entries(data.tags ?? {}).map(([key, t]) => ({ key, name: textOf(t?.name, baseOf(data.site), 'it') || key })),
    authors: await listAuthors(),
    authorKeys: (await query("SELECT username, name FROM users WHERE active = 1 AND role IN ('admin', 'author') ORDER BY name")).map((u) => ({ key: u.username, name: u.name })),
    defaultOg: !!data.site?.seo?.defaultOgImage?.src,
    headerKeys: Object.keys(data.headers ?? {}),
    footerKeys: Object.keys(data.footers ?? {}),
    locales: data.site?.locales?.enabled ?? ['it'],
    defaultLocale: data.site?.locales?.default ?? 'it',
    baseLang: data.site?.locales?.base ?? null,
  };
}
