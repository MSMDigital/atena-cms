// Icona e nome del sito gestito (Dati del sito → SEO: favicon e nome del sito), per la pagina di accesso e per il menu dell'admin.
// `prefer`: 'published' (accesso: ciò che è online) o 'draft' (admin: ciò che si sta scrivendo). Senza nome si resta su Atena.
import { getDoc } from './docs.mjs';

export async function siteBrand({ prefer = 'published' } = {}) {
  try {
    const d = await getDoc('site', 'main');
    const order = prefer === 'draft' ? [d?.draft?.seo, d?.published?.seo] : [d?.published?.seo, d?.draft?.seo];
    const pick = (k) => order.map((s) => s?.[k]).find((v) => v != null && String(v).trim() !== '');
    const name = String(pick('siteName') ?? '').trim();
    const favicon = pick('favicon');
    return { favicon: favicon ? `/admin/preview-assets/img/${favicon}` : null, name: name || null };
  } catch { return { favicon: null, name: null }; }   // prima dell'installazione, o database non raggiungibile
}
