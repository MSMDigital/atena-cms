// Campi SEO/GEO del motore: organizzazione e crawling (dati del sito), fatti e FAQ (sito e pagine), tipo di contenuto e date (pagine).
// Alimentano render/seo.mjs (JSON-LD, Open Graph, hreflang) e la generazione di robots.txt e sitemap.xml: i template non li ridefiniscono.
import { text, textLong } from './common.mjs';

const MEDIA = '^(?!.*\\.\\.)(?!.*//)(?:[a-zA-Z0-9][a-zA-Z0-9_./-]*)?$';

export const ORG_TYPES = ['Organization', 'LocalBusiness', 'ProfessionalService', 'Corporation', 'NGO', 'EducationalOrganization', 'Store', 'Restaurant', 'Hotel', 'MedicalBusiness', 'LegalService', 'AccountingService', 'RealEstateAgent', 'TravelAgency', 'HealthAndBeautyBusiness', 'AutoRepair', 'MovingCompany'];
export const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export const facts = (title = 'Fatti chiave', description) => ({
  title,
  description: description ?? 'Informazioni brevi e verificabili (anno di fondazione, numeri, certificazioni, zone servite...) che le AI possono citare: una coppia etichetta/valore per riga. Finiscono nei dati strutturati, non nel testo della pagina.',
  type: 'array',
  maxItems: 30,
  items: { type: 'object', properties: { label: text('Etichetta'), value: text('Valore') }, required: ['label', 'value'], additionalProperties: false },
});

export const faq = {
  title: 'Domande frequenti della pagina (dati strutturati)',
  description: 'Diventano il markup FAQPage, insieme a quelle dei blocchi «Domande frequenti» della pagina. Google richiede che le stesse domande siano visibili nella pagina: mostrale con un blocco di domande frequenti.',
  type: 'array',
  maxItems: 30,
  items: { type: 'object', properties: { question: text('Domanda'), answer: textLong('Risposta') }, required: ['question', 'answer'], additionalProperties: false },
};

const str = (title, extra = {}) => ({ type: 'string', title, maxLength: 200, ...extra });

export const organization = {
  title: 'Organizzazione (dati strutturati)',
  description: 'Chi è l\'azienda, per Google e per le AI: genera il markup Organization (e il tipo di attività scelto) nella home, richiamato da tutte le pagine. Tutto facoltativo, ma più è completo, meglio è.',
  type: 'object',
  properties: {
    type: { title: 'Tipo di attività', enum: ORG_TYPES, default: 'Organization', description: 'Il tipo schema.org più vicino alla vostra attività.' },
    name: str('Nome', { minLength: 1 }),
    legalName: str('Ragione sociale'),
    description: textLong('Descrizione breve', { description: 'Due o tre frasi: cosa fate, per chi, dove.' }),
    slogan: text('Slogan'),
    logo: { title: 'Logo (file)', type: 'string', pattern: MEDIA, 'x-widget': 'media' },
    image: { title: 'Immagine rappresentativa (file)', type: 'string', pattern: MEDIA, 'x-widget': 'media' },
    foundingYear: { title: 'Anno di fondazione', type: 'integer', minimum: 1500, maximum: 2100 },
    founder: str('Titolare / fondatore'),
    email: str('Email', { format: 'email' }),
    phone: str('Telefono', { pattern: '^[+0-9 ().-]{5,30}$' }),
    address: {
      title: 'Indirizzo', type: 'object',
      properties: { street: str('Via e numero'), zip: str('CAP', { maxLength: 12 }), city: str('Località'), region: str('Regione / Cantone'), country: str('Paese (2 lettere)', { pattern: '^[A-Z]{2}$', maxLength: 2 }) },
      additionalProperties: false,
    },
    geo: { title: 'Coordinate', type: 'object', properties: { lat: { title: 'Latitudine', type: 'number', minimum: -90, maximum: 90 }, lng: { title: 'Longitudine', type: 'number', minimum: -180, maximum: 180 } }, required: ['lat', 'lng'], additionalProperties: false },
    hours: {
      title: 'Orari di apertura', type: 'array', maxItems: 14,
      items: { type: 'object', properties: { days: { title: 'Giorni', type: 'array', minItems: 1, uniqueItems: true, items: { enum: DAYS } }, opens: str('Dalle (HH:MM)', { pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', maxLength: 5 }), closes: str('Alle (HH:MM)', { pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', maxLength: 5 }) }, required: ['days', 'opens', 'closes'], additionalProperties: false },
    },
    areaServed: { title: 'Zone servite', description: 'Una località o regione per riga.', type: 'array', maxItems: 40, items: str('Zona') },
    languages: { title: 'Lingue parlate (codici)', description: 'Per esempio it, de, fr, en.', type: 'array', maxItems: 12, items: { type: 'string', pattern: '^[a-z]{2,3}$' } },
    social: { title: 'Profili social e pagine ufficiali', description: 'Indirizzi completi (https://…): LinkedIn, Instagram, Google Business, Wikipedia…', type: 'array', maxItems: 20, items: { type: 'string', pattern: '^https://[^\\s"<>]+$', maxLength: 300 } },
    priceRange: str('Fascia di prezzo', { maxLength: 40, description: 'Per esempio «CHF 50-120» o «$$».' }),
  },
  additionalProperties: false,
};

const BOT = { enum: ['allow', 'block'], default: 'allow' };
export const crawling = {
  title: 'Crawling (robots.txt)',
  description: 'Genera il file /robots.txt a ogni pubblicazione. Il robots.txt è una richiesta che i crawler rispettano di loro volontà; non protegge i contenuti.',
  type: 'object',
  properties: {
    mode: { title: 'Accesso dei motori di ricerca', enum: ['open', 'closed'], default: 'open', description: '«Chiuso» vieta tutto il sito a tutti i crawler (utile mentre il sito è in prova). Ricordati di riaprirlo prima di andare online.' },
    disallowPaths: { title: 'Percorsi esclusi per tutti i crawler', description: 'Uno per riga, che inizia con / (es. /riservato/ o /*.pdf$). Le pagine «non indicizzare» NON vanno qui: Google deve poterle aprire per leggere il «noindex».', type: 'array', maxItems: 50, items: { type: 'string', pattern: '^/[A-Za-z0-9/_.*$%-]{0,200}$' } },
    crawlDelay: { title: 'Pausa tra le richieste (secondi, facoltativa)', description: 'Non la rispetta Google; la usano alcuni altri crawler.', type: 'integer', minimum: 1, maximum: 60 },
    aiTraining: { ...BOT, title: 'AI: addestramento dei modelli', description: 'GPTBot, ClaudeBot, anthropic-ai, Google-Extended, Applebot-Extended, CCBot, Bytespider, Meta-ExternalAgent, cohere-ai.' },
    aiSearch: { ...BOT, title: 'AI: ricerca e citazioni', description: 'OAI-SearchBot, Claude-SearchBot, PerplexityBot: servono per essere citati nelle risposte di ChatGPT Search, Claude e Perplexity.' },
    aiUser: { ...BOT, title: 'AI: pagina aperta su richiesta di un utente', description: 'ChatGPT-User, Claude-User, Perplexity-User: quando una persona chiede all\'assistente di leggere un indirizzo.' },
    honorNoai: { title: 'Pagine «escludi dalle AI»: vieta anche nel robots.txt', type: 'boolean', default: true, description: 'Oltre al tag nella pagina, aggiunge un Disallow per quelle pagine ai crawler AI che hai lasciato consentiti.' },
  },
  additionalProperties: false,
};

export const geoExt = {
  summary: textLong('Descrizione per le AI', { description: 'Un paragrafo che spiega in modo neutro chi siete e cosa offrite. Se la descrizione dell\'organizzazione è vuota si usa questa.' }),
  facts: facts('Fatti chiave del sito'),
};

export const pageSeo = {
  contentType: { title: 'Tipo di pagina (dati strutturati)', enum: ['page', 'about', 'contact', 'service', 'article', 'collection'], default: 'page', description: 'Cambia il markup: pagina generica, chi siamo, contatti, servizio, articolo o elenco.' },
  datePublished: { title: 'Data di pubblicazione', type: 'string', format: 'date', description: 'Per gli articoli. Formato AAAA-MM-GG.' },
  dateModified: { title: 'Ultima modifica sostanziale', type: 'string', format: 'date', description: 'Va aggiornata a mano quando il contenuto cambia davvero; compare anche come «lastmod» nella sitemap.' },
  author: { title: 'Autore', type: 'string', maxLength: 120, 'x-widget': 'author', description: 'Uno degli utenti del CMS: per gli articoli e le pagine firmate.' },
  facts: facts('Fatti chiave della pagina'),
  faq,
};
