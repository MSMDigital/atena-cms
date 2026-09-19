// Schemi dei documenti: pagina, blocchi condivisi e dati del sito. Il MOTORE definisce lo scheletro (chiave, stato, slug, SEO, lingue, consenso...);
// il TEMPLATE porta i blocchi (schema/blocks.json) e i campi in più dei dati del sito e delle pagine (schema/site.json, schema/page.json).
// Solo dati: nessuna dipendenza, quindi importabile anche nel browser (il server manda gli schemi già composti all'editor).
import { BASE, LOCALES, common, ref, text, textLong, image } from './common.mjs';

// Testi fissi che il MOTORE stesso usa (consenso alla mappa, preferenze cookie): ogni template deve fornirli nei contenuti.
export const ENGINE_STRING_KEYS = ['mapConsentText', 'mapShowButton', 'mapManageButton', 'mapOpenLink', 'cookiePreferences'];

export function buildSchemas(tpl) {
  const blocks = tpl.schema.blocks.blocks;
  const pageExt = tpl.schema.page ?? {};
  const siteExt = tpl.schema.site ?? {};
  const pageKey = ref('pageKey');
  const blockUnion = {
    discriminator: { propertyName: 'type' },
    oneOf: [
      ...blocks.map((b) => ({ $ref: b.$id })),
      // Riferimento a un blocco condiviso (es. il nastro, identico in tutte le pagine): si modifica una volta sola.
      { type: 'object', title: 'Blocco condiviso', properties: { id: ref('blockId'), type: { const: 'shared' }, ref: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' }, visible: { type: 'boolean', default: true } }, required: ['id', 'type', 'ref'], additionalProperties: false },
    ],
  };

  const page = {
    $id: `${BASE}page.json`,
    title: 'Pagina',
    type: 'object',
    properties: {
      ...(pageExt.properties ?? {}),         // prima: i campi del motore, definiti dopo, hanno sempre la precedenza
      key: { ...pageKey, title: 'Chiave', description: 'Identificatore stabile, usato dai link. Non cambia se cambia lo slug.' },
      status: { title: 'Stato', enum: ['draft', 'published'], default: 'draft' },
      parent: { title: 'Pagina padre', description: 'Per le briciole di pane. Vuoto = direttamente sotto la home.', anyOf: [pageKey, { type: 'null' }] },
      slug: {
        title: 'Indirizzo',
        type: 'object',
        description: 'Un indirizzo per lingua. La home ha indirizzo vuoto.',
        properties: Object.fromEntries(LOCALES.map((l) => [l, { type: 'string', pattern: '^[a-z0-9-]*$' }])),
        required: ['it'],
        additionalProperties: false,
      },
      name: text('Nome breve', { description: 'Per menu e briciole di pane.' }),
      title: text('Titolo SEO', { description: 'Il tag <title>.' }),
      description: textLong('Descrizione SEO'),
      ogImage: image('Immagine di condivisione'),
      noindex: { title: 'Non indicizzare', type: 'boolean', default: false },
      blocks: { title: 'Blocchi', type: 'array', items: blockUnion },
    },
    required: ['key', 'status', 'slug', 'name', 'title', 'description', 'blocks'],
    additionalProperties: false,
  };

  // Blocchi condivisi: chiave -> blocco (non ammesso un blocco `shared` dentro un altro).
  const shared = {
    $id: `${BASE}shared.json`,
    title: 'Blocchi condivisi',
    type: 'object',
    propertyNames: { pattern: '^[a-z][a-z0-9-]*$' },
    additionalProperties: { discriminator: { propertyName: 'type' }, oneOf: blocks.map((b) => ({ $ref: b.$id })) },
  };


  const stringKeys = [...ENGINE_STRING_KEYS, ...Object.keys(siteExt.strings?.properties ?? {})];
  const strings = {
    title: 'Testi fissi del sito',
    description: 'Micro-testi dell\'interfaccia, da tradurre per lingua.',
    type: 'object',
    properties: { ...Object.fromEntries(ENGINE_STRING_KEYS.map((k) => [k, text(k)])), ...(siteExt.strings?.properties ?? {}) },
    required: stringKeys,
    additionalProperties: false,
  };
  const site = {
    $id: `${BASE}site.json`,
    title: 'Dati del sito',
    type: 'object',
    properties: {
      ...(siteExt.properties ?? {}),          // prima: i campi del motore, definiti dopo, hanno sempre la precedenza
      siteUrl: { title: 'Indirizzo del sito', type: 'string', format: 'uri', pattern: '^https?://[^\\s"<>]+[^/\\s"<>]$', description: 'Senza barra finale. Base di canonical, hreflang e JSON-LD.' },
      formsEndpoint: { title: 'Indirizzo che riceve le richieste dei moduli', type: 'string', pattern: '^(/[a-z0-9/_-]*|https://[^\\s]+)$', default: '/api/forms', description: 'Di norma non si cambia: /api/forms, sullo stesso dominio del sito. Serve solo se le richieste arrivano a un altro indirizzo (https://...).' },
      locales: { type: 'object', description: 'enabled: le lingue online (menu lingua e percorsi). tags: valore di html lang e og:locale.', properties: { default: { enum: LOCALES }, enabled: { type: 'array', items: { enum: LOCALES }, minItems: 1, uniqueItems: true }, tags: { type: 'object', properties: Object.fromEntries(LOCALES.map((l) => [l, { type: 'string', pattern: '^[a-z]{2}-[A-Z]{2}$' }])), required: LOCALES, additionalProperties: false } }, required: ['default', 'enabled', 'tags'], additionalProperties: false },
      consent: {
        title: 'Consenso ai contenuti di terzi',
        description: 'Come si chiede il consenso prima di caricare contenuti di terzi (oggi la mappa di Google).',
        type: 'object',
        properties: {
          provider: { title: 'Gestione del consenso', enum: ['builtin', 'iubenda'], default: 'builtin', description: 'Integrata: la mappa compare dopo un clic su "Mostra la mappa", senza cookie né servizi esterni. iubenda: banner e blocco preventivo gestiti da iubenda (serve un account iubenda con il vostro sito).' },
          iubendaSiteId: { title: 'iubenda: ID del sito (siteId)', type: 'string', pattern: '^[0-9]{1,12}$', 'x-when': { provider: ['iubenda'] }, description: 'Si trova nel codice di installazione che iubenda fornisce. Solo numeri: il codice lo compone il sito.' },
          iubendaCookiePolicyId: { title: 'iubenda: ID della cookie policy (cookiePolicyId)', type: 'string', pattern: '^[0-9]{1,12}$', 'x-when': { provider: ['iubenda'] }, description: 'Idem: nel codice di installazione di iubenda.' },
        },
        required: ['provider'],
        if: { properties: { provider: { const: 'iubenda' } }, required: ['provider'] },
        then: { required: ['iubendaSiteId', 'iubendaCookiePolicyId'] },
        additionalProperties: false,
      },
      seo: { type: 'object', properties: { siteName: { type: 'string', minLength: 1 }, favicon: { title: 'Favicon (file)', type: 'string', pattern: '^(?!.*\\.\\.)(?!.*//)(?:[a-zA-Z0-9][a-zA-Z0-9_./-]*)?$', 'x-widget': 'media', description: 'Immagine della libreria.' }, defaultOgImage: image('Immagine di condivisione predefinita') }, required: ['siteName', 'favicon'], additionalProperties: false },
      strings,
    },
    required: ['siteUrl', 'locales', 'seo', 'strings', ...(siteExt.required ?? [])],
    additionalProperties: false,
  };

  return { blocks, page, shared, site, common, allSchemas: [common, ...blocks, page, shared, site] };
}
