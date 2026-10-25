// Password di una pagina protetta (campo pagina "protected"): a differenza della password SMTP (lib/settings.mjs, reversibile) qui
// si conserva solo l'hash (scrypt, come le password degli utenti): nessuno, nemmeno chi ha accesso al database, la recupera in chiaro.
// Cambiarla basta a invalidare gli accessi già sbloccati: il cookie è firmato (HMAC) insieme all'hash corrente, non è una sessione nel database.
import crypto from 'node:crypto';
import path from 'node:path';
import { query, one } from './db.mjs';
import { loadEnv } from './env.mjs';
import { hashPassword, verifyPassword, MIN_PASSWORD } from './password.mjs';
import { reserveAttempt, withHashSlot } from './sessions.mjs';
import { requireTemplate } from './template.mjs';
import { loadData } from './docs.mjs';
import { mediaDir } from './media.mjs';
import { renderPages } from '../render/host.mjs';
import { imageInfo } from '../render/build.mjs';
import { htmlAttrs } from '../render/tokens.mjs';

const settingName = (key) => `page_access:${key}`;

async function readAccess(key) {
  const row = await one('SELECT s.value, s.updated_at, u.name AS by_name FROM settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.name = ?', [settingName(key)]);
  if (!row) return null;
  try { return { ...JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.by_name }; } catch { return null; }
}

// Cosa può vedere l'admin: mai l'hash.
export async function pageAccessView(key) {
  const s = await readAccess(key);
  return {
    hasPassword: !!s?.hash,
    updatedAt: s?.updatedAt ? new Date(s.updatedAt).toISOString() : null,
    updatedBy: s?.updatedBy ?? null,
  };
}

// password vuota = errore (qui non si "tiene quella già salvata": per cambiarla va sempre scritta una nuova).
export async function setPageAccessPassword(key, password, userId) {
  const pw = String(password ?? '');
  if (pw.length < MIN_PASSWORD) return { ok: false, error: `La password deve avere almeno ${MIN_PASSWORD} caratteri.` };
  if (pw.length > 200) return { ok: false, error: 'La password è troppo lunga (massimo 200 caratteri).' };
  const value = JSON.stringify({ hash: await hashPassword(pw) });
  await query('INSERT INTO settings (name, value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)', [settingName(key), value, userId ?? null]);
  return { ok: true };
}

export async function clearPageAccessPassword(key) {
  return (await query('DELETE FROM settings WHERE name = ?', [settingName(key)])).affectedRows > 0;
}

// Esito: { ok: true, hash } (per firmare il cookie) oppure { ok: false, reason: 'invalid' | 'locked' | 'unset' | 'busy' }.
// Stessi limiti di tentativi dell'accesso admin (lib/sessions.mjs): registrati PRIMA di verificare, al massimo 2 verifiche scrypt insieme.
export async function verifyPageAccess(key, password, ip) {
  const pw = String(password ?? '');
  if (pw.length > 1000) return { ok: false, reason: 'invalid' };
  const s = await readAccess(key);
  if (!s?.hash) return { ok: false, reason: 'unset' };   // nessuna password impostata: la pagina resta chiusa
  const attempt = await reserveAttempt(`page:${key}`, ip);
  if (attempt.locked) return { ok: false, reason: 'locked' };
  const checked = await withHashSlot(() => verifyPassword(pw, s.hash));
  if (checked.busy) { await query('DELETE FROM login_attempts WHERE id = ?', [attempt.id]); return { ok: false, reason: 'busy' }; }
  if (!checked.value) return { ok: false, reason: 'invalid' };
  await query('UPDATE login_attempts SET success = 1 WHERE id = ?', [attempt.id]);
  return { ok: true, hash: s.hash };
}

// ---- cookie di sblocco (stateless, firmato) --------------------------------------------------------------------------------------

export const gateCookieName = (key) => `cms_gate_${key}`;
const GATE_DAYS = 180;

const secret = () => { loadEnv(); return process.env.SETTINGS_SECRET || process.env.IP_HASH_SECRET || null; };
const sig = (key, hash, exp, k) => crypto.createHmac('sha256', k).update(`gate:${key}:${hash}:${exp}`).digest('hex').slice(0, 32);

// null se manca il segreto nel .env: senza, nessun cookie si può firmare (meglio un errore chiaro che un cookie debole).
export function signGateCookie(key, hash) {
  const k = secret();
  if (!k) return null;
  const exp = Date.now() + GATE_DAYS * 86400_000;
  return { token: `${exp}.${sig(key, hash, exp, k)}`, maxAge: GATE_DAYS * 86400 };
}

// hash: quello attualmente salvato per la pagina. Cambiata la password, i cookie firmati con l'hash precedente non sono più validi.
export function verifyGateCookie(key, hash, token) {
  const k = secret();
  const [exp, mac] = String(token ?? '').split('.');
  if (!k || !hash || !/^\d{10,14}$/.test(exp ?? '') || Number(exp) < Date.now() || !/^[0-9a-f]{32}$/.test(mac ?? '')) return false;
  const a = Buffer.from(mac, 'hex'); const b = Buffer.from(sig(key, hash, exp, k), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Se un cookie già valido sblocca la pagina, senza richiedere la password: { hash } di nuovo, per mantenere il cookie aggiornato.
export async function checkGateCookie(key, token) {
  const s = await readAccess(key);
  if (!s?.hash) return { ok: false };
  return verifyGateCookie(key, s.hash, token) ? { ok: true, hash: s.hash } : { ok: false };
}

// ---- rendering del contenuto reale (pubblicato), solo dopo sblocco --------------------------------------------------------------

// Rende la pagina protetta con i dati PUBBLICATI (mai le bozze) come se non fosse protetta: usata solo dopo aver verificato
// la password o il cookie di sblocco. Non scrive nulla su disco: l'HTML statico della pagina resta la sola schermata con la password.
export async function renderProtectedPage(key) {
  const data = await loadData('published');
  if (!data.tokens || !data.site) return null;
  const page = data.pages.find((p) => p.key === key);
  if (!page || !page.protected) return null;
  const tpl = requireTemplate();
  const unlocked = { ...page, protected: false };
  const pages = data.pages.map((p) => (p.key === key ? unlocked : p));
  const meta = { fontsCss: 'css/fonts.css', preload: [], htmlAttrs: htmlAttrs(data.tokens) };
  const full = { ...data, pages, meta };
  const images = imageInfo(full, [path.join(tpl.assetsDir, 'img'), mediaDir()]);
  const locale = page.lang ?? data.site.locales.base ?? data.site.locales.default;   // il contenuto sbloccato è quello della pagina di base, nella sua lingua
  const [r] = await renderPages(tpl, { data: full, jobs: [{ locale, keys: [key] }], images }, { timeoutMs: 20_000 });
  return r.html;
}
