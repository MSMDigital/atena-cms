// Token dell'API degli articoli. Il token è casuale (256 bit): nel database c'è solo il suo SHA-256, quindi non serve uno hash lento e la
// ricerca per hash non rivela nulla sul token. Si vede una sola volta, alla creazione. Un token fa una cosa sola: creare articoli in BOZZA.
import crypto from 'node:crypto';
import { query, one } from './db.mjs';
import { audit } from './audit.mjs';

export const TOKEN_FORMAT = /^atn_[A-Za-z0-9_-]{43}$/;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const FAIL_WINDOW_MIN = 15;
const MAX_FAILS = 10;   // tentativi con un token sbagliato per indirizzo in 15 minuti

export async function createApiToken({ name, userId, days }, byUserId) {
  const label = String(name ?? '').trim();
  if (!label || label.length > 100) return { ok: false, error: 'Dai un nome al token (massimo 100 caratteri).' };
  const owner = await one("SELECT id FROM users WHERE id = ? AND active = 1 AND role IN ('admin', 'author')", [userId]);
  if (!owner) return { ok: false, error: "L'utente deve essere attivo e avere ruolo Amministratore o Autore." };
  const d = days === '' || days == null ? null : Number(days);
  if (d !== null && (!Number.isInteger(d) || d < 1 || d > 730)) return { ok: false, error: 'La durata va da 1 a 730 giorni (oppure vuota: senza scadenza).' };
  const token = `atn_${crypto.randomBytes(32).toString('base64url')}`;
  const expires = d ? new Date(Date.now() + d * 86400_000) : null;
  await query('INSERT INTO api_tokens (name, token_hash, prefix, user_id, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [label, hashToken(token), token.slice(0, 8), owner.id, byUserId ?? null, expires]);
  await audit(byUserId, 'api-token', `creato il token «${label}»`);
  return { ok: true, token };
}

export async function listApiTokens() {
  return query(`SELECT t.id, t.name, t.prefix, t.created_at, t.expires_at, t.revoked_at, t.last_used_at, t.last_ip, u.name AS user_name, u.active AS user_active
    FROM api_tokens t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC`);
}

export async function revokeApiToken(id, byUserId) {
  const r = await query('UPDATE api_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL', [Number(id)]);
  if (!r.affectedRows) return { ok: false, error: 'Token non trovato o già revocato.' };
  await audit(byUserId, 'api-token', `revocato il token #${Number(id)}`);
  return { ok: true };
}

export async function deleteApiToken(id, byUserId) {
  await query('DELETE FROM api_tokens WHERE id = ? AND revoked_at IS NOT NULL', [Number(id)]);
  await audit(byUserId, 'api-token', `eliminato il token #${Number(id)}`);
  return { ok: true };
}

// Da un'intestazione Authorization: Bearer … all'utente proprietario del token, oppure un motivo del rifiuto.
// Tutti i rifiuti di autenticazione hanno la stessa risposta all'esterno (non si distingue token sbagliato, scaduto o revocato).
export async function authenticateApi(header, ip) {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000);
  const fails = Number((await one("SELECT COUNT(*) AS n FROM login_attempts WHERE email = 'api-token' AND ip = ? AND success = 0 AND created_at > ?", [ip, since])).n);
  if (fails >= MAX_FAILS) return { ok: false, reason: 'locked' };
  const m = /^Bearer (\S+)$/.exec(String(header ?? ''));
  const token = m?.[1];
  const row = token && TOKEN_FORMAT.test(token) ? await one(
    `SELECT t.id, u.id AS user_id, u.name, u.role FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > UTC_TIMESTAMP())
        AND u.active = 1 AND u.role IN ('admin', 'author')`, [hashToken(token)]) : null;
  if (!row) {
    await query("INSERT INTO login_attempts (email, ip, success) VALUES ('api-token', ?, 0)", [ip.slice(0, 45)]);
    return { ok: false, reason: 'denied' };
  }
  await query('UPDATE api_tokens SET last_used_at = UTC_TIMESTAMP(), last_ip = ? WHERE id = ?', [ip.slice(0, 45), row.id]);
  return { ok: true, tokenId: row.id, user: { id: row.user_id, name: row.name, role: row.role } };
}
