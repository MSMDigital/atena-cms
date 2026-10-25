// Sanificazione dei testi ricchi, applicata a OGNI uscita (sito, anteprima, bozze): non ci si affida a chi ha salvato il dato.
// Si tengono solo i tag ammessi e, di ogni tag, solo gli attributi previsti, riscritti in forma canonica; tutto il resto sparisce e un
// "<" che non apre un tag ammesso diventa testo (&lt;). Il testo tra i tag non si tocca: le entità (&amp;, &lt;...) restano com'erano.
// È indipendente dalla regex dello schema (che serve a dare errori chiari all'editor): anche un dato entrato da un'altra strada è innocuo.
//
// Ammessi (editor «a blocchi» del testo): strong em u s sub sup p ul ol li blockquote h2-h6 br hr pre code a span img iframe.
//  - a: solo href (indirizzi di tipo noto, mai javascript:/data:...).
//  - style (su p, h2-h6, li, blockquote, span): solo color e background-color (esadecimali), font-size (in rem, 0.5-4) e text-align (non su span);
//    il resto del CSS cade. Si accettano le forme che scrive il browser (rgb(), parole chiave, px) e si riscrivono in forma canonica.
//  - img: solo immagini della libreria media (/assets/img/<percorso>, dove le pubblica il build), con alt.
//  - iframe: solo video YouTube (youtube-nocookie) e Vimeo, riscritti da zero; il contenuto tra i tag cade.
// La forma canonica è anche quella che accetta la regex FULL di schema/common.mjs: l'uscita di sanitizeRich supera sempre quel controllo.

const TAGS = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'p', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'pre', 'code', 'a', 'span', 'img', 'iframe']);
const VOID = new Set(['br', 'hr', 'img']);
const STYLED_BLOCK = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
// page:<chiave>[#ancora] e channel:<canale> li risolve il renderer; il resto sono indirizzi veri. Mai javascript:, data:, vbscript:...
export const HREF_OK = /^(?:page:[a-z0-9-]+(?:#[a-z][a-z0-9-]*)?|channel:[a-z0-9_]+|https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+0-9().-]+|#[a-z][a-z0-9-]*)$/i;

// Un tag ben formato: <nome attributi> o </nome>. Attributi: nome[=valore] con valore tra virgolette o senza spazi.
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const escAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hasControlOrSpace = (v) => Array.from(v).some((c) => { const n = c.charCodeAt(0); return n <= 32 || n === 127; });
// Entità numeriche/nominali nell'href (es. "java&#115;cript:") si decodificano prima del controllo, così non passano di nascosto.
const decodeForCheck = (v) => v
  .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16) || 32, 0x10ffff)))
  .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Math.min(+d || 32, 0x10ffff)))
  .replace(/&(?:colon|Tab|NewLine);/gi, ':')
  .replace(/&amp;/gi, '&');
// Testo di un attributo (alt, title): solo le cinque entità di base, poi si riscrive con escAttr (idempotente).
const decodeText = (v) => v.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plainAttr = (v, max) => Array.from(v).filter((c) => { const n = c.charCodeAt(0); return n >= 32 && n !== 127; }).join('').trim().slice(0, max);

function parseAttrs(attrs) {
  const out = new Map();
  ATTR.lastIndex = 0;
  for (let m; (m = ATTR.exec(attrs)); ) { const k = m[1].toLowerCase(); if (!out.has(k)) out.set(k, m[2] ?? m[3] ?? m[4] ?? ''); }
  return out;
}

// ---- stili ------------------------------------------------------------------------------------------------------------------------

const hex = (v) => {
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${[...m[1]].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(1|1\.0+|100%)\s*)?\)$/.exec(v);
  if (!m || [m[1], m[2], m[3]].some((n) => +n > 255)) return null;
  return `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')}`;
};
const SIZE_WORDS = { 'xx-small': 0.625, 'x-small': 0.75, small: 0.875, medium: 1, large: 1.25, 'x-large': 1.5, 'xx-large': 2, 'xxx-large': 2.5 };
const size = (v) => {
  let r = SIZE_WORDS[v];
  if (r === undefined) {
    const m = /^(\d{1,3}(?:\.\d{1,3})?)(px|rem|em|%)$/.exec(v);
    if (!m) return null;
    r = m[2] === 'px' ? +m[1] / 16 : m[2] === '%' ? +m[1] / 100 : +m[1];
  }
  if (!(r >= 0.5 && r <= 4)) return null;
  r = +r.toFixed(3);
  return r === 1 ? null : `${r}rem`;   // 1rem è la dimensione normale: non serve scriverla
};

// Il valore dell'attributo style → forma canonica (ordine fisso, ognuna chiusa da «;»), oppure '' se non resta nulla.
function cleanStyle(value, align) {
  const d = {};
  for (const part of decodeForCheck(value).split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).trim().toLowerCase();
    if (prop === 'color') d.color = hex(val) ?? d.color;
    else if (prop === 'background-color' || prop === 'background') d.bg = hex(val) ?? d.bg;
    else if (prop === 'font-size') d.size = size(val) ?? d.size;
    else if (prop === 'text-align' && align && ['left', 'center', 'right', 'justify'].includes(val)) d.align = val;
  }
  return (d.color ? `color:${d.color};` : '') + (d.bg ? `background-color:${d.bg};` : '') + (d.size ? `font-size:${d.size};` : '') + (d.align ? `text-align:${d.align};` : '');
}

// ---- video ------------------------------------------------------------------------------------------------------------------------

// Dall'indirizzo di un video (pagina o embed di YouTube o Vimeo) all'indirizzo di incorporamento, oppure null. Usata anche dall'editor.
export function videoEmbed(url) {
  const u = String(url ?? '').trim();
  let m = /^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#/].*)?$/i.exec(u)
    ?? /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/i.exec(u)
    ?? /^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#/].*)?$/i.exec(u);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = /^https:\/\/(?:www\.)?vimeo\.com\/(\d{1,12})(?:[?#/].*)?$/i.exec(u) ?? /^https:\/\/player\.vimeo\.com\/video\/(\d{1,12})(?:[?#/].*)?$/i.exec(u);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}
const embedOf = (u) => (/^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d{1,12})$/.test(u) ? u : videoEmbed(u));

const IMG_SRC = /^\/assets\/img\/(?!\S*\.\.)(?!\S*\/\/)[a-zA-Z0-9][a-zA-Z0-9_./-]*$/;

export function sanitizeRich(input) {
  const s = String(input ?? '');
  let out = ''; let i = 0;
  let closes = null; let ci = 0;   // posizioni dei </iframe>, calcolate solo se servono
  const open = [];   // a e span aperti: true se il tag è stato scritto (altrimenti anche la sua chiusura sparisce)
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
    if (!TAGS.has(name)) continue;                             // tag non ammesso: sparisce (script, style, svg...)
    if (closing) {
      if (name === 'a' || name === 'span') {
        for (let k = open.length - 1; k >= 0; k--) if (open[k].name === name) { const [o] = open.splice(k, 1); if (o.emitted) out += `</${name}>`; break; }
      } else if (!VOID.has(name) && name !== 'iframe') out += `</${name}>`;
      continue;
    }
    if (name === 'a') {
      const h = parseAttrs(attrs).get('href');
      const href = (h ?? '').trim();
      // L'indirizzo deve essere già valido così com'è e anche dopo aver decodificato le entità: niente scorciatoie con &#..; o spazi/controlli.
      const ok = href && !hasControlOrSpace(href) && HREF_OK.test(href) && HREF_OK.test(decodeForCheck(href).trim());
      open.push({ name, emitted: !!ok });
      if (ok) out += `<a href="${escAttr(href)}">`;
      continue;                                                // senza indirizzo valido il tag <a> non compare, il testo resta
    }
    if (name === 'span') {
      const st = cleanStyle(parseAttrs(attrs).get('style') ?? '', false);
      open.push({ name, emitted: !!st });
      if (st) out += `<span style="${st}">`;
      continue;
    }
    if (name === 'img') {
      const a = parseAttrs(attrs);
      const src = decodeForCheck(a.get('src') ?? '').trim();
      if (IMG_SRC.test(src) && src.length <= 220) out += `<img src="${src}" alt="${escAttr(plainAttr(decodeText(a.get('alt') ?? ''), 300))}">`;
      continue;
    }
    if (name === 'iframe') {
      const a = parseAttrs(attrs);
      const src = embedOf(decodeForCheck(a.get('src') ?? '').trim());
      // il contenuto dell'iframe non serve: si salta fino alla sua chiusura (se non c'è, il tag è solo un tag)
      closes ??= [...s.matchAll(/<\/iframe\s*>/gi)].map((c) => [c.index, c.index + c[0].length]);
      while (ci < closes.length && closes[ci][0] < i) ci++;
      if (ci < closes.length) i = closes[ci][1];
      if (src) out += `<iframe src="${src}" title="${escAttr(plainAttr(decodeText(a.get('title') ?? ''), 100) || 'Video')}" loading="lazy" allowfullscreen></iframe>`;
      continue;
    }
    if (STYLED_BLOCK.has(name)) {
      const st = cleanStyle(parseAttrs(attrs).get('style') ?? '', true);
      out += st ? `<${name} style="${st}">` : `<${name}>`;
      continue;
    }
    out += `<${name}>`;
  }
  return out;
}
