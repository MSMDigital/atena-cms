// Sanificazione dei testi ricchi, applicata a OGNI uscita (sito, anteprima, bozze): non ci si affida a chi ha salvato il dato.
// Si tengono solo i tag ammessi (senza attributi, tranne href su <a>) e solo indirizzi di tipo noto; tutto il resto sparisce e un
// "<" che non apre un tag ammesso diventa testo (&lt;). Il testo tra i tag non si tocca: le entità (&amp;, &lt;...) restano com'erano.
// È indipendente dalla regex dello schema (che serve a dare errori chiari all'editor): anche un dato entrato da un'altra strada è innocuo.

const TAGS = new Set(['strong', 'em', 'p', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'a']);
// page:<chiave>[#ancora] e channel:<canale> li risolve il renderer; il resto sono indirizzi veri. Mai javascript:, data:, vbscript:...
export const HREF_OK = /^(?:page:[a-z0-9-]+(?:#[a-z][a-z0-9-]*)?|channel:[a-z0-9_]+|https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+0-9().-]+|#[a-z][a-z0-9-]*)$/i;

// Un tag ben formato: <nome attributi> o </nome>. Attributi: nome[=valore] con valore tra virgolette o senza spazi.
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y;
const HREF_ATTR = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

const escAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hasControlOrSpace = (v) => Array.from(v).some((c) => { const n = c.charCodeAt(0); return n <= 32 || n === 127; });
// Entità numeriche/nominali nell'href (es. "java&#115;cript:") si decodificano prima del controllo, così non passano di nascosto.
const decodeForCheck = (v) => v
  .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16) || 32, 0x10ffff)))
  .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(+d || 32, 0x10ffff)))
  .replace(/&(?:colon|Tab|NewLine);/gi, ':')
  .replace(/&amp;/gi, '&');

export function sanitizeRich(input) {
  const s = String(input ?? '');
  let out = ''; let i = 0; let skipClose = 0;   // </a> da saltare: quelli dei <a> tolti perché senza indirizzo valido
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) { out += s.slice(i); break; }
    out += s.slice(i, lt);
    TAG.lastIndex = lt;
    const m = TAG.exec(s);
    if (!m) { out += '&lt;'; i = lt + 1; continue; }          // "<" che non apre un tag: testo
    i = lt + m[0].length;
    const [, closing, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (!TAGS.has(name)) continue;                             // tag non ammesso: sparisce (script, img, iframe, style...)
    if (closing) { if (name === 'a' && skipClose > 0) skipClose--; else if (name !== 'br') out += `</${name}>`; continue; }
    if (name === 'a') {
      const h = HREF_ATTR.exec(attrs);
      const href = (h ? (h[1] ?? h[2] ?? h[3] ?? '') : '').trim();
      // L'indirizzo deve essere già valido così com'è e anche dopo aver decodificato le entità: niente scorciatoie con &#..; o spazi/controlli.
      if (href && !hasControlOrSpace(href) && HREF_OK.test(href) && HREF_OK.test(decodeForCheck(href).trim())) out += `<a href="${escAttr(href)}">`;
      else skipClose++;
      continue;                                                // senza indirizzo valido il tag <a> non compare, il testo resta
    }
    out += `<${name}>`;
  }
  return out;
}
