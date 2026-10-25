// Indirizzo di accesso personalizzato. Di serie l'accesso è /admin/login (prevedibile: tutti i bot lo provano). Con un indirizzo scelto qui
// (es. /entrata-7k2x/) la pagina di accesso e l'admin si raggiungono solo da lì: /admin/login risponde "non trovato" a chi non è già dentro.
// Il valore sta in data/admin-path.json (un file, non il database: lo legge anche il middleware, che gira prima di tutto il resto).
// Niente 'server-only': lo usano sia il middleware sia le pagine e gli script da riga di comando.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';

const FILE = () => path.join(ROOT, 'data', 'admin-path.json');
export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;   // da 3 a 40 caratteri: lettere minuscole, cifre, trattini (non ai bordi)
// Percorsi che il sito o il motore usano già, più i nomi che i bot provano per primi.
const RESERVED = new Set(['admin', 'api', 'install', 'assets', 'media', 'uploads', 'login', 'logout', 'wp-admin', 'wp-login', 'wp-content', 'administrator', 'backend', 'dashboard', 'cms', 'panel', 'static', 'public', 'favicon', 'robots', 'sitemap', 'preview', 'private', 'account']);

let cache = { mtime: -1, value: null };
// Legge il valore salvato (con una cache che si invalida da sola se il file cambia). null = funzione spenta.
export function adminSlug() {
  let st;
  try { st = fs.statSync(FILE()); } catch { cache = { mtime: -1, value: null }; return null; }
  if (st.mtimeMs === cache.mtime) return cache.value;
  let value = null;
  try { const s = JSON.parse(fs.readFileSync(FILE(), 'utf8'))?.slug; if (typeof s === 'string' && SLUG.test(s) && !RESERVED.has(s)) value = s; } catch { /* file rovinato: come spento */ }
  cache = { mtime: st.mtimeMs, value };
  return value;
}

export const loginPath = () => { const s = adminSlug(); return s ? `/${s}/login` : '/admin/login'; };

// Messaggio d'errore leggibile, oppure null se l'indirizzo va bene.
export function checkSlug(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!SLUG.test(s)) return 'Da 3 a 40 caratteri: lettere minuscole, cifre e trattini (non all\'inizio né alla fine).';
  if (RESERVED.has(s)) return 'Questo nome è riservato o troppo prevedibile: scegline un altro.';
  if (s === 'wp' || /^(admin|login|wp)[-0-9]*$/.test(s)) return 'Troppo facile da indovinare: aggiungi qualcosa di tuo.';
  if (fs.existsSync(path.join(ROOT, 'dist', s))) return 'Esiste già una pagina del sito con questo indirizzo.';
  return null;
}

export function saveSlug(raw) {
  const s = String(raw).trim().toLowerCase();
  const err = checkSlug(s);
  if (err) return { ok: false, error: err };
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  const tmp = `${FILE()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ slug: s }) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, FILE());
  return { ok: true, slug: s };
}

export function clearSlug() { try { fs.unlinkSync(FILE()); } catch { /* già spento */ } cache = { mtime: -1, value: null }; }

// Un indirizzo casuale, facile da copiare: «entrata-» + 8 caratteri.
export function randomSlug() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8); globalThis.crypto.getRandomValues(bytes);
  return 'entrata-' + [...bytes].map((b) => abc[b % abc.length]).join('');
}
