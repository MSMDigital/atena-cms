// Dati di contorno per gli editor: elenco pagine (per i link), immagini disponibili, blocchi condivisi, lingue.
import { loadData } from './docs.mjs';
import { listMedia, maxUploadBytes } from './media.mjs';
import { previewPages } from './preview.mjs';
import { requireTemplate } from './template.mjs';
import { schemasFor } from '../schema/index.mjs';

export async function editorMeta() {
  const [data, previews] = await Promise.all([loadData('draft'), previewPages()]);
  const tpl = requireTemplate();
  return {
    schemas: schemasFor(tpl),
    ui: JSON.parse(JSON.stringify(tpl.ui)),   // oggetti semplici: quelli senza prototipo non passano ai componenti client
    template: { id: tpl.id, name: tpl.manifest.name, version: tpl.manifest.version },
    pages: previews.map(({ key, name }) => ({ key, name })),
    previewPages: previews,
    media: await listMedia(),
    maxUploadMb: Math.round(maxUploadBytes() / 1048576),
    sharedKeys: Object.keys(data.shared ?? {}),
    locales: data.site?.locales?.enabled ?? ['it'],
    defaultLocale: data.site?.locales?.default ?? 'it',
  };
}
