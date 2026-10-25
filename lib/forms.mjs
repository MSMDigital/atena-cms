// Ricezione delle richieste dai moduli del sito pubblicato.
// Il modulo si cerca sempre nella versione PUBBLICATA (un modulo in bozza non riceve nulla) e si valida contro i campi che definisce:
// del corpo della richiesta si tengono solo i campi previsti, e destinatari e oggetto vengono dal modulo, mai dal client.
// La richiesta si salva sempre prima; l'email parte dopo, e se fallisce la richiesta resta nell'elenco con l'errore.
import crypto from 'node:crypto';
import { query, one, withLock } from './db.mjs';
import { loadEnv } from './env.mjs';
import { sendSubmissionMail } from './mail.mjs';
import { formRecipients } from './settings.mjs';

export const MAX_BODY = 32 * 1024;
const MIN_FILL_MS = 1200;            // un modulo compilato e inviato in meno di così non l'ha compilato una persona
const PER_IP_HOUR = 5;               // richieste per indirizzo all'ora (solo dietro proxy fidato)
const PER_FORM_HOUR = 60;            // tetto complessivo per modulo all'ora: se qualcuno inonda il modulo, la casella non si riempie
const DUPLICATE_MS = 10 * 60_000;    // stessa richiesta identica: doppio clic o ripetizione, si accetta una volta sola

// ---- ricerca del modulo -------------------------------------------------------------------------------------------------

// Moduli raggiungibili nel sito pubblicato: { id -> { block, pageKey } }. Funzione pura sui dati assemblati (loadData('published')).
export function collectForms({ pages = [], shared = {} }) {
  const out = new Map();
  for (const p of pages) {
    if (p.status !== 'published') continue;
    for (const b of p.blocks ?? []) {
      const block = b.type === 'shared' ? (Object.hasOwn(shared, b.ref) ? shared[b.ref] : null) : b;
      if (block?.type === 'form' && block.id && !out.has(block.id)) out.set(block.id, { block, pageKey: p.key });
    }
  }
  return out;
}

let cache = { at: null, forms: new Map() };
// Si ricostruisce solo quando cambia l'ultima pubblicazione riuscita (una query leggera per richiesta).
async function publishedForms() {
  const last = await one("SELECT MAX(id) AS id FROM publications WHERE status = 'ok'");
  const stamp = String(last?.id ?? 'none');
  if (cache.at === stamp) return cache.forms;
  const docs = await query('SELECT kind, doc_key, published FROM docs WHERE published IS NOT NULL');
  const data = { pages: [], shared: {} };
  for (const d of docs) {
    let v; try { v = JSON.parse(d.published); } catch { continue; }
    if (d.kind === 'page') data.pages.push(v); else if (d.kind === 'shared') data.shared = v;
  }
  cache = { at: stamp, forms: collectForms(data) };
  return cache.forms;
}
// Definizione (pubblicata) di un modulo, per mostrare le richieste con le etichette dei campi.
export async function formDefinition(id) { return (await publishedForms()).get(id) ?? null; }
export const resetFormsCache = () => { cache = { at: null, forms: new Map() }; };

// ---- validazione --------------------------------------------------------------------------------------------------------

// Toglie i caratteri di controllo (a capo compresi, tranne nei testi lunghi) e i separatori di riga Unicode.
const stripControl = (s, keepNewline) => Array.from(s).filter((c) => { const n = c.charCodeAt(0); return keepNewline && n === 10 ? true : n > 31 && n !== 127 && n !== 0x2028 && n !== 0x2029; }).join('');
// Tutto lineare (niente regex con spazi seguiti da a capo, che su stringhe di soli spazi sono quadratiche).
const clean = (s, multiline) => {
  let t = String(s).replace(/\t/g, ' ').replace(/\r\n?/g, '\n');
  t = multiline ? t.split('\n').map((l) => l.trimEnd()).join('\n') : t.replace(/\n+/g, ' ');
  return stripControl(t, multiline).trim();
};
const EMAIL = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]{2,}$/;

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Risultato: { ok, values (solo i campi previsti e compilati), consent, errors: { nome: messaggio } }.
export function validateSubmission(block, input, locales = ['it']) {
  const values = {}; const errors = {}; let consent = false;
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const f of block.fields) {
    const raw = src[f.name];
    if (f.type === 'consent') {
      const given = raw === true || raw === 'true' || raw === 'on';
      if (given) consent = true;
      if (f.required && !given) errors[f.name] = 'Serve il consenso.';
      else if (given) values[f.name] = true;
      continue;
    }
    if (raw !== undefined && raw !== null && typeof raw !== 'string') { errors[f.name] = 'Valore non valido.'; continue; }
    if (typeof raw === 'string' && raw.length > 20_000) { errors[f.name] = 'Testo troppo lungo.'; continue; }   // prima di qualunque elaborazione
    const v = raw == null ? '' : clean(raw, f.type === 'textarea');
    if (v === '') { if (f.required) errors[f.name] = 'Campo obbligatorio.'; continue; }
    const max = f.type === 'textarea' ? 5000 : f.type === 'email' ? 254 : 200;
    if (v.length > max) { errors[f.name] = `Massimo ${max} caratteri.`; continue; }
    if (f.type === 'email' && !EMAIL.test(v)) { errors[f.name] = 'Indirizzo email non valido.'; continue; }
    if (f.type === 'tel' && !(/^[+0-9 ()./-]{6,30}$/.test(v) && (v.match(/\d/g) ?? []).length >= 6)) { errors[f.name] = 'Numero di telefono non valido.'; continue; }
    if (f.type === 'date' && !validDate(v)) { errors[f.name] = 'Data non valida.'; continue; }
    if (f.type === 'select' && !f.options.some((op) => locales.some((l) => op[l] === v))) { errors[f.name] = 'Scelta non valida.'; continue; }
    values[f.name] = v;
  }
  return { ok: Object.keys(errors).length === 0, values, consent, errors };
}

// ---- origine, indirizzo, corpo -------------------------------------------------------------------------------------------

// Origini da cui il browser può inviare: lo stesso host dell'app, l'indirizzo pubblico del sito (APP_ORIGIN o FORM_ALLOWED_ORIGINS, separati da virgola).
export function allowedOrigins(host) {
  loadEnv();
  const set = new Set();
  for (const o of [process.env.APP_ORIGIN, ...(process.env.FORM_ALLOWED_ORIGINS ?? '').split(',')]) {
    try { if (o?.trim()) set.add(new URL(o.trim()).origin); } catch { /* voce non valida: ignorata */ }
  }
  return { set, host };
}
export function isAllowedOrigin(origin, host) {
  if (!origin) return true;                       // richiesta senza Origin (non da browser): non è un rischio CSRF, non c'è sessione da abusare
  let u; try { u = new URL(origin); } catch { return false; }
  const { set } = allowedOrigins(host);
  return set.has(u.origin) || (!!host && u.host === host);
}

export function ipFrom(headers) {
  loadEnv();
  if (process.env.TRUST_PROXY !== '1') return null;                  // senza proxy fidato l'intestazione la scrive chiunque
  // Con un proxy fidato l'ultimo valore è quello scritto dal proxy (i precedenti li può inventare il client).
  const ip = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return ip && /^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : null;
}
// Senza un sale dedicato non si conserva nemmeno l'impronta (non si riusa la password del database).
const hashIp = (ip) => { const salt = process.env.IP_HASH_SECRET || process.env.SETTINGS_SECRET; return ip && salt ? crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex') : null; };

// Legge il corpo fermandosi al limite (non si carica in memoria una richiesta gigante).
export async function readBodyLimited(request, max = MAX_BODY) {
  const declared = +request.headers.get('content-length');
  if (declared > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ---- gestione della richiesta -----------------------------------------------------------------------------------------------

const reply = (status, json) => ({ status, json });

// `body` è il testo del corpo (già limitato). Restituisce { status, json }; non lancia per input sbagliato.
export async function handleSubmission({ id, body, headers, notify = true }) {
  loadEnv();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id ?? '')) return reply(404, { ok: false, error: 'Modulo non trovato.' });
  if (!isAllowedOrigin(headers.get('origin'), headers.get('host'))) return reply(403, { ok: false, error: 'Richiesta non consentita.' });
  if (!/^application\/json\b/i.test(headers.get('content-type') ?? '')) return reply(415, { ok: false, error: 'Formato non supportato.' });
  if (body === null) return reply(413, { ok: false, error: 'Richiesta troppo grande.' });
  let input; try { input = JSON.parse(body); } catch { return reply(400, { ok: false, error: 'Richiesta non valida.' }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, { ok: false, error: 'Richiesta non valida.' });

  const found = (await publishedForms()).get(id);
  if (!found) return reply(404, { ok: false, error: 'Modulo non trovato.' });

  // Automatismi: esca nascosta compilata, o inviato troppo in fretta. Si risponde "ok" senza salvare, così il bot non impara nulla.
  if (typeof input.website === 'string' && input.website.trim() !== '') return reply(200, { ok: true });
  if (typeof input._t !== 'number' || !Number.isFinite(input._t)) return reply(400, { ok: false, error: 'Richiesta non valida.' });
  if (input._t < MIN_FILL_MS) return reply(200, { ok: true });

  const site = (await one("SELECT published FROM docs WHERE kind = 'site'"))?.published;
  let siteData = null; try { siteData = site ? JSON.parse(site) : null; } catch { /* sito non leggibile: si usano i valori predefiniti */ }
  const enabled = siteData?.locales?.enabled ?? ['it'];
  const locale = typeof input.locale === 'string' && enabled.includes(input.locale) ? input.locale : (siteData?.locales?.default ?? 'it');

  const result = validateSubmission(found.block, input.fields, enabled);
  if (!result.ok) return reply(422, { ok: false, error: 'Controlla i campi.', errors: result.errors });

  const ipHash = hashIp(ipFrom(headers));
  const data = JSON.stringify(result.values);
  const recipients = (await formRecipients(found.block)).join(', ').slice(0, 500);
  // "Conta e inserisci" sotto lock: con richieste parallele il tetto non si supera.
  const locked = await withLock(`f:${crypto.createHash('sha1').update(id).digest('hex').slice(0, 24)}`, async () => {
    const since = new Date(Date.now() - 3600_000);
    if (ipHash && (await one('SELECT COUNT(*) AS n FROM form_submissions WHERE ip_hash = ? AND created_at > ?', [ipHash, since])).n >= PER_IP_HOUR) return { status: 429 };
    if ((await one('SELECT COUNT(*) AS n FROM form_submissions WHERE block_id = ? AND created_at > ?', [id, since])).n >= PER_FORM_HOUR) return { status: 429 };
    const dup = await one('SELECT id FROM form_submissions WHERE block_id = ? AND data = ? AND created_at > ? LIMIT 1', [id, data, new Date(Date.now() - DUPLICATE_MS)]);
    if (dup) return { status: 200 };
    const r = await query('INSERT INTO form_submissions (block_id, page_key, locale, data, consent, ip_hash, recipients) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, found.pageKey, locale, data, result.consent ? 1 : 0, ipHash, recipients]);
    return { status: 200, insertId: Number(r.insertId) };
  });
  if (!locked.ok) return reply(503, { ok: false, error: 'Servizio occupato: riprova tra poco.' });
  if (locked.value.status === 429) return reply(429, { ok: false, error: 'Troppe richieste: riprova più tardi.' });
  if (locked.value.insertId && notify) void notifySubmission(locked.value.insertId).catch((e) => console.error('invio email richiesta', locked.value.insertId, e?.message));
  return reply(200, { ok: true });
}

// Invia (o rinvia) l'email di una richiesta e registra l'esito. Non lancia: l'errore finisce in mail_error.
export async function notifySubmission(submissionId, transport) {
  const row = await one('SELECT * FROM form_submissions WHERE id = ?', [submissionId]);
  if (!row) return { ok: false, error: 'Richiesta non trovata.' };
  const found = (await publishedForms()).get(row.block_id);
  let status = 'failed'; let error = null;
  if (!found) error = 'Il modulo non è più pubblicato: destinatari non disponibili.';
  else {
    const r = await sendSubmissionMail({ block: found.block, values: JSON.parse(row.data), submission: row, transport });
    status = r.status; error = r.error ?? null;
  }
  await query('UPDATE form_submissions SET mail_status = ?, mail_error = ?, mailed_at = ? WHERE id = ?', [status, error ? String(error).slice(0, 500) : null, status === 'sent' ? new Date() : null, submissionId]);
  return { ok: status === 'sent', status, error };
}

// ---- elenco per l'admin ----------------------------------------------------------------------------------------------------

export async function newSubmissionCount() {
  return (await one("SELECT COUNT(*) AS n FROM form_submissions WHERE status = 'new'")).n;
}
