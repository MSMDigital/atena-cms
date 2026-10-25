// Protezione dalle richieste inviate da altri siti (CSRF) per le route che non sono azioni server (queste hanno già il loro controllo).
// Il cookie di sessione è SameSite=Lax, ma per un POST si esige anche che l'Origin coincida con l'host dell'app.
import { loadEnv } from './env.mjs';

export function isSameOrigin(headers) {
  loadEnv();
  const origin = headers.get('origin');
  if (!origin) return false;                       // i browser lo inviano sempre nei POST: senza Origin non si fida
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  const allowed = new Set([headers.get('host')].filter(Boolean));
  if (process.env.APP_ORIGIN) { try { allowed.add(new URL(process.env.APP_ORIGIN).host); } catch { /* APP_ORIGIN non valido */ } }
  return allowed.has(host);
}

// Admin e installazione solo dagli indirizzi indicati in ADMIN_HOSTS (senza, da qualsiasi). Lo controlla anche il middleware, ma le route di
// caricamento (file grandi) ne sono escluse: Next copia in memoria il corpo di ogni richiesta che passa dal middleware e lo tronca oltre il limite.
export function isAdminHost(headers) {
  loadEnv();
  const hosts = (process.env.ADMIN_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !hosts.length || hosts.includes((headers.get('host') ?? '').toLowerCase());
}
