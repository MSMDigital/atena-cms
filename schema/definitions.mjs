// Schemi dei documenti: pagina, blocchi condivisi e dati del sito. Il MOTORE definisce lo scheletro (chiave, stato, slug, SEO, lingue, consenso...);
// il TEMPLATE porta i blocchi (schema/blocks.json) e i campi in più dei dati del sito e delle pagine (schema/site.json, schema/page.json).
// Solo dati: nessuna dipendenza, quindi importabile anche nel browser (il server manda gli schemi già composti all'editor).
import { BASE, LOCALES, TAG_PATTERN, common, ref, text, textLong, image, block, code } from './common.mjs';
import { organization, crawling, geoExt, pageSeo } from './seo.mjs';
import { buildBlogSchemas, siteBlog, siteAuthors, supportsBlog } from './blog.mjs';

// Testi fissi che il MOTORE stesso usa (consenso alla mappa, preferenze cookie): ogni template deve fornirli nei contenuti.
export const ENGINE_STRING_KEYS = ['mapConsentText', 'mapShowButton', 'mapManageButton', 'mapOpenLink', 'cookiePreferences'];
// Tipi di blocco che appartengono al motore: un template non può definirne uno con lo stesso nome (lib/template-install.mjs lo controlla).
export const RESERVED_BLOCK_TYPES = ['shared', 'html'];

export function buildSchemas(tpl) {
  // "Codice HTML": un blocco del motore (come "shared"), disponibile in ogni template senza che debba definirlo. Solo un admin lo scrive
  // o lo cambia (lib/content-guard.mjs) e il suo contenuto non passa dalla sanificazione dei testi: va inserito così com'è nella pagina.
  const htmlBlock = block('html', 'Codice HTML', {
    html: code('Codice HTML', { minLength: 1, description: 'Incollato così com\'è nella pagina: può contenere <script> e <style> (per un widget, una mappa o un contenuto di terzi). Solo un admin lo scrive o lo cambia.' }),
  }, { required: ['html'] });
  const blocks = [...tpl.schema.blocks.blocks, htmlBlock];
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

  // Header e footer scorporati (facoltativi, solo se il template porta schema/header.json e schema/footer.json): ogni documento è una mappa
  // chiave → header (o footer); le pagine scelgono quale usare con i campi "header" e "footer".
  const layoutMap = (id, title, one) => {
    if (!one || one.type !== 'object' || !one.properties) return null;
    const { $id, ...inner } = one;
    return { $id: `${BASE}${id}.json`, title, type: 'object', 'x-item': title.toLowerCase(), propertyNames: { pattern: '^[a-z][a-z0-9-]*$' }, additionalProperties: inner };
  };
  const headers = layoutMap('headers', 'Header', tpl.schema.header);
  const footers = layoutMap('footers', 'Footer', tpl.schema.footer);
  const layoutField = (kind, label) => ({ title: label, type: 'string', pattern: '^(none|[a-z][a-z0-9-]*)$', 'x-widget': `layout-${kind}`, description: `Quale ${label.toLowerCase()} mostra questa pagina. Vuoto: quello chiamato «default» (o il primo). «Nessuno»: la pagina non ha ${label.toLowerCase()}.` });

  const page = {
    $id: `${BASE}page.json`,
    title: 'Pagina',
    type: 'object',
    properties: {
      ...(pageExt.properties ?? {}),         // prima: i campi del motore, definiti dopo, hanno sempre la precedenza
      key: { ...pageKey, title: 'Chiave', description: 'Identificatore stabile, usato dai link. Non cambia se cambia lo slug.' },
      status: { title: 'Stato', enum: ['draft', 'published'], default: 'draft' },
      lang: { title: 'Lingua dei testi', enum: LOCALES, description: 'La lingua in cui sono scritti i testi di questa pagina. Vuota: la lingua di base del sito.' },
      translationOf: { ...pageKey, title: 'Traduzione di', description: 'Se questa pagina è la versione in un\'altra lingua di una pagina, la chiave della pagina di base.' },
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
      ogImage: image('Immagine di condivisione', { description: 'Anteprima nei social e nelle risposte delle AI. Vuota: si usa quella predefinita di Dati del sito → SEO.' }),
      ...pageSeo,
      ...(headers ? { header: layoutField('header', 'Header') } : {}),
      ...(footers ? { footer: layoutField('footer', 'Footer') } : {}),
      ogType: { title: 'Tipo di contenuto (Open Graph)', enum: ['website', 'article'], default: 'website', description: 'Come si presenta quando viene condivisa (social, anteprime): pagina generica o articolo/approfondimento.' },
      noindex: { title: 'Non indicizzare (SEO)', type: 'boolean', default: false, description: 'Chiede ai motori di ricerca di non mostrare la pagina.' },
      protected: { title: 'Richiedi una password', type: 'boolean', default: false, description: 'La pagina pubblicata mostra una schermata con password invece del contenuto; si imposta la password qui sotto, nell\'editor della pagina.' },
      focusKeyword: { title: 'Parola chiave principale', type: 'string', maxLength: 80, description: 'La ricerca per cui vuoi essere trovato. Il semaforo SEO controlla che compaia nel titolo, nella descrizione e nell\'indirizzo.' },
      geoSummary: textLong('Riassunto per le AI', { description: 'Due o tre frasi neutre che dicono di cosa parla la pagina: le AI le possono citare. Finisce nei dati strutturati (abstract), non nel testo.' }),
      noai: { title: 'Escludi dai motori di intelligenza artificiale (GEO)', type: 'boolean', default: false, description: 'Chiede a ChatGPT, Perplexity e simili di non usare la pagina per rispondere. È un segnale: il crawler deve rispettarlo, non è una garanzia.' },
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


  // Blog (solo se il template ha il blocco «posts-list»): articoli e categorie.
  const blog = supportsBlog(tpl) ? buildBlogSchemas(blockUnion) : null;

  const stringKeys = [...ENGINE_STRING_KEYS, ...Object.keys(siteExt.strings?.properties ?? {})];
  const strings = {
    title: 'Testi fissi del sito',
    description: 'Micro-testi dell\'interfaccia, da tradurre per lingua.',
    type: 'object',
    properties: { ...Object.fromEntries(ENGINE_STRING_KEYS.map((k) => [k, text(k)])), ...(siteExt.strings?.properties ?? {}) },
    required: [...ENGINE_STRING_KEYS, ...(siteExt.strings?.required ?? Object.keys(siteExt.strings?.properties ?? {}))],   // il template può dichiarare facoltativi alcuni testi (con un valore di riserva nel codice)
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
      locales: { type: 'object', description: 'enabled: le lingue online (menu lingua e percorsi). tags: valore di html lang e og:locale.', properties: { default: { enum: LOCALES }, base: { enum: LOCALES }, enabled: { type: 'array', items: { enum: LOCALES }, minItems: 1, uniqueItems: true, 'x-item': 'lingua' }, tags: { type: 'object', propertyNames: { enum: LOCALES }, additionalProperties: { type: 'string', pattern: TAG_PATTERN } } }, required: ['default', 'enabled', 'tags'], additionalProperties: false },
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
      geo: {
        title: 'Generative Engine Optimization (GEO)',
        description: 'Come si presenta il sito ai motori di intelligenza artificiale (ChatGPT, Perplexity...), oltre ai tag di ogni pagina.',
        type: 'object',
        properties: {
          ...geoExt,
          llmsText: code('Testo del file llms.txt', { minLength: 0, description: 'Pubblicato così com\'è su /llms.txt: una guida in markdown su cosa trovano nel sito, pensata per i motori di intelligenza artificiale. Vuoto: il file non si pubblica. Solo un admin lo scrive.' }),
        },
        additionalProperties: false,
      },
      organization,
      crawling,
      ...(blog ? { blog: siteBlog, authors: siteAuthors } : {}),
      tracking: {
        title: 'Analytics e script esterni',
        description: 'Codice di terzi (Google Analytics, Google Tag Manager, Meta Pixel, chat, recensioni...), uguale su ogni pagina. Solo un admin lo scrive: non passa dalla sanificazione dei testi.',
        type: 'object',
        properties: {
          css: code('CSS personalizzato', { minLength: 0, description: 'Regole CSS (senza il tag <style>): si aggiungono per ultime, dopo quelle del template, e possono sovrascriverle.' }),
          headCode: code('Codice nella testa della pagina (<head>)', { minLength: 0, description: 'Per Google Analytics, Google Tag Manager, Meta Pixel e simili: il codice così come lo fornisce il servizio (compresi i tag <script>). Va il più in alto possibile nella pagina.' }),
          bodyStartCode: code('Codice subito dopo <body>', { minLength: 0, description: 'Per la parte "noscript" di Google Tag Manager e servizi simili che la richiedono.' }),
          bodyEndCode: code('Codice a fine pagina', { minLength: 0, description: 'Per widget di chat, recensioni e altri script che possono caricare per ultimi, senza rallentare la pagina.' }),
        },
        additionalProperties: false,
      },
      strings,
    },
    required: ['siteUrl', 'locales', 'seo', 'strings', ...(siteExt.required ?? [])],
    additionalProperties: false,
  };

  return { blocks, page, shared, site, headers, footers, post: blog?.post ?? null, categories: blog?.categories ?? null, tags: blog?.tags ?? null, common, allSchemas: [common, ...blocks, page, shared, site, ...(headers ? [headers] : []), ...(footers ? [footers] : []), ...(blog ? [blog.post, blog.categories, blog.tags] : [])] };
}
