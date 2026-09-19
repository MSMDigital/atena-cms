// tokens.json → CSS. Funzioni pure, senza fs né rete: girano nella build, nell'admin (server) e nel browser (anteprima dal vivo).

export const EFFECTS = ['arrow', 'fill', 'lift', 'none'];
export const SURFACES = ['light', 'dark', 'brand'];
export const SURFACE_KEYS = ['bg', 'ink', 'inkSoft', 'muted', 'line', 'rule', 'accent', 'fill'];
export const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
export const TEXT = ['lead', 'body', 'small', 'xs', 'micro'];
// Dimensioni "display": testi grandi dei componenti, fuori dalla scala h1-h6. Nome → variabile --fs-display-<nome-in-kebab>.
export const DISPLAY = ['hero', 'marquee', 'list', 'split', 'cta', 'ctaWord', 'zones', 'quote', 'footer', 'number', 'pointNumber'];

// I valori finiscono dentro il CSS: si ammettono solo forme sicure (niente ; { } o altro con cui uscire dalla dichiarazione).
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|@(brand|brandTint|ink))$/i;
const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/;
const FONT_STACK = /^[\w\s",-]{1,200}$/;
const CSS_LENGTH = /^\d+(\.\d+)?(px|rem|em|%)$/;
const CSS_EXPR = /^(?!.*(?:\/\*|\*\/))[\w\s.,()+*/%-]{1,120}$/;          // clamp(...), calc(...); niente commenti CSS
const TRACKING = /^-?\d+(\.\d+)?em$/;
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'];
const validSize = (o) => Array.isArray(o?.size) && o.size.length === 2 && o.size.every((n) => typeof n === 'number' && n >= 8 && n <= 400)
  && (o.max == null || (typeof o.max === 'number' && o.max >= Math.max(...o.size)));
const inRange = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

// Elenco di errori leggibili; vuoto = token validi.
export function validateTokens(t) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  for (const k of ['brand', 'brandTint', 'whatsapp']) need(COLOR.test(t.colors?.[k] ?? ''), `colors.${k}: colore non valido`);
  for (const s of SURFACES) for (const k of SURFACE_KEYS) need(COLOR.test(t.surfaces?.[s]?.[k] ?? ''), `surfaces.${s}.${k}: colore non valido`);
  for (const k of [...HEADINGS, ...TEXT]) {
    const s = t.typography?.scale?.[k];
    need(validSize(s), `typography.scale.${k}: serve size [mobile, desktop] in px, max opzionale >= size`);
    if (s?.weight != null) need(Number.isInteger(s.weight) && inRange(s.weight, 100, 900), `typography.scale.${k}.weight: intero tra 100 e 900`);
    if (s?.lineHeight != null) need(inRange(s.lineHeight, 0.5, 3), `typography.scale.${k}.lineHeight: tra 0.5 e 3`);
    if (s?.tracking != null) need(TRACKING.test(s.tracking), `typography.scale.${k}.tracking: numero seguito da em (es. -0.02em)`);
  }
  for (const k of DISPLAY) need(validSize(t.typography?.display?.[k]), `typography.display.${k}: serve size [mobile, desktop] in px, max opzionale >= size`);
  const f = t.typography?.fonts;
  need(FONT_NAME.test(f?.body ?? ''), 'typography.fonts.body: nome di font non valido (solo lettere, numeri e spazi)');
  need(FONT_NAME.test(f?.heading ?? ''), 'typography.fonts.heading: nome di font non valido (solo lettere, numeri e spazi)');
  need(FONT_STACK.test(f?.fallback ?? ''), 'typography.fonts.fallback: elenco di font non valido');
  need(Array.isArray(f?.subsets) && f.subsets.length > 0 && f.subsets.every((x) => SUBSETS.includes(x)), `typography.fonts.subsets: elenco non vuoto tra ${SUBSETS.join(', ')}`);
  need((f?.extraWeights ?? []).every((w) => Number.isInteger(w) && inRange(w, 100, 900)), 'typography.fonts.extraWeights: interi tra 100 e 900');
  const r = t.typography?.fluid;
  need(inRange(r?.from, 200, 2000) && inRange(r?.to, 200, 4000) && r.from < r.to, 'typography.fluid: from deve essere < to');
  need(EFFECTS.includes(t.buttons?.effect), `buttons.effect: ammessi ${EFFECTS.join(', ')}`);
  need(CSS_LENGTH.test(t.buttons?.radius ?? ''), 'buttons.radius: una misura come 999px, 12px o 0px');
  need(inRange(t.buttons?.minHeight, 24, 120), 'buttons.minHeight: tra 24 e 120');
  need(Number.isInteger(t.buttons?.weight) && inRange(t.buttons.weight, 100, 900), 'buttons.weight: intero tra 100 e 900');
  const l = t.layout;
  need(inRange(l?.maxWidth, 600, 3000), 'layout.maxWidth: tra 600 e 3000');
  need(CSS_EXPR.test(l?.gutter ?? ''), 'layout.gutter: espressione CSS non valida');
  need(CSS_EXPR.test(l?.section ?? ''), 'layout.section: espressione CSS non valida');
  need(inRange(l?.headerHeight, 40, 200) && inRange(l?.headerHeightMobile, 40, 200), 'layout.headerHeight: tra 40 e 200');
  return errors;
}

const num = (n) => String(+n.toFixed(4));
const rem = (px) => `${num(px / 16)}rem`;
const REFS = { '@brand': 'var(--c-brand)', '@brandTint': 'var(--c-brand-tint)', '@ink': 'var(--ink)' };
const color = (v) => REFS[v] ?? v;
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// Dimensione fluida: size = [px a viewport `from`, px a viewport `to`], max = tetto oltre `to` (default: nessuna crescita).
// Stessa forma dei clamp scritti a mano: clamp(min, a + b·vw, max).
export function fluid({ size: [a, b], max }, { from, to }) {
  if (a === b && max == null) return rem(a);
  const slope = (b - a) / (to - from);            // px per px di viewport
  const base = a - slope * from;                  // px
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `clamp(${rem(lo)}, ${rem(base)} ${slope < 0 ? '-' : '+'} ${num(Math.abs(slope) * 100)}vw, ${rem(max ?? hi)})`;
}

export function tokensToCss(t) {
  const { fonts, scale, display, fluid: range } = t.typography;
  const L = ['/* GENERATO da scripts/build-tokens.mjs a partire da tokens.json. Non modificare a mano. */', ''];
  L.push(':root {');
  L.push(`  --c-brand: ${t.colors.brand};`);
  L.push('  --c-brand-hover: color-mix(in srgb, var(--c-brand) 74%, #000);');
  L.push(`  --c-brand-tint: ${t.colors.brandTint};`);
  L.push(`  --c-whatsapp: ${t.colors.whatsapp};`);
  L.push(`  --on-brand: ${color(t.surfaces.brand.ink)};`);
  L.push(`  --on-brand-soft: ${color(t.surfaces.brand.inkSoft)};`, '');

  const stack = (f) => `"${f}", ${fonts.fallback}`;
  L.push(`  --font-body: ${stack(fonts.body)};`);
  L.push(`  --font-heading: ${stack(fonts.heading)};`, '');

  for (const k of [...HEADINGS, ...TEXT]) {
    const s = scale[k];
    L.push(`  --fs-${k}: ${fluid(s, range)};`);
    if (s.weight != null) L.push(`  --fw-${k}: ${s.weight};`);
    if (s.lineHeight != null) L.push(`  --lh-${k}: ${s.lineHeight};`);
    if (s.tracking != null) L.push(`  --ls-${k}: ${s.tracking};`);
  }
  L.push('');
  for (const k of DISPLAY) L.push(`  --fs-display-${kebab(k)}: ${fluid(display[k], range)};`);
  L.push('');
  L.push(`  --btn-radius: ${t.buttons.radius};`);
  L.push(`  --btn-height: ${t.buttons.minHeight}px;`);
  L.push(`  --btn-weight: ${t.buttons.weight};`, '');
  L.push(`  --maxw: ${t.layout.maxWidth}px;`);
  L.push(`  --gutter: ${t.layout.gutter};`);
  L.push(`  --section: ${t.layout.section};`);
  L.push(`  --header-h: ${t.layout.headerHeight}px;`);
  L.push('}');
  L.push(`@media (max-width: 1024px) { :root { --header-h: ${t.layout.headerHeightMobile}px; } }`, '');

  // Superfici: ogni sezione dichiara data-surface="light|dark|brand" e i componenti leggono solo queste variabili.
  // `dark` è anche il default di pagina.
  const surfaceVars = (s) => SURFACE_KEYS.map((k) => `  --${k.replace('inkSoft', 'ink-soft')}: ${color(t.surfaces[s][k])};`).join('\n');
  L.push(`:root,\n[data-surface="dark"] {\n${surfaceVars('dark')}\n}`);
  for (const s of ['light', 'brand']) L.push(`[data-surface="${s}"] {\n${surfaceVars(s)}\n}`);
  L.push('');
  return L.join('\n');
}

// Famiglie, pesi e sottoinsiemi da avere in locale. `key` cambia solo se cambia qualcosa che richiede di riscaricare i font.
export function fontSpec(t) {
  const { fonts, scale } = t.typography;
  const weights = new Set(fonts.extraWeights ?? []);
  for (const k of [...HEADINGS, ...TEXT]) if (scale[k].weight != null) weights.add(scale[k].weight);
  weights.add(t.buttons.weight);
  const sorted = [...weights].sort((a, b) => a - b);
  const families = [...new Set([fonts.body, fonts.heading])];
  return { families, weights: sorted, wMin: sorted[0], wMax: sorted.at(-1), subsets: fonts.subsets, body: fonts.body };
}

// Solo per l'anteprima dell'admin: le famiglie scelte da Google Fonts, senza averle scaricate. Il sito pubblicato usa i file locali.
export function googleFontsHref(t) {
  const { families, wMin, wMax } = fontSpec(t);
  return 'https://fonts.googleapis.com/css2?' + families.map((f) => `family=${f.replace(/ /g, '+')}:wght@${wMin}..${wMax}`).join('&') + '&display=swap';
}

export const htmlAttrs = (t) => ({ 'data-btn-fx': t.buttons.effect });
