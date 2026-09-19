// Template HTML con escaping automatico: ogni valore interpolato è escapato, tranne quelli marcati con raw().
// Funzioni pure, senza dipendenze: girano uguali nella build (Node) e, in futuro, nell'anteprima dell'admin.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(String(s ?? ''));
export const isRaw = (v) => v instanceof Raw;

export const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const render = (v) => {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  return v instanceof Raw ? v.s : esc(v);
};

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

// Attributo opzionale: ` nome="valore"`, oppure niente se il valore è vuoto. `true` = attributo booleano.
export const attr = (name, value) => {
  if (value == null || value === false || value === '') return raw('');
  return raw(value === true ? ` ${name}` : ` ${name}="${esc(value)}"`);
};

// Elemento con nome dinamico (h2/h3/h4...).
export const el = (tag, attrs, content) => html`<${raw(tag)}${raw(Object.entries(attrs ?? {}).map(([k, v]) => attr(k, v).s).join(''))}>${content}</${raw(tag)}>`;

export const toString = (v) => render(v);
