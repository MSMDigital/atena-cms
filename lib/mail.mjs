// Email delle richieste dei moduli. Il server SMTP si configura da Impostazioni email nell'admin (password cifrata) o, in mancanza, da .env; mai dal codice.
// Mittente = MAIL_FROM (un indirizzo del dominio autorizzato dal server SMTP, per SPF/DKIM); l'indirizzo di chi scrive va in Reply-To.
import nodemailer from 'nodemailer';
import { loadEnv } from './env.mjs';
import { resolveMailConfig } from './settings.mjs';

const oneLine = (s) => Array.from(String(s), (c) => ([10, 13, 0x2028, 0x2029].includes(c.charCodeAt(0)) ? ' ' : c)).join('').replace(/ {2,}/g, ' ').trim();
const plain = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

// Messaggio (solo testo): oggetto e destinatari vengono dal modulo, i valori sono quelli già validati.
export function buildMessage({ block, values, submission, from, adminUrl }) {
  const labelOf = (f) => plain(f.label?.it ?? f.name);
  const lines = [];
  for (const f of block.fields) {
    if (f.type === 'consent') { if (values[f.name]) lines.push(`Consenso: sì (${labelOf(f)})`); continue; }
    if (values[f.name] === undefined) continue;
    const v = String(values[f.name]);
    lines.push(f.type === 'textarea' ? `${labelOf(f)}:\n${v}` : `${labelOf(f)}: ${v}`);
  }
  const email = block.fields.find((f) => f.type === 'email' && values[f.name])?.name;
  const when = new Date(submission.created_at).toLocaleString('it-CH', { timeZone: 'Europe/Zurich' });
  const text = [
    `Nuova richiesta dal sito (${plain(block.label?.it ?? block.id)}).`,
    `Ricevuta il ${when}, pagina: ${submission.page_key}.`,
    '', ...lines, '',
    adminUrl ? `Si trova anche nell'elenco delle richieste: ${adminUrl}` : '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
  return {
    from,
    to: block.delivery.recipients,
    subject: oneLine(block.delivery.subject).slice(0, 200),
    text,
    ...(email ? { replyTo: oneLine(values[email]) } : {}),
    headers: { 'X-Auto-Response-Suppress': 'All' },
  };
}

// Esito: { status: 'sent' | 'skipped' | 'failed', error? }. `transport` si può passare per i test.
export async function sendSubmissionMail({ block, values, submission, transport }) {
  loadEnv();
  let conf;
  try { conf = transport ? { from: process.env.MAIL_FROM || 'cms@localhost' } : await resolveMailConfig(); }
  catch (e) { return { status: 'failed', error: String(e.message).slice(0, 300) }; }
  if (!conf) return { status: 'skipped', error: 'Server email non configurato: compila Impostazioni email nell\'admin.' };
  const origin = process.env.APP_ORIGIN;
  const message = buildMessage({ block, values, submission, from: conf.from, adminUrl: origin ? `${origin.replace(/\/$/, '')}/admin/requests/${submission.id}` : null });
  try {
    await (transport ?? nodemailer.createTransport(conf.transport)).sendMail(message);
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300) };
  }
}

// Email di prova con le impostazioni salvate: { ok, error?, to?, via? }.
export async function sendTestMail(to, { transport } = {}) {
  let conf;
  try { conf = transport ? { from: 'cms@localhost', source: 'test' } : await resolveMailConfig(); }
  catch (e) { return { ok: false, error: String(e.message).slice(0, 300) }; }
  if (!conf) return { ok: false, error: 'Nessuna impostazione email: salva prima i parametri.' };
  try {
    await (transport ?? nodemailer.createTransport(conf.transport)).sendMail({
      from: conf.from, to,
      subject: 'Prova invio email - Outsmart CMS',
      text: 'Questa è un\'email di prova inviata dalle Impostazioni email del CMS.\nSe la leggi, le richieste dei moduli del sito arriveranno con queste stesse impostazioni.\n',
      headers: { 'X-Auto-Response-Suppress': 'All' },
    });
    return { ok: true, to, via: conf.source };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300) };
  }
}
