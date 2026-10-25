// Traduzioni dell'interfaccia dell'admin (Impostazioni → Lingue → Lingua del CMS). Funzioni pure: le usano server e browser.
//
// Il testo in italiano è la CHIAVE: t('Salva') → «Save» in inglese, «Salva» in italiano. Una frase senza traduzione resta in italiano
// (mai una chiave tecnica a vista). Valori variabili: segnaposto {nome} con t('Ripristinare «{name}»?', { name }); anche una frase già
// composta ("Esiste già «foo»") si traduce se nel dizionario c'è la forma con segnaposto ("Esiste già «{x}»").
// Il dizionario inglese sta in lib/i18n/en/*.mjs (uno o più file per area), riunito in lib/i18n/en.mjs; si passa a makeT (il server lo importa,
// il browser lo scarica solo se la lingua è l'inglese).
export const LANGS = { it: 'Italiano', en: 'English' };
export const normLang = (l) => (l === 'en' ? 'en' : 'it');

const fill = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : String(text));

// Chiavi con segnaposto → espressioni regolari (per tradurre le frasi già composte), calcolate una volta per dizionario.
const compiled = new WeakMap();
const patternsOf = (dict) => {
  if (compiled.has(dict)) return compiled.get(dict);
  const patterns = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!/\{\w+\}/.test(k)) continue;
    const names = []; let src = '';
    k.split(/(\{\w+\})/).forEach((part) => { const m = part.match(/^\{(\w+)\}$/); if (m) { names.push(m[1]); src += '([\\s\\S]+?)'; } else src += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    patterns.push({ re: new RegExp(`^${src}$`), names, to: v });
  }
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);   // prima le più specifiche
  compiled.set(dict, patterns);
  return patterns;
};

const lookup = (dict, text) => {
  const s = String(text ?? '');
  if (Object.hasOwn(dict, s)) return dict[s];
  for (const p of patternsOf(dict)) { const m = p.re.exec(s); if (m) return p.to.replace(/\{(\w+)\}/g, (x, n) => { const i = p.names.indexOf(n); return i >= 0 ? m[i + 1] : x; }); }
  return s;
};

// t = makeT('en', EN). Con 'it' restituisce il testo com'è (con i segnaposto riempiti).
export const makeT = (lang, dict = {}) => (normLang(lang) === 'en' ? (text, vars) => fill(lookup(dict, text), vars) : (text, vars) => fill(text, vars));

// Traduce i testi di un risultato di un'azione del server (messaggi di errore, elenchi di motivi...), lasciando intatto il resto.
export function localize(result, t, keys = ['error', 'errors', 'skipped', 'details', 'warnings', 'text', 'message', 'publishError']) {
  const walk = (v) => (typeof v === 'string' ? t(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  if (!result || typeof result !== 'object') return result;
  const out = { ...result };
  for (const k of keys) if (k in out) out[k] = walk(out[k]);
  return out;
}
