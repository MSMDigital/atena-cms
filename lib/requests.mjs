// Elenco e gestione delle richieste ricevute dai moduli (per l'admin).
import { query, one } from './db.mjs';
import { formDefinition } from './forms.mjs';
import { textOf } from '../render/translations.mjs';

export const STATUSES = ['new', 'read', 'archived'];
export const MAIL_LABEL = { pending: 'In invio', sent: 'Inviata', failed: 'Non inviata', skipped: 'Non configurata' };

const parse = (r) => { let data = {}; try { data = JSON.parse(r.data); } catch { /* dati illeggibili: si mostra vuoto */ } return { ...r, data }; };

export async function submissionCounts() {
  const rows = await query('SELECT status, COUNT(*) AS n FROM form_submissions GROUP BY status');
  const out = { new: 0, read: 0, archived: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

// Richieste ricevute negli ultimi `days` giorni, di qualsiasi stato.
export async function recentSubmissionCount(days = 7) {
  const r = await one('SELECT COUNT(*) AS n FROM form_submissions WHERE created_at > ?', [new Date(Date.now() - days * 864e5)]);
  return Number(r?.n ?? 0);
}

export async function listSubmissions({ status, limit = 50, offset = 0 } = {}) {
  const where = STATUSES.includes(status) ? 'WHERE status = ?' : '';
  const rows = await query(`SELECT * FROM form_submissions ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...(where ? [status] : []), limit, offset]);
  return rows.map(parse);
}

// Una richiesta con i campi nell'ordine e con le etichette del modulo (se è ancora pubblicato).
export async function getSubmission(id) {
  const r = await one('SELECT * FROM form_submissions WHERE id = ?', [id]);
  if (!r) return null;
  const sub = parse(r);
  const def = await formDefinition(r.block_id);
  const strip = (h) => String(h ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').trim();
  const known = new Set();
  const fields = [];
  for (const f of def?.block.fields ?? []) {
    known.add(f.name);
    if (f.type === 'consent') { if (sub.data[f.name]) fields.push({ name: f.name, label: 'Consenso', value: strip(textOf(f.label, 'it')), long: true }); continue; }
    if (sub.data[f.name] !== undefined) fields.push({ name: f.name, label: strip(textOf(f.label, 'it') || f.name), value: String(sub.data[f.name]), long: f.type === 'textarea' });
  }
  for (const [k, v] of Object.entries(sub.data)) if (!known.has(k)) fields.push({ name: k, label: k, value: String(v), long: false });   // campo di un modulo poi modificato
  return { ...sub, fields, formLabel: def ? strip(textOf(def.block.label, 'it')) : sub.block_id };
}

export async function setSubmissionStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error('Stato non valido');
  return (await query('UPDATE form_submissions SET status = ? WHERE id = ?', [status, id])).affectedRows > 0;
}

export async function deleteSubmission(id) {
  return (await query('DELETE FROM form_submissions WHERE id = ?', [id])).affectedRows > 0;
}
