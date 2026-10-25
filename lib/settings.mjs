// Impostazioni modificabili dall'admin, per ora quelle per l'invio delle email (server SMTP).
// La password SMTP si conserva CIFRATA (AES-256-GCM) con una chiave che sta solo in .env (SETTINGS_SECRET), non nel database:
// chi ottiene una copia del database non ottiene la password. Dal server al browser la password non viaggia mai (si sa solo se c'è).
import crypto from 'node:crypto';
import { query, one } from './db.mjs';
import { loadEnv } from './env.mjs';
import { getGeneral } from './general.mjs';

export const SECURITY = ['starttls', 'ssl', 'none'];
export const DEFAULT_PORT = { starttls: 587, ssl: 465, none: 25 };
const EMAIL = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]{2,}$/;
const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;

// ---- cifratura ----------------------------------------------------------------------------------------------------------

const key = () => {
  loadEnv();
  const secret = process.env.SETTINGS_SECRET;
  return secret && secret.length >= 16 ? crypto.createHash('sha256').update(`cms-settings-v1:${secret}`).digest() : null;
};
export const canEncrypt = () => key() !== null;

export function encryptSecret(plain) {
  const k = key();
  if (!k) throw new Error('Manca SETTINGS_SECRET nel file .env: non posso cifrare la password.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

// null se la chiave è cambiata o il dato è stato alterato (GCM lo rileva).
export function decryptSecret(blob) {
  const k = key();
  const [v, iv, tag, ct] = String(blob ?? '').split(':');
  if (!k || v !== 'v1' || !iv || !tag || ct === undefined) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch { return null; }
}

// ---- lettura e scrittura ------------------------------------------------------------------------------------------------------

async function readMail() {
  const row = await one("SELECT s.value, s.updated_at, u.name AS by_name FROM settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.name = 'mail'");
  if (!row) return null;
  try { return { ...JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.by_name }; } catch { return null; }
}

// Cosa può vedere il browser: mai la password.
export async function mailSettingsView() {
  const s = await readMail();
  loadEnv();
  const env = process.env.SMTP_HOST && process.env.MAIL_FROM ? { host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), from: process.env.MAIL_FROM } : null;
  return {
    source: s ? 'database' : env ? 'env' : 'none',
    canEncrypt: canEncrypt(),
    settings: s && {
      provider: s.provider ?? 'smtp', domain: s.domain ?? (s.provider === 'brevo' ? String(s.from ?? '').split('@')[1] ?? '' : ''),
      host: s.host ?? '', port: s.port ?? 587, security: s.security ?? 'starttls', user: s.user ?? '', from: s.from, fromName: s.fromName ?? '',
      hasPassword: !!s.passwordEnc, passwordReadable: !s.passwordEnc || decryptSecret(s.passwordEnc) !== null,
      hasApiKey: !!s.apiKeyEnc, apiKeyReadable: !s.apiKeyEnc || decryptSecret(s.apiKeyEnc) !== null,
      updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null, updatedBy: s.updatedBy ?? null,
    },
    env,
  };
}

const hasControl = (s) => Array.from(s).some((c) => { const n = c.charCodeAt(0); return n < 32 || n === 127 || n === 0x2028 || n === 0x2029; });

// input: { provider: 'smtp' | 'brevo', from, fromName } più, per SMTP, { host, port, security, user, password?, clearPassword? } e, per Brevo, { apiKey? }.
// Password e chiave API vuote = si tiene quella già salvata (se il fornitore è lo stesso). Restituisce { ok } oppure { ok: false, errors: { campo: messaggio } }.
export async function saveMailSettings(input, userId) {
  const errors = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const provider = input?.provider === 'brevo' ? 'brevo' : 'smtp';
  let from = str(input?.from);
  const domain = str(input?.domain).toLowerCase().replace(/^@/, '');
  if (provider === 'brevo') {
    // Brevo vuole il DOMINIO da cui si invia (autenticato in Brevo), non un indirizzo: il mittente è no-reply@<dominio>.
    const dom = domain || from.split('@')[1] || '';
    if (!HOST.test(dom) || !dom.includes('.') || dom.length > 200) errors.domain = 'Scrivi il dominio da cui inviare, per esempio esempio.ch (senza http:// né @).';
    else from = `no-reply@${dom}`;
  } else if (!EMAIL.test(from) || from.length > 254) errors.from = 'Indirizzo del mittente non valido.';
  const fromName = str(input?.fromName);
  if (fromName.length > 100 || hasControl(fromName) || /[<>"]/.test(fromName)) errors.fromName = 'Nome non valido (massimo 100 caratteri, senza < > ").';
  const old = await readMail();
  let value;
  if (provider === 'brevo') {
    const apiKey = str(input?.apiKey);
    if (apiKey && !/^[\w.-]{16,250}$/.test(apiKey)) errors.apiKey = 'La chiave API non sembra valida (la trovi in Brevo → SMTP e API → Chiavi API).';
    if (apiKey && !canEncrypt()) errors.apiKey = 'Manca SETTINGS_SECRET nel file .env: senza, la chiave non si può conservare in modo sicuro.';
    const keep = old?.provider === 'brevo' && old.apiKeyEnc && !input?.clearApiKey ? old.apiKeyEnc : null;
    if (!apiKey && !keep && !errors.apiKey) errors.apiKey = 'Incolla la chiave API di Brevo.';
    if (Object.keys(errors).length) return { ok: false, errors };
    value = { provider: 'brevo', domain: from.split('@')[1], from, fromName, apiKeyEnc: apiKey ? encryptSecret(apiKey) : keep };
  } else {
    const host = str(input?.host);
    if (!host) errors.host = 'Indica il server SMTP.'; else if (!HOST.test(host)) errors.host = 'Solo il nome del server (es. smtp.esempio.ch), senza http:// né percorsi.';
    const security = SECURITY.includes(input?.security) ? input.security : null;
    if (!security) errors.security = 'Scegli il tipo di connessione.';
    const port = Number(input?.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Porta non valida (1-65535).';
    const user = str(input?.user);
    if (user.length > 200 || hasControl(user)) errors.user = 'Utente non valido.';
    const password = typeof input?.password === 'string' ? input.password : '';
    if (password.length > 500 || hasControl(password)) errors.password = 'Password non valida.';
    if (password && !canEncrypt()) errors.password = 'Manca SETTINGS_SECRET nel file .env: senza, la password non si può conservare in modo sicuro (esegui npm run env:init su un .env nuovo o aggiungila a mano).';
    if (Object.keys(errors).length) return { ok: false, errors };
    const oldSmtp = old && (old.provider ?? 'smtp') === 'smtp' ? old : null;
    let passwordEnc = oldSmtp?.passwordEnc ?? null;
    if (password) passwordEnc = encryptSecret(password);
    else if (input?.clearPassword || !user) passwordEnc = null;   // senza utente non c'è autenticazione: la password non serve
    // Se cambia il server (o la porta, l'utente, la cifratura) la password salvata non si riusa in silenzio: chi cambiasse solo l'host
    // farebbe arrivare la vecchia password a un altro server. Va reinserita.
    else if (!oldSmtp || oldSmtp.host !== host || Number(oldSmtp.port) !== port || oldSmtp.user !== user || oldSmtp.security !== security) passwordEnc = null;
    value = { provider: 'smtp', host, port, security, user, passwordEnc, from, fromName };
  }
  await query("INSERT INTO settings (name, value, updated_by) VALUES ('mail', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)", [JSON.stringify(value), userId ?? null]);
  return { ok: true };
}

export async function deleteMailSettings() {
  return (await query("DELETE FROM settings WHERE name = 'mail'")).affectedRows > 0;
}

// Configurazione per nodemailer: prima quella salvata dall'admin, poi le variabili .env (SMTP_HOST, MAIL_FROM...), altrimenti null.
// Lancia se la password salvata non si può decifrare (chiave cambiata): meglio un errore chiaro che un invio senza autenticazione.
export async function resolveMailConfig() {
  const s = await readMail();
  if (s?.provider === 'brevo') {
    const apiKey = s.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : null;
    if (!apiKey) throw new Error('La chiave API di Brevo salvata non si può decifrare (SETTINGS_SECRET è cambiato?): inseriscila di nuovo in Impostazioni email.');
    return { brevo: { apiKey }, from: { name: s.fromName || (await defaultSenderName()), address: s.from }, source: 'brevo' };
  }
  if (s) {
    const conf = { host: s.host, port: s.port, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
    if (s.security === 'ssl') conf.secure = true;
    else if (s.security === 'starttls') { conf.secure = false; conf.requireTLS = true; }
    else { conf.secure = false; conf.ignoreTLS = true; }
    if (s.user) {
      const pass = s.passwordEnc ? decryptSecret(s.passwordEnc) : '';
      if (pass === null) throw new Error('La password SMTP salvata non si può decifrare (SETTINGS_SECRET è cambiato?): inseriscila di nuovo in Impostazioni email.');
      conf.auth = { user: s.user, pass };
    }
    const name = s.fromName || (await defaultSenderName());
    return { transport: conf, from: name ? { name, address: s.from } : s.from, source: 'database' };
  }
  loadEnv();
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !MAIL_FROM) return null;
  return {
    transport: {
      host: SMTP_HOST, port: +(SMTP_PORT || 587), secure: SMTP_SECURE === '1',
      ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASSWORD ?? '' } } : {}),
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    },
    from: MAIL_FROM, source: 'env',
  };
}

// ---- destinatari delle richieste dei moduli e nome del mittente --------------------------------------------------------------------

const MAX_RECIPIENTS = 10;
const cleanList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);

// Gli indirizzi che ricevono le richieste dei moduli del sito (Impostazioni → Email), quando il modulo non ne indica di suoi.
export async function getMailRecipients() {
  const row = await one("SELECT value FROM settings WHERE name = 'mail_recipients'");
  try { return row ? cleanList(JSON.parse(row.value)) : []; } catch { return []; }
}
export async function saveMailRecipients(input, userId) {
  const list = [...new Set(cleanList(input).map((x) => x.toLowerCase()))];
  if (list.length > MAX_RECIPIENTS) return { ok: false, error: `Al massimo ${MAX_RECIPIENTS} indirizzi.` };
  const bad = list.find((x) => !EMAIL.test(x) || x.length > 254);
  if (bad) return { ok: false, error: `«${bad}» non è un indirizzo email valido.` };
  await query("INSERT INTO settings (name, value, updated_by) VALUES ('mail_recipients', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)", [JSON.stringify(list), userId ?? null]);
  return { ok: true, recipients: list };
}

// A chi va una richiesta: gli indirizzi del modulo, altrimenti quelli di Impostazioni → Email, altrimenti l'email dell'amministrazione.
export async function formRecipients(block) {
  const own = cleanList(block?.delivery?.recipients);
  if (own.length) return own;
  const global = await getMailRecipients();
  if (global.length) return global;
  const admin = (await getGeneral()).adminEmail;
  return admin ? [admin] : [];
}

// Nome del mittente quando non ne è stato scritto uno: l'account amministratore (quello con l'email dell'amministrazione, altrimenti il primo).
export async function defaultSenderName() {
  const { adminEmail } = await getGeneral();
  const u = (adminEmail && await one("SELECT name FROM users WHERE email = ? AND role = 'admin' AND active = 1", [adminEmail])) || await one("SELECT name FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1");
  return u?.name ?? '';
}
