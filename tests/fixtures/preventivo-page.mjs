// Una pagina «preventivo» con un modulo che usa ogni tipo di campo (testo, telefono, email, scelta, data, testo lungo, consenso).
// Il modulo di contatto di starter ha solo nome, email, messaggio e consenso: per provare tutto il resto serve questa pagina,
// usata dai test (tests/forms.test.mjs) e dalle prove nel browser (scripts/e2e-forms.mjs, scripts/probe-security.mjs).
export const preventivo = {
  key: 'preventivo', status: 'published', slug: { it: 'preventivo' }, name: { it: 'Preventivo' }, title: { it: 'Preventivo' }, description: { it: 'Richiedi un preventivo.' },
  blocks: [{
    id: 'preventivo-1-form', type: 'form', surface: 'light', label: { it: 'Richiesta di preventivo' },
    fields: [
      { name: 'nome', type: 'text', label: { it: 'Nome' }, required: true, autocomplete: 'given-name' },
      { name: 'cognome', type: 'text', label: { it: 'Cognome' }, required: true, autocomplete: 'family-name' },
      { name: 'telefono', type: 'tel', label: { it: 'Telefono' }, required: true, autocomplete: 'tel' },
      { name: 'email', type: 'email', label: { it: 'Email' }, required: true, autocomplete: 'email' },
      { name: 'citta', type: 'text', label: { it: 'Città di partenza' }, required: true, placeholder: { it: 'Es. Lugano' }, autocomplete: 'address-level2', width: 'full' },
      { name: 'servizio', type: 'select', label: { it: 'Servizio' }, required: false, options: [{ it: 'Trasloco privato' }, { it: 'Trasloco aziendale' }, { it: 'Trasloco internazionale' }, { it: 'Deposito mobili' }, { it: 'Sgombero' }, { it: 'Noleggio lift o camion' }] },
      { name: 'data', type: 'date', label: { it: 'Data indicativa' }, required: false },
      { name: 'messaggio', type: 'textarea', label: { it: 'Messaggio' }, required: false, placeholder: { it: 'Es. appartamento di 3,5 locali al 4° piano senza ascensore' }, width: 'full' },
      { name: 'privacy', type: 'consent', label: { it: 'Ho letto l\'<a href="page:privacy">informativa sulla privacy</a> e acconsento al trattamento dei miei dati per ricevere il preventivo.' }, required: true, width: 'full' },
    ],
    submitLabel: { it: 'Invia la richiesta' }, successMessage: { it: 'Grazie! Abbiamo ricevuto la richiesta: vi ricontattiamo al più presto.' },
    delivery: { recipients: ['info@esempio.ch'], subject: 'Richiesta di preventivo' },
  }],
};

// Scrive la pagina nel database, pubblicata (come se fosse un contenuto del sito).
export async function putPreventivo(query, { published = true } = {}) {
  const json = JSON.stringify(preventivo);
  await query('INSERT INTO docs (kind, doc_key, draft, published) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE draft = VALUES(draft), published = VALUES(published), deleted_at = NULL', ['page', preventivo.key, json, published ? json : null]);
}
