// I blocchi del catalogo (docs/catalogo-componenti.md). Uno schema per blocco.
// I campi non pertinenti a una variante (es. `previewImage` fuori da `rows`) restano nei dati ma non si mostrano:
// cambiare aspetto non fa perdere contenuti.
import { block, ref, text, textLong, richInline, richBlock, image, link, header, buttons } from './common.mjs';

const requireIn = (layout, fields) => ({
  if: { properties: { layout: { const: layout } }, required: ['layout'] },
  then: { properties: { items: { items: { required: fields } } } },
});

// Almeno uno tra etichetta e testo. Il renderer separa i due con uno spazio, tranne davanti a virgola, punto e simili
// (nel sito il testo può iniziare con ", anche completamente arredati").
const listItem = { type: 'object', properties: { label: text('Etichetta in grassetto'), text: richInline('Testo') }, anyOf: [{ required: ['label'] }, { required: ['text'] }], additionalProperties: false };

export const blocks = [
  block('hero', 'Hero', {
    image: image('Immagine'),
    titleLine1: text('Titolo, riga 1'),
    titleLine2: text('Titolo, riga 2', { description: 'Colore accento, allineata a destra.' }),
    claim: textLong('Claim', { description: 'Una riga per a capo.' }),
    badge: {
      title: 'Badge circolare',
      type: 'object',
      properties: { ring: { title: 'Testi attorno al badge', type: 'array', minItems: 1, maxItems: 4, items: text('Testo') }, label: text('Etichetta accessibile', { description: 'Letta dagli screen reader (es. "Richiedi un preventivo gratuito").' }), link: link('Link') },
      required: ['ring', 'label', 'link'],
      additionalProperties: false,
    },
  }, { required: ['image', 'titleLine1', 'titleLine2', 'claim'], surfaces: ['dark'] }),

  block('page-intro', 'Intestazione pagina', {
    title: text('Titolo (h1)'),
    lead: richInline('Testo introduttivo'),
    summary: richInline('In breve', { description: 'Risposta diretta, pensata anche per i motori di ricerca AI. Consigliata su ogni pagina di servizio.' }),
    buttons: buttons(0, 2),
  }, { required: ['title', 'lead'], surfaces: ['dark', 'light'] }),

  block('marquee', 'Nastro scorrevole', {
    items: { title: 'Voci', type: 'array', minItems: 3, maxItems: 24, items: text('Voce') },
  }, { required: ['items'], surfaces: ['brand', 'dark'] }),

  block('facts', 'Numeri', {
    label: text('Etichetta accessibile', { description: 'Letta dagli screen reader (es. "Mammano in numeri").' }),
    items: {
      title: 'Numeri', type: 'array', minItems: 4, maxItems: 4,
      items: { type: 'object', properties: { value: text('Valore', { description: 'Se inizia con una cifra parte il conteggio animato (es. 10\'000+).' }), label: text('Etichetta') }, required: ['value', 'label'], additionalProperties: false },
    },
  }, { required: ['label', 'items'], surfaces: ['dark', 'light'] }),

  block('wide-image', 'Immagine larga', { image: image('Immagine', { description: 'Formato 21:9, ritagliata sul punto focale.' }) }, { required: ['image'], surfaces: null }),

  block('gallery', 'Galleria', {
    label: text('Etichetta verticale'),
    items: {
      title: 'Immagini', type: 'array', minItems: 3, maxItems: 8,
      items: { type: 'object', properties: { image: image('Immagine'), caption: text('Didascalia') }, required: ['image', 'caption'], additionalProperties: false },
    },
  }, { required: ['label', 'items'], surfaces: ['dark'] }),

  block('cta', 'CTA finale', {
    title: text('Titolo'),
    text: richInline('Testo'),
    buttons: buttons(1, 2),
    word: text('Parola verticale', { description: 'Parola grande sullo sfondo, solo desktop.' }),
  }, { required: ['title', 'buttons'], surfaces: ['dark', 'brand'] }),

  // Punti, passi, card e righe hanno gli stessi campi di base: un blocco solo, con l'aspetto da scegliere.
  block('items', 'Voci', {
    header: header(),
    layout: {
      title: 'Aspetto',
      enum: ['points', 'steps', 'cards', 'rows'],
      default: 'points',
      description: 'points: punti numerati. steps: passi che si accendono. cards: card con immagine. rows: righe con anteprima.',
    },
    columns: { title: 'Colonne', enum: [2, 3, 4], default: 3, description: 'Per points 2-4, per cards 2-3.', 'x-when': { layout: ['points', 'cards'] } },
    numbered: { title: 'Numerazione automatica', type: 'boolean', default: true, 'x-when': { layout: ['points'] } },
    items: {
      title: 'Voci', type: 'array', minItems: 1,
      items: {
        type: 'object',
        properties: {
          title: text('Titolo', { description: 'Il livello si deduce da quello della testata (o h2 se manca).' }),
          text: richInline('Testo'),
          link: link('Link', { description: 'Obbligatorio per cards e rows.', 'x-when': { layout: ['cards', 'rows'] } }),
          linkLabel: text('Etichetta del link', { description: 'Es. "Scopri il servizio".', 'x-when': { layout: ['cards'] } }),
          image: image('Immagine', { description: 'Obbligatoria per cards.', 'x-when': { layout: ['cards'] } }),
          previewImage: image('Anteprima', { description: 'Segue il cursore su desktop.', 'x-when': { layout: ['rows'] } }),
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  }, {
    required: ['layout', 'items'],
    allOf: [
      requireIn('cards', ['image', 'link']),
      requireIn('rows', ['link']),
      { if: { properties: { layout: { const: 'cards' } }, required: ['layout'] }, then: { properties: { columns: { enum: [2, 3] } } } },
    ],
  }),

  block('split', 'Testo + immagine', {
    eyebrow: text('Etichetta'),
    title: text('Titolo'),
    level: { title: 'Livello del titolo', enum: ['h2', 'h3', 'h4'], default: 'h2' },
    body: richBlock('Testo', { description: 'Uno o più paragrafi.' }),
    mediaSide: { title: 'Lato dell\'immagine', enum: ['left', 'right'], default: 'left' },
    mobileMedia: { title: 'Immagine su mobile', enum: ['top', 'bottom'], default: 'top', description: 'Sopra o sotto il testo quando le colonne si impilano.' },
    media: {
      title: 'Immagine',
      discriminator: { propertyName: 'type' },
      oneOf: [
        { type: 'object', properties: { type: { const: 'image' }, image: image('Immagine') }, required: ['type', 'image'], additionalProperties: false },
        { type: 'object', properties: { type: { const: 'quote' }, image: image('Immagine'), quote: text('Citazione'), author: text('Autore') }, required: ['type', 'image', 'quote', 'author'], additionalProperties: false },
      ],
    },
    extra: {
      title: 'Contenuto aggiuntivo',
      discriminator: { propertyName: 'type' },
      oneOf: [
        { type: 'object', properties: { type: { const: 'list' }, items: { title: 'Voci', type: 'array', minItems: 1, items: listItem } }, required: ['type', 'items'], additionalProperties: false },
        { type: 'object', properties: { type: { const: 'table' }, table: ref('specTable') }, required: ['type', 'table'], additionalProperties: false },
      ],
    },
    action: {
      title: 'Link con freccia',
      description: 'Sotto il testo e l\'elenco (es. "Noleggio mezzi").',
      type: 'object',
      properties: { label: text('Etichetta'), link: link('Link') },
      required: ['label', 'link'],
      additionalProperties: false,
    },
  }, { required: ['title', 'media'] }),

  block('zones', 'Zone servite', {
    header: header(),
    source: { title: 'Origine', enum: ['company', 'custom'], default: 'company', description: 'company: le zone dei dati azienda. custom: una lista propria.' },
    items: { title: 'Zone', type: 'array', minItems: 1, items: text('Zona'), 'x-when': { source: ['custom'] } },
  }, { required: ['source'], allOf: [{ if: { properties: { source: { const: 'custom' } }, required: ['source'] }, then: { required: ['items'] } }] }),

  block('faq', 'Domande frequenti', {
    header: header(),
    firstOpen: { title: 'Prima domanda aperta', type: 'boolean', default: false },
    items: {
      title: 'Domande', type: 'array', minItems: 1,
      items: { type: 'object', properties: { question: text('Domanda'), answer: richInline('Risposta') }, required: ['question', 'answer'], additionalProperties: false },
    },
  }, { required: ['items'] }),

  block('spec-table', 'Tabella dati', { header: header(), table: ref('specTable', { title: 'Tabella' }) }, { required: ['table'] }),

  block('form', 'Modulo', {
    header: header(),
    label: text('Nome del modulo', { description: 'Letto dagli screen reader (es. "Richiesta di preventivo").' }),
    fields: {
      title: 'Campi', type: 'array', minItems: 1,
      items: {
        type: 'object',
        properties: {
          name: { title: 'Nome interno', type: 'string', pattern: '^[a-z][a-z0-9_]*$', description: 'Chiave con cui il dato viene salvato.' },
          type: { title: 'Tipo', enum: ['text', 'email', 'tel', 'date', 'select', 'textarea', 'consent'] },
          label: richInline('Etichetta', { description: 'Per il consenso può contenere il link all\'informativa privacy.' }),
          placeholder: text('Segnaposto', { 'x-when': { type: ['text', 'email', 'tel', 'textarea'] } }),
          autocomplete: { title: 'Compilazione automatica', type: 'string', description: 'Valore HTML autocomplete (es. given-name, tel, email).' },
          required: { title: 'Obbligatorio', type: 'boolean', default: false },
          width: { title: 'Larghezza', enum: ['half', 'full'], default: 'half' },
          options: { title: 'Opzioni', type: 'array', minItems: 1, items: text('Opzione'), 'x-when': { type: ['select'] } },
        },
        required: ['name', 'type', 'label'],
        additionalProperties: false,
        if: { properties: { type: { const: 'select' } }, required: ['type'] },
        then: { required: ['options'] },
      },
    },
    submitLabel: text('Testo del pulsante'),
    successMessage: text('Messaggio di conferma'),
    note: richInline('Nota sotto il modulo'),
    aside: {
      title: 'Colonna laterale',
      type: 'object',
      properties: { items: { title: 'Contatti', type: 'array', minItems: 1, items: ref('contactItem') } },
      required: ['items'],
      additionalProperties: false,
    },
    delivery: {
      title: 'Invio',
      description: 'Le richieste vengono sempre salvate nel database e inviate per email.',
      type: 'object',
      properties: {
        recipients: { title: 'Destinatari', type: 'array', minItems: 1, items: { type: 'string', format: 'email' } },
        subject: { title: 'Oggetto dell\'email', type: 'string', minLength: 1 },
      },
      required: ['recipients', 'subject'],
      additionalProperties: false,
    },
  }, { required: ['label', 'fields', 'submitLabel', 'successMessage', 'delivery'] }),

  block('contacts', 'Contatti', {
    header: header(),
    items: { title: 'Contatti', type: 'array', minItems: 1, items: ref('contactItem') },
    map: {
      title: 'Mappa',
      type: 'object',
      properties: { query: { title: 'Indirizzo o luogo', type: 'string', minLength: 1 }, title: text('Titolo accessibile') },
      required: ['query', 'title'],
      additionalProperties: false,
    },
  }, { required: ['items'] }),

  block('rich-text', 'Testo ricco', {
    content: richBlock('Contenuto', { description: 'Titoli h2-h6, paragrafi, elenchi, citazioni, link.' }),
    width: { title: 'Larghezza', enum: ['narrow', 'wide'], default: 'narrow' },
  }, { required: ['content'] }),
];
