// Sessioni e accesso, senza dipendenze da Next (si possono provare da riga di comando).
// Nel cookie c'è il token; nel database solo il suo SHA-256.
import crypto from 'node:crypto';
import { query, one } from './db.mjs';
import { verifyPassword, hashPassword, MIN_PASSWORD } from './password.mjs';

export const SESSION_DAYS = 7;
const WINDOW_MIN = 15;
// Soglie in una finestra di 15 minuti. Con un indirizzo affidabile (dietro proxy, TRUST_PROXY=1) si blocca chi sbaglia da UNO stesso indirizzo:
// un estraneo non può chiudere fuori il titolare dell'account da altri indirizzi. Restano i limiti per account (attacco da molti indirizzi) e per indirizzo.
const MAX_FAIL_EMAIL_IP = 5;      // stesso account, stesso indirizzo
const MAX_FAIL_EMAIL = 20;        // stesso account, tutti gli indirizzi
const MAX_FAIL_IP = 20;           // stesso indirizzo, qualsiasi account
const MAX_FAIL_EMAIL_NO_IP = 5;   // indirizzo sconosciuto (nessun proxy fidato): l'unico limite possibile è per account
const MAX_PARALLEL_HASH = 2;      // verifiche scrypt contemporanee (32 MB e un thread ciascuna): oltre, si accoda e, se la coda è lunga, si rifiuta
const MAX_QUEUE = 20;

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();

let dummyHash;
const dummy = async () => (dummyHash ??= await hashPassword(crypto.randomBytes(12).toString('hex')));

export async function createSession(userId, { ip, ua } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await query('INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)', [hashToken(token), userId, expires, ip?.slice(0, 45) ?? null, ua?.slice(0, 255) ?? null]);
  return { token, expires };
}

export async function findSession(token) {
  if (!token) return null;
  return one(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP() AND u.active = 1`, [hashToken(token)]);
}

export async function destroySession(token) { if (token) await query('DELETE FROM sessions WHERE id = ?', [hashToken(token)]); }
export async function destroyUserSessions(userId) { await query('DELETE FROM sessions WHERE user_id = ?', [userId]); }

// 'direct' = indirizzo sconosciuto o non affidabile (nessun proxy fidato): il limite per indirizzo si salta, altrimenti
// 20 errori qualsiasi bloccherebbero l'accesso a tutti. Resta il limite per email.
export const UNKNOWN_IP = 'direct';

// Registra il tentativo PRIMA di verificare la password (con richieste in parallelo il conteggio le vede tutte) e dice se il limite è superato.
// Un tentativo bloccato non si conta: l'attacco non allunga il blocco.
async function reserveAttempt(email, ip) {
  const r = await query('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)', [email.slice(0, 190), ip.slice(0, 45)]);
  const id = Number(r.insertId);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const n = async (where, params) => Number((await one(`SELECT COUNT(*) AS n FROM login_attempts WHERE success = 0 AND created_at > ? AND ${where}`, [since, ...params])).n);
  const locked = ip === UNKNOWN_IP
    ? (await n('email = ?', [email])) > MAX_FAIL_EMAIL_NO_IP
    : (await n('email = ? AND ip = ?', [email, ip])) > MAX_FAIL_EMAIL_IP || (await n('email = ?', [email])) > MAX_FAIL_EMAIL || (await n('ip = ?', [ip])) > MAX_FAIL_IP;
  if (locked) await query('DELETE FROM login_attempts WHERE id = ?', [id]);
  return { id, locked };
}

let active = 0; const waiting = [];
async function withHashSlot(fn) {
  if (active >= MAX_PARALLEL_HASH) {
    if (waiting.length >= MAX_QUEUE) return { busy: true };
    await new Promise((resolve) => waiting.push(resolve));
  } else active++;
  try { return { value: await fn() }; } finally { const next = waiting.shift(); if (next) next(); else active--; }
}

let lastPurge = 0;
// Pulizia periodica (non solo al login riuscito): sessioni scadute e vecchi tentativi. Sotto attacco la tabella non cresce senza limite.
export async function purgeAuthTables(force = false) {
  if (!force && Date.now() - lastPurge < 10 * 60_000) return;
  lastPurge = Date.now();
  await query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
  await query('DELETE FROM login_attempts WHERE created_at < ?', [new Date(Date.now() - 7 * 86400_000)]);
}

// Esito: { ok: true, user, token, expires } oppure { ok: false, reason: 'invalid' | 'locked' }.
// Il messaggio per l'utente è lo stesso per email inesistente e password errata; il tempo di risposta anche.
export async function attemptLogin(emailRaw, password, { ip = UNKNOWN_IP, ua } = {}) {
  const email = normalizeEmail(emailRaw);
  if (String(password ?? '').length > 1000) return { ok: false, reason: 'invalid' };   // nessuna elaborazione su password assurde
  await purgeAuthTables().catch(() => {});
  const attempt = await reserveAttempt(email, ip);
  if (attempt.locked) return { ok: false, reason: 'locked' };

  const user = await one('SELECT id, email, name, role, password_hash, active FROM users WHERE email = ?', [email]);
  const hash = user?.password_hash ?? (await dummy());
  const checked = await withHashSlot(() => verifyPassword(String(password ?? ''), hash));
  if (checked.busy) { await query('DELETE FROM login_attempts WHERE id = ?', [attempt.id]); return { ok: false, reason: 'busy' }; }
  const ok = !!user && !!user.active && checked.value;
  if (!ok) return { ok: false, reason: 'invalid' };

  await query('UPDATE login_attempts SET success = 1 WHERE id = ?', [attempt.id]);
  await query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
  const s = await createSession(user.id, { ip, ua });
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, ...s };
}

// Cambio della propria password: serve quella attuale (con gli stessi limiti di tentativi dell'accesso) e la nuova deve avere almeno
// MIN_PASSWORD caratteri. Riuscito, tutte le altre sessioni dell'utente vengono chiuse (quella in uso resta).
export async function changePassword(userId, current, next, keepToken) {
  const cur = String(current ?? ''); const nw = String(next ?? '');
  if (nw.length < MIN_PASSWORD) return { ok: false, error: `La nuova password deve avere almeno ${MIN_PASSWORD} caratteri.` };
  if (nw.length > 200) return { ok: false, error: 'La nuova password è troppo lunga (massimo 200 caratteri).' };
  if (cur.length > 1000) return { ok: false, error: 'La password attuale non è corretta.' };
  const user = await one('SELECT id, email, password_hash FROM users WHERE id = ? AND active = 1', [userId]);
  if (!user) return { ok: false, error: 'Utente non valido.' };
  if (nw.toLowerCase() === user.email.toLowerCase() || nw === cur) return { ok: false, error: 'La nuova password deve essere diversa dall\'attuale e dall\'email.' };
  const attempt = await reserveAttempt(user.email, `pwchange-${user.id}`);
  if (attempt.locked) return { ok: false, error: 'Troppi tentativi. Riprova tra 15 minuti.' };
  const checked = await withHashSlot(() => verifyPassword(cur, user.password_hash));
  if (checked.busy) { await query('DELETE FROM login_attempts WHERE id = ?', [attempt.id]); return { ok: false, error: 'Servizio occupato: riprova tra un momento.' }; }
  if (!checked.value) return { ok: false, error: 'La password attuale non è corretta.' };
  await query('UPDATE login_attempts SET success = 1 WHERE id = ?', [attempt.id]);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(nw), userId]);
  await query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, keepToken ? hashToken(keepToken) : '']);
  return { ok: true };
}

// Conferma della password prima di un'operazione delicata (installare o attivare un template): stessi limiti di tentativi dell'accesso.
// Restituisce { ok } oppure { ok: false, error }.
export async function confirmPassword(userId, password) {
  const pw = String(password ?? '');
  if (!pw || pw.length > 1000) return { ok: false, error: 'Inserisci la tua password per confermare.' };
  const user = await one('SELECT id, email, password_hash FROM users WHERE id = ? AND active = 1', [userId]);
  if (!user) return { ok: false, error: 'Utente non valido.' };
  const attempt = await reserveAttempt(user.email, `confirm-${user.id}`);
  if (attempt.locked) return { ok: false, error: 'Troppi tentativi. Riprova tra 15 minuti.' };
  const checked = await withHashSlot(() => verifyPassword(pw, user.password_hash));
  if (checked.busy) { await query('DELETE FROM login_attempts WHERE id = ?', [attempt.id]); return { ok: false, error: 'Servizio occupato: riprova tra un momento.' }; }
  if (!checked.value) return { ok: false, error: 'Password non corretta.' };
  await query('UPDATE login_attempts SET success = 1 WHERE id = ?', [attempt.id]);
  return { ok: true };
}
