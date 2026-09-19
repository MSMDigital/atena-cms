// Le immagini caricate (non ancora pubblicate) si vedono nell'anteprima anche da un documento senza cookie (iframe con sandbox):
// l'indirizzo porta un token a scadenza, firmato dal server, valido per quel solo file.
import crypto from 'node:crypto';
import { loadEnv } from './env.mjs';

const secret = () => { loadEnv(); return process.env.SETTINGS_SECRET || process.env.IP_HASH_SECRET || null; };
const sig = (rel, exp, key) => crypto.createHmac('sha256', key).update(`preview:${rel}:${exp}`).digest('hex').slice(0, 32);

export function signPreviewPath(rel, ttlMs = 30 * 60_000) {
  const key = secret();
  if (!key) return null;
  const exp = Date.now() + ttlMs;
  return `${exp}.${sig(rel, exp, key)}`;
}

export function verifyPreviewToken(rel, token) {
  const key = secret();
  const [exp, mac] = String(token ?? '').split('.');
  if (!key || !/^\d{10,14}$/.test(exp ?? '') || Number(exp) < Date.now() || !/^[0-9a-f]{32}$/.test(mac ?? '')) return false;
  const a = Buffer.from(mac); const b = Buffer.from(sig(rel, exp, key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
