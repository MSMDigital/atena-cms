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
