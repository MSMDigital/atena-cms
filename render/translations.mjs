// Versioni per lingua delle pagine. Ogni lingua oltre a quella di base è un documento a sé («home--en»), collegato alla pagina di base
// da `translationOf` e con i testi solo nella propria lingua. Funzioni pure: le usano il motore (build, anteprima), la validazione e l'admin.
// Questo file sta in render/ perché il processo isolato dei template legge solo quella cartella.
import { LOCALES as CODES } from './locales.mjs';

// Un testo per lingua: oggetto non vuoto con solo codici di lingua e valori testuali ({ it: '…', en: '…' }).
const isMap = (o) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0 && Object.keys(o).every((k) => CODES.includes(k)) && Object.values(o).every((v) => typeof v === 'string');

// `locales` (codici it-CH…) ha le stesse chiavi dei testi ma non è un testo da tradurre.
const SKIP = new Set(['locales']);

function walk(node, fn, key) {
  if (Array.isArray(node)) return node.map((n) => walk(n, fn));
  if (node && typeof node === 'object') {
    if (!SKIP.has(key) && isMap(node)) return fn(node);
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, fn, k)]));
  }
  return node;
}

// Sposta i testi da una lingua a un'altra in tutto il documento (la lingua dei contenuti esistenti cambia da `from` a `to`).
export function renameLocale(doc, from, to) {
  if (from === to) return doc;
  return walk(doc, (m) => { const out = { ...m }; if (from in out) { const v = out[from]; delete out[from]; out[to] = v; } else if (to in out) delete out[to]; return out; });
}

// La copia per una nuova lingua: ogni testo diventa { to: testo attuale in `from` } (o quello già scritto in `to`, se c'è).
export function projectLocale(doc, from, to) {
  return walk(doc, (m) => (to in m ? { [to]: m[to] } : from in m ? { [to]: m[from] } : { ...m }));
}

// Per lo schema (che chiede sempre `it`): la lingua `lang` del documento prende il posto di `it`. Serve solo a validare: non si salva.
export function shapeForSchema(doc, lang) {
  if (lang === 'it') return doc;
  return walk(doc, (m) => { const out = { ...m }; delete out.it; if (lang in m) { out.it = m[lang]; delete out[lang]; } return out; });
}

export const translationKey = (key, lang) => `${key}--${lang}`;
export const isTranslation = (p) => !!p && typeof p.translationOf === 'string' && typeof p.lang === 'string';

// { chiave della pagina di base: { lingua: documento } }
export function indexTranslations(list = []) {
  const by = Object.create(null);
  for (const tr of list) if (isTranslation(tr)) (by[tr.translationOf] ??= Object.create(null))[tr.lang] = tr;
  return by;
}

// La traduzione vista come pagina «normale»: stessa chiave della pagina di base (link, menu e indirizzi la usano), contenuto della lingua.
export const asPage = (tr) => (tr ? { ...tr, key: tr.translationOf } : tr);

// Divide i documenti di tipo pagina in pagine di base e traduzioni.
export function splitPages(all = []) {
  const pages = [], translations = [];
  for (const p of all) (isTranslation(p) ? translations : pages).push(p);
  return { pages, translations };
}

// La bozza di una nuova versione: i testi della pagina di base nella lingua `lang` (o quelli già scritti per quella lingua), in bozza,
// con «Titolo - EN» come nome e titolo SEO. L'indirizzo resta lo stesso (la lingua ha il suo prefisso, /en/…).
export function makeTranslation(page, base, lang) {
  const copy = projectLocale(page, base, lang);
  const sfx = ` - ${lang.toUpperCase()}`;
  const titled = (field) => (copy[field]?.[lang] && !page[field]?.[lang] ? { ...copy[field], [lang]: copy[field][lang] + sfx } : copy[field]);   // solo se il testo viene dalla pagina di base
  const out = { ...copy, key: translationKey(page.key, lang), translationOf: page.key, lang, status: 'draft' };
  delete out.publishAt;   // un articolo pianificato: la copia parte come bozza, senza data
  if (copy.name) out.name = titled('name');
  if (copy.title) out.title = titled('title');
  // `protected` resta com'è: una pagina protetta non deve avere una copia pubblica (la schermata con la password usa la chiave della pagina di base).
  return out;
}

// La lingua in cui sono scritti i contenuti di base (italiano finché non è stata definita).
export const baseOf = (site) => site?.locales?.base ?? 'it';
// Il testo nella prima lingua disponibile tra `langs`, poi in una qualsiasi: per mostrare un nome o un titolo in un elenco.
export const textOf = (v, ...langs) => {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return '';
  for (const l of langs) if (typeof v[l] === 'string' && v[l]) return v[l];
  return Object.values(v).find((x) => typeof x === 'string' && x) ?? '';
};
