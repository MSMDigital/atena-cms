// Definizioni comuni degli schemi (JSON Schema 2020-12, scritti con piccoli helper).
// Le etichette (title) e gli aiuti (description) sono in italiano: alimentano i form dell'admin.
// Tutti i testi visibili sono oggetti per lingua { it, de, fr }: `it` è obbligatorio, le altre lingue ricadono su `it`.

// Le lingue (ISO 639-1) con nome e codice proposto (valore di html lang e og:locale): il catalogo sta in render/locales.mjs.
import { LOCALES, DEFAULT_TAG, LOCALE_NAME, TAG_PATTERN } from '../render/locales.mjs';
export { LOCALES, DEFAULT_TAG, LOCALE_NAME, TAG_PATTERN };
export const SURFACES = ['light', 'dark', 'brand'];
export const BASE = 'https://atena.cms/schema/';

// Riferimento a una definizione comune; i sibling (title, description...) sono ammessi accanto a $ref.
export const ref = (name, extra = {}) => ({ $ref: `${BASE}common.json#/$defs/${name}`, ...extra });
export const text = (title, extra) => ref('text', { title, ...extra });
export const textLong = (title, extra) => ref('textLong', { title, ...extra });
export const richInline = (title, extra) => ref('richInline', { title, ...extra });
export const richBlock = (title, extra) => ref('richBlock', { title, ...extra });
export const richFull = (title, extra) => ref('richFull', { title, ...extra });
export const image = (title, extra) => ref('image', { title, ...extra });
export const link = (title, extra) => ref('link', { title, ...extra });
export const header = (extra) => ref('sectionHeader', { title: 'Testata della sezione', ...extra });
export const buttons = (min, max) => ({ title: 'Pulsanti', type: 'array', minItems: min, maxItems: max, items: ref('button') });
// Codice (HTML, CSS, JS): un testo unico, non per lingua, senza il controllo che rifiuta i tag non ammessi (lib/content-guard.mjs esenta
// apposta questi campi, che sono sempre riservati a un admin). Non passa dalla sanificazione: va inserito così com'è.
export const code = (title, extra) => ({ type: 'string', maxLength: 20000, 'x-widget': 'code', title, ...extra });

// Testo per lingua.
const i18n = (value) => ({
  type: 'object',
  patternProperties: { '^[a-z]{2}$': value },   // una chiave per lingua (le lingue sono tante: niente elenco nello schema, lo controlla la validazione)
  propertyNames: { enum: LOCALES },
  required: ['it'],
  additionalProperties: false,
});

// Solo questi tag in linea. Il salvataggio rifiuta il resto (lib/content-guard.mjs) e ogni uscita sanifica comunque (render/sanitize.mjs).
// I link interni usano href="page:<chiave>" o href="channel:<canale>", risolti dal renderer.
const HREF = '(?:page:[a-z0-9-]+(?:#[a-z][a-z0-9-]*)?|channel:[a-z0-9_]+|https?:\\/\\/[^\\s\\x22\\x27<>]+|mailto:[^\\s\\x22\\x27<>]+|tel:[+0-9().-]+|#[a-z][a-z0-9-]*)';   // niente javascript:, data:... (\x22 e \x27 sono le virgolette: scritte così per non dipendere dal modo in cui il codice viene impacchettato)
const A = `<a href="${HREF}">|<\\/a>`;
export const INLINE = `^(?:[^<]|<br ?\\/?>|<\\/?(?:strong|em)>|${A})*$`;
export const BLOCK = `^(?:[^<]|<br ?\\/?>|<\\/?(?:strong|em|p|ul|ol|li|blockquote|h[2-6])>|${A})*$`;

// Testo «completo» (editor visuale del blocco testo): in più u s sub sup hr pre code, span, stili (colore, sfondo, dimensione, allineamento),
// immagini della libreria media e video YouTube/Vimeo, tutti nella forma canonica che scrive render/sanitize.mjs (è il suo limite: ciò che
// esce da sanitizeRich supera sempre questo controllo, e viceversa ciò che lo supera non contiene altro).
const HEX = '#[0-9a-f]{6}';
const STYLE_COLOR = `(?:color:${HEX};)?(?:background-color:${HEX};)?(?:font-size:\\d(?:\\.\\d{1,3})?rem;)?`;
const STYLE_BLOCK = `(?: style="(?=[a-z])${STYLE_COLOR}(?:text-align:(?:left|center|right|justify);)?")?`;
const IMG = '<img src="\\/assets\\/img\\/(?!\\S*\\.\\.)(?!\\S*\\/\\/)[a-zA-Z0-9][a-zA-Z0-9_.\\/-]*" alt="[^"<>]{0,2000}">';
const IFRAME = '<iframe src="https:\\/\\/(?:www\\.youtube-nocookie\\.com\\/embed\\/[A-Za-z0-9_-]{11}|player\\.vimeo\\.com\\/video\\/\\d{1,12})" title="[^"<>]{0,600}" loading="lazy" allowfullscreen><\\/iframe>';
export const FULL = `^(?:[^<]|<(?:br|hr) ?\\/?>|<(?:strong|em|u|s|sub|sup|ul|ol|pre|code)>|<\\/(?:strong|em|u|s|sub|sup|ul|ol|pre|code|p|li|blockquote|h[2-6]|span)>|<(?:p|li|blockquote|h[2-6])${STYLE_BLOCK}>|<span style="(?=[a-z])${STYLE_COLOR}">|${IMG}|${IFRAME}|${A})*$`;

const focal = { type: 'object', properties: { x: { type: 'number', minimum: 0, maximum: 100 }, y: { type: 'number', minimum: 0, maximum: 100 } }, required: ['x', 'y'], additionalProperties: false };
const channel = { enum: ['phone', 'mobile', 'whatsapp', 'email'] };

export const common = {
  $id: `${BASE}common.json`,
  $defs: {
    text: i18n({ type: 'string', minLength: 1, maxLength: 300 }),
    textLong: i18n({ type: 'string', minLength: 1, maxLength: 2000, 'x-widget': 'textarea' }),
    richInline: i18n({ type: 'string', minLength: 1, maxLength: 4000, pattern: INLINE, 'x-widget': 'rich-inline' }),
    richBlock: i18n({ type: 'string', minLength: 1, maxLength: 60000, pattern: BLOCK, 'x-widget': 'rich-block' }),
    richFull: i18n({ type: 'string', minLength: 1, maxLength: 120000, pattern: FULL, 'x-widget': 'rich-full' }),

    blockId: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{1,63}$' },
    pageKey: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
    anchor: { type: 'string', pattern: '^[a-z][a-z0-9-]*$', title: 'Ancora', description: 'Serve per i link interni alla sezione (es. "noleggio" per pagina#noleggio).' },
    surface: { enum: SURFACES },

    image: {
      type: 'object',
      properties: {
        src: { type: 'string', minLength: 1, pattern: '^(?!.*\\.\\.)(?!.*//)(?:[a-zA-Z0-9][a-zA-Z0-9_./-]*)?$', title: 'File', description: 'Percorso nella libreria media.' },
        alt: text('Testo alternativo', { description: 'Descrive l\'immagine a chi non la vede e ai motori di ricerca.' }),
        focal: { ...focal, title: 'Punto focale', description: 'Cosa resta al centro quando l\'immagine viene ritagliata (percentuali).' },
        focalMobile: { ...focal, title: 'Punto focale su mobile' },
      },
      required: ['src', 'alt'],
      additionalProperties: false,
    },

    // Link: pagina interna (per chiave, mai per URL), URL esterno, ancora nella stessa pagina, canale dei dati azienda.
    link: {
      discriminator: { propertyName: 'type' },
      oneOf: [
        { type: 'object', properties: { type: { const: 'page' }, page: ref('pageKey'), anchor: ref('anchor') }, required: ['type', 'page'], additionalProperties: false },
        { type: 'object', properties: { type: { const: 'url' }, url: { type: 'string', pattern: '^(?:https?:\\/\\/|mailto:|tel:)[^\\s\\x22<>]+$' } }, required: ['type', 'url'], additionalProperties: false },
        { type: 'object', properties: { type: { const: 'anchor' }, anchor: ref('anchor') }, required: ['type', 'anchor'], additionalProperties: false },
        { type: 'object', properties: { type: { const: 'channel' }, channel }, required: ['type', 'channel'], additionalProperties: false },
      ],
    },

    button: {
      type: 'object',
      properties: {
        label: text('Etichetta', { description: 'Se il link è un canale (telefono, WhatsApp...) e l\'etichetta è vuota, si usa il valore del canale.' }),
        link: link('Link'),
        style: { title: 'Stile', enum: ['primary', 'secondary', 'inverse', 'whatsapp'], default: 'primary' },
      },
      required: ['link', 'style'],
      additionalProperties: false,
      if: { properties: { link: { properties: { type: { const: 'channel' } }, required: ['type'] } }, required: ['link'] },
      else: { required: ['label'] },
    },

    // Testata comune a quasi tutte le sezioni di contenuto. Con `text` il titolo e il testo stanno affiancati; senza, il titolo è solo.
    sectionHeader: {
      type: 'object',
      properties: {
        eyebrow: text('Etichetta', { description: 'Piccola scritta sopra il titolo. Diventa anche la scritta verticale laterale.' }),
        title: text('Titolo'),
        level: { title: 'Livello del titolo', enum: ['h2', 'h3', 'h4'], default: 'h2', description: 'L\'aspetto segue la scala tipografica di quel livello.' },
        text: richInline('Testo'),
      },
      required: ['title'],
      additionalProperties: false,
    },

    // Elenco di contatti: telefono, email, indirizzo, orari. Con un canale nei dati azienda il valore può mancare e si legge da lì.
    contactItem: {
      type: 'object',
      properties: { label: text('Etichetta'), value: text('Valore'), link: link('Link', { description: 'Vuoto per indirizzo e orari.' }) },
      required: ['label'],
      additionalProperties: false,
      if: { properties: { link: { properties: { type: { const: 'channel' } }, required: ['type'] } }, required: ['link'] },
      else: { required: ['value'] },
    },

    // Tabella etichetta/valore: usata dal blocco Tabella dati e come contenuto extra di Testo + immagine.
    specTable: {
      type: 'object',
      properties: {
        caption: text('Didascalia', { description: 'Letta dagli screen reader, non visibile.' }),
        rows: { title: 'Righe', type: 'array', minItems: 1, items: { type: 'object', properties: { label: text('Etichetta'), value: text('Valore') }, required: ['label', 'value'], additionalProperties: false } },
      },
      required: ['caption', 'rows'],
      additionalProperties: false,
    },
  },
};

// Costruisce lo schema di un blocco. `surfaces`: superfici ammesse (la prima è il default); null = il blocco non ha superficie.
export function block(type, title, props, { required = [], surfaces = SURFACES, allOf } = {}) {
  const surface = surfaces && { title: 'Superficie', enum: surfaces, default: surfaces[0] };
  return {
    $id: `${BASE}blocks/${type}.json`,
    title,
    type: 'object',
    properties: {
      id: ref('blockId'),
      type: { const: type },
      visible: { title: 'Visibile', type: 'boolean', default: true },
      anchor: ref('anchor'),
      ...(surface && { surface }),
      ...props,
    },
    required: ['id', 'type', ...(surface ? ['surface'] : []), ...required],
    additionalProperties: false,
    ...(allOf && { allOf }),
  };
}
