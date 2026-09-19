// Immagini usate dal sito: servono a pubblicare solo quelle (un caricamento non ancora inserito in nessuna pagina non deve finire online)
// e a segnalare i file mancanti prima di pubblicare. Funzione pura.

// Percorso logico valido (relativo alla libreria immagini): niente ../, niente percorsi assoluti, solo caratteri semplici.
export const isSafeLogical = (p) => typeof p === 'string' && p.length <= 200 && /^[a-z0-9][a-z0-9_./-]*$/i.test(p) && !p.split('/').some((s) => s === '..' || s === '' || s === '.');

// Percorsi (relativi alla libreria media) delle immagini usate da dati del sito, blocchi condivisi e pagine pubblicate.
export function collectImageRefs({ site, shared, pages }, { drafts = false } = {}) {
  const refs = new Set();
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      if (typeof n.src === 'string' && n.src) refs.add(n.src);
      Object.values(n).forEach(walk);
    }
  };
  walk(site); walk(shared);
  for (const p of pages ?? []) if (drafts || p.status === 'published') walk(p);   // le bozze non vengono costruite (drafts: anche quelle, per l'anteprima)
  for (const f of [site?.company?.logoImage, site?.company?.image, site?.seo?.favicon]) if (f) refs.add(f);
  return refs;
}
