import 'server-only';
import { headers } from 'next/headers';
import { adminSlug } from '@/lib/admin-path.mjs';

// Non sta in actions.js: lì ogni funzione esportata diventa un'azione che chiunque può chiamare, e questa restituisce l'indirizzo segreto di accesso.

// Indirizzo pubblico del sito dell'admin, per mostrare il link completo (APP_ORIGIN se c'è, altrimenti quello della richiesta).
export async function originOf() {
  const env = (process.env.APP_ORIGIN ?? '').replace(/\/+$/, '');
  if (env) return env;
  const h = await headers();
  const host = h.get('host') ?? 'localhost';
  return `${h.get('x-forwarded-proto') ?? (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https')}://${host}`;
}

export async function viewState() {
  return { slug: adminSlug(), origin: await originOf() };
}
