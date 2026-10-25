// Email delle richieste dei moduli. Il server SMTP si configura da Impostazioni email nell'admin (password cifrata) o, in mancanza, da .env; mai dal codice.
// Mittente = MAIL_FROM (un indirizzo del dominio autorizzato dal server SMTP, per SPF/DKIM); l'indirizzo di chi scrive va in Reply-To.
import nodemailer from 'nodemailer';
import { loadEnv } from './env.mjs';
import { resolveMailConfig, formRecipients } from './settings.mjs';
import { getGeneral } from './general.mjs';
import { formatStamp } from '../render/format.mjs';
import { textOf } from '../render/translations.mjs';

const oneLine = (s) => Array.from(String(s), (c) => ([10, 13, 0x2028, 0x2029].includes(c.charCodeAt(0)) ? ' ' : c)).join('').replace(/ {2,}/g, ' ').trim();
const plain = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

// Messaggio (solo testo): oggetto e destinatari vengono dal modulo, i valori sono quelli già validati.
export function buildMessage({ block, values, submission, from, adminUrl, to, general }) {
  const labelOf = (f) => plain(textOf(f.label, 'it') || f.name);
  const lines = [];
  for (const f of block.fields) {
    if (f.type === 'consent') { if (values[f.name]) lines.push(`Consenso: sì (${labelOf(f)})`); continue; }
    if (values[f.name] === undefined) continue;
    const v = String(values[f.name]);
    lines.push(f.type === 'textarea' ? `${labelOf(f)}:\n${v}` : `${labelOf(f)}: ${v}`);
  }
  const email = block.fields.find((f) => f.type === 'email' && values[f.name])?.name;
  const when = formatStamp(submission.created_at, general ?? {});
  const text = [
    `Nuova richiesta dal sito (${plain(textOf(block.label, 'it') || block.id)}).`,
    `Ricevuta il ${when}, pagina: ${submission.page_key}.`,
    '', ...lines, '',
    adminUrl ? `Si trova anche nell'elenco delle richieste: ${adminUrl}` : '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
  return {
    from,
    to: to ?? block.delivery.recipients,
    subject: oneLine(block.delivery.subject).slice(0, 200),
    text,
    ...(email ? { replyTo: oneLine(values[email]) } : {}),
    headers: { 'X-Auto-Response-Suppress': 'All' },
  };
}

// Invio tramite l'API di Brevo (al posto dell'SMTP): una richiesta HTTPS con la chiave nell'intestazione «api-key». L'indirizzo dell'API si può
// cambiare con BREVO_API_URL (per le prove). Gli errori non riportano mai la chiave.
const addr = (a) => (typeof a === 'string' ? { email: a } : { email: a.address, ...(a.name ? { name: a.name } : {}) });
export async function sendViaBrevo(apiKey, message) {
  loadEnv();
  const body = {
    sender: addr(message.from), to: [].concat(message.to).map((email) => ({ email })), subject: message.subject, textContent: message.text,
    ...(message.replyTo ? { replyTo: addr(message.replyTo) } : {}), ...(message.headers ? { headers: message.headers } : {}),
  };
  let res;
  try {
    res = await fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
  } catch (e) { throw new Error(`Brevo non raggiungibile: ${e?.name === 'TimeoutError' ? 'tempo scaduto' : 'connessione non riuscita'}`); }
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.message ?? ''; } catch { /* risposta non JSON */ }
    throw new Error(`Brevo ha rifiutato l'invio (${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ''}`);
  }
  return res.json().catch(() => ({}));
}

// Invia con ciò che dice la configurazione: Brevo (API) o SMTP (nodemailer). `transport` solo per i test.
const deliver = (conf, message, transport) => (transport ? transport.sendMail(message) : conf.brevo ? sendViaBrevo(conf.brevo.apiKey, message) : nodemailer.createTransport(conf.transport).sendMail(message));

// Avviso all'email dell'amministrazione (Impostazioni → Generale), per esempio se una pubblicazione pianificata non riesce. Non lancia mai.
export async function notifyAdmin(subject, text, { transport } = {}) {
  try {
    const { adminEmail } = await getGeneral();
    if (!adminEmail) return { ok: false, error: 'Nessuna email dell\'amministrazione.' };
    const conf = transport ? { from: 'cms@localhost' } : await resolveMailConfig();
    if (!conf) return { ok: false, error: 'Server email non configurato.' };
    await deliver(conf, { from: conf.from, to: adminEmail, subject: String(subject).slice(0, 200), text: `${text}\n`, headers: { 'X-Auto-Response-Suppress': 'All' } }, transport);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
}

// Esito: { status: 'sent' | 'skipped' | 'failed', error? }. `transport` si può passare per i test.
export async function sendSubmissionMail({ block, values, submission, transport }) {
  loadEnv();
  let conf;
  try { conf = transport ? { from: process.env.MAIL_FROM || 'cms@localhost' } : await resolveMailConfig(); }
  catch (e) { return { status: 'failed', error: String(e.message).slice(0, 300) }; }
  if (!conf) return { status: 'skipped', error: 'Server email non configurato: compila Impostazioni email nell\'admin.' };
  const to = await formRecipients(block);
  if (!to.length) return { status: 'skipped', error: 'Nessun destinatario: indica un indirizzo in Impostazioni → Email.' };
  const origin = process.env.APP_ORIGIN;
  const message = buildMessage({ block, values, submission, from: conf.from, to, general: await getGeneral(), adminUrl: origin ? `${origin.replace(/\/$/, '')}/admin/requests/${submission.id}` : null });
  try {
    await deliver(conf, message, transport);
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
    await deliver(conf, {
      from: conf.from, to,
      subject: 'Prova invio email - Atena CMS',
      text: 'Questa è un\'email di prova inviata dalle Impostazioni email del CMS.\nSe la leggi, le richieste dei moduli del sito arriveranno con queste stesse impostazioni.\n',
      headers: { 'X-Auto-Response-Suppress': 'All' },
    }, transport);
    return { ok: true, to, via: conf.source };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300) };
  }
}
