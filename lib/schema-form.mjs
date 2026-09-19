// Modello dei form generati dagli schemi. Funzioni pure, senza React né Ajv: girano nel browser e nei test.
// Interpreta il sottoinsieme di JSON Schema usato in schema/ e dice, per ogni nodo, che tipo di campo è.
import { BASE } from '../schema/common.mjs';

// ---- risoluzione dei $ref -----------------------------------------------------------------

export function createModel(allSchemas) {
  const byId = new Map(allSchemas.map((s) => [s.$id, s]));

  // Segue i $ref, fondendo le proprietà accanto (title, description, x-when...). `ref` = nome della definizione ("text", "image", "hero").
  function deref(schema) {
    let out = schema;
    let ref = null;
    for (let guard = 0; out?.$ref && guard < 10; guard++) {
      const [id, frag] = out.$ref.split('#');
      let target = byId.get(id);
      if (!target) throw new Error(`$ref sconosciuto: ${out.$ref}`);
      if (frag) for (const seg of frag.split('/').filter(Boolean)) target = target[seg];
      ref ??= frag ? frag.split('/').pop() : id.replace(BASE, '').replace(/^blocks\//, '').replace(/\.json$/, '');
      const { $ref, ...siblings } = out;
      out = { ...target, ...siblings };
    }
    return { s: out, ref };
  }

  // Tipo di campo. Lancia se incontra qualcosa che il form non sa disegnare (lo intercetta il test sugli schemi).
  function kindOf(schema) {
    const { s, ref } = deref(schema);
    if (['text', 'textLong', 'richInline', 'richBlock'].includes(ref)) return { kind: 'i18n', widget: { text: 'text', textLong: 'textarea', richInline: 'rich-inline', richBlock: 'rich-block' }[ref], s };
    if (ref === 'image') return { kind: 'image', s };
    if (ref === 'link') return { kind: 'link', s };
    if (ref === 'pageKey') return { kind: 'pageKey', s };
    if (ref === 'blockId') return { kind: 'hidden', s };
    if (s.const !== undefined) return { kind: 'const', s };
    if (s.enum) return { kind: 'enum', s };
    if (s.oneOf && s.discriminator) return { kind: 'union', s };
    if (s.anyOf && s.anyOf.some((x) => deref(x).ref === 'pageKey')) return { kind: 'pageKeyNullable', s };
    if (s.type === 'object') {
      if (s.properties) return { kind: 'object', s };
      if (s.additionalProperties && typeof s.additionalProperties === 'object') return { kind: 'map', s };
    }
    if (s.type === 'array') return { kind: 'array', s };
    if (s.type === 'string' && s['x-widget'] === 'media') return { kind: 'mediaPath', s };
    if (s.type === 'string') return { kind: 'string', s };
    if (s.type === 'number' || s.type === 'integer') return { kind: 'number', s };
    if (s.type === 'boolean') return { kind: 'boolean', s };
    throw new Error(`schema non supportato dal form: ${JSON.stringify(s).slice(0, 120)}`);
  }

  // Varianti di un'unione discriminata: [{ value, title, schema }] (value = costante del campo discriminante).
  function variantsOf(unionSchema) {
    const { s } = deref(unionSchema);
    const key = s.discriminator.propertyName;
    return s.oneOf.map((v) => {
      const d = deref(v);
      return { value: d.s.properties?.[key]?.const, title: d.s.title, schema: v };
    });
  }

  const variantFor = (unionSchema, value) => {
    const key = deref(unionSchema).s.discriminator.propertyName;
    return variantsOf(unionSchema).find((v) => v.value === value?.[key]) ?? null;
  };

  // Valore iniziale valido "per forma" (i testi obbligatori restano vuoti: lo schema li segnala finché non si compilano).
  function defaultValue(schema, idFor) {
    const { kind, s } = kindOf(schema);
    switch (kind) {
      case 'i18n': return { it: '' };
      case 'image': return { src: '', alt: { it: '' } };
      case 'link': return { type: 'page', page: 'home' };
      case 'pageKey': return 'home';
      case 'pageKeyNullable': return null;
      case 'hidden': return idFor ? idFor() : '';
      case 'const': return s.const;
      case 'enum': return s.default ?? s.enum[0];
      case 'boolean': return s.default ?? false;
      case 'number': return s.default ?? s.minimum ?? 0;
      case 'string': return '';
      case 'union': return defaultValue(variantsOf(schema)[0].schema, idFor);
      case 'array': return Array.from({ length: s.minItems ?? 0 }, () => defaultValue(s.items, idFor));
      case 'map': return {};
      case 'object': {
        const o = {};
        // Oltre ai campi sempre obbligatori, quelli che il ramo `else` condizionale richiede (es. l'etichetta di un pulsante: il link iniziale non è un canale).
        for (const k of [...(s.required ?? []), ...(s.else?.required ?? [])]) if (s.properties[k] && !(k in o)) o[k] = defaultValue(s.properties[k], idFor);
        return o;
      }
      default: return null;
    }
  }

  return { deref, kindOf, variantsOf, variantFor, defaultValue };
}

// ---- condizioni di visibilità (x-when) ---------------------------------------------------------------

// `x-when: { layout: ['cards', 'rows'] }` = il campo si mostra solo se il campo `layout` dell'oggetto più vicino che lo possiede vale uno di quei valori.
// `ancestors` = valori dal più lontano al più vicino.
export function isVisible(propSchema, ancestors) {
  const when = propSchema?.['x-when'];
  if (!when) return true;
  return Object.entries(when).every(([key, allowed]) => {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i];
      if (a && typeof a === 'object' && !Array.isArray(a) && key in a) return allowed.includes(a[key]);
    }
    return true;
  });
}

// ---- riassunto di un elemento in una riga -----------------------------------------------------------------

const SUMMARY_KEYS = ['title', 'titleLine1', 'question', 'name', 'label', 'caption', 'eyebrow', 'lead', 'text', 'value', 'header.title', 'header.eyebrow', 'quote', 'word', 'content'];

const textOf = (v) => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.it === 'string') return v.it;
  return '';
};

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function summarize(value, max = 70) {
  if (value == null) return '';
  const direct = strip(textOf(value));
  if (direct) return direct.length > max ? direct.slice(0, max - 1) + '…' : direct;
  if (typeof value !== 'object') return '';
  for (const k of SUMMARY_KEYS) {
    const v = k.split('.').reduce((o, p) => o?.[p], value);
    const t = strip(textOf(v));
    if (t) return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }
  return '';
}

// ---- id dei blocchi -------------------------------------------------------------------------------------------

export function newId(type, taken) {
  for (let i = 0; i < 50; i++) {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
    if (!taken.has(id)) return id;
  }
  throw new Error('impossibile generare un id univoco');
}

export function collectIds(node, acc = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => collectIds(n, acc));
  else if (node && typeof node === 'object') { if (typeof node.id === 'string' && node.type) acc.add(node.id); Object.values(node).forEach((n) => collectIds(n, acc)); }
  return acc;
}

// ---- etichette --------------------------------------------------------------------------------------------------

// Etichette del MOTORE (stati, lingue, tipi di link e di campo del modulo, consenso). Le altre le porta il template (ui.json: enumLabels, keyLabels).
export const ENUM_LABELS = {
  "light": "Chiara",
  "dark": "Scura",
  "brand": "Brand",
  "draft": "Bozza",
  "published": "Pubblicata",
  "it": "Italiano",
  "de": "Tedesco",
  "fr": "Francese",
  "page": "Pagina del sito",
  "url": "Indirizzo esterno",
  "anchor": "Ancora nella pagina",
  "channel": "Contatto",
  "builtin": "Integrata (clic su \"Mostra la mappa\")",
  "iubenda": "iubenda",
  "text": "Testo",
  "email": "Email",
  "tel": "Telefono",
  "date": "Data",
  "select": "Scelta",
  "textarea": "Testo lungo",
  "consent": "Consenso",
  "half": "Metà riga",
  "full": "Riga intera",
  "primary": "Primario",
  "secondary": "Secondario",
  "inverse": "Inverso",
  "whatsapp": "WhatsApp",
  "phone": "Telefono",
  "mobile": "Mobile",
};

// Testi dell'editor che arrivano dal template attivo: etichette, descrizione dei blocchi, titoli delle sezioni dei dati del sito.
let ui = { enumLabels: {}, keyLabels: {}, blockHints: {}, siteSections: {}, compactItems: [] };
// Le tabelle arrivano dal server come oggetti semplici (Next non passa oggetti senza prototipo ai componenti client): qui si rifanno
// senza prototipo, così un valore come "toString" o "constructor" non trova mai una funzione al posto dell'etichetta.
const nullMap = (o) => Object.assign(Object.create(null), o && typeof o === 'object' ? o : {});
export const setUi = (u) => { ui = { compactItems: [], ...(u ?? {}), enumLabels: nullMap(u?.enumLabels), keyLabels: nullMap(u?.keyLabels), blockHints: nullMap(u?.blockHints), siteSections: nullMap(u?.siteSections) }; };
export const uiOf = () => ui;

export const labelFor = (value) => ui.enumLabels[value] ?? ENUM_LABELS[value] ?? String(value);

// Etichette dei campi che lo schema non intitola (soprattutto i dati del sito e la pagina). Lo schema ha la precedenza.
export const KEY_LABELS = {
  "key": "Chiave",
  "status": "Stato",
  "parent": "Pagina padre",
  "slug": "Indirizzo",
  "it": "Italiano",
  "de": "Tedesco",
  "fr": "Francese",
  "default": "Lingua predefinita",
  "enabled": "Lingue online",
  "tags": "Codici lingua",
  "siteName": "Nome del sito",
  "favicon": "Icona (file)",
  "mapConsentText": "Mappa: testo del consenso",
  "mapShowButton": "Mappa: pulsante \"Mostra\"",
  "mapManageButton": "Mappa: pulsante delle preferenze",
  "mapOpenLink": "Mappa: link \"Apri in Google Maps\"",
  "cookiePreferences": "Link \"Preferenze cookie\" nel footer",
  "name": "Nome",
  "url": "Indirizzo",
  "email": "Email",
};
export const keyLabel = (k) => ui.keyLabels[k] ?? KEY_LABELS[k];
export const humanizeKey = (k) => k.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
