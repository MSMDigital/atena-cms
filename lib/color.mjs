// Colori e contrasto (WCAG). Funzioni pure, usate dall'editor dello stile.
export function parseColor(v) {
  if (typeof v !== 'string') return null;
  let m = v.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  m = v.trim().match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (m) { const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return [+m[1], +m[2], +m[3], a]; }
  return null;
}

export const overBackground = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Risolve un valore dei token (colore, o riferimento @brand/@brandTint/@ink) in [r,g,b,a].
export function resolveToken(value, tokens, surface) {
  const refs = { '@brand': tokens.colors.brand, '@brandTint': tokens.colors.brandTint, '@ink': tokens.surfaces[surface].ink };
  let v = refs[value] ?? value;
  if (typeof v === 'string' && v.startsWith('@')) return null;
  const c = parseColor(v);
  return c;
}

export const grade = (ratio) => (ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA (testo grande)' : 'insufficiente');
