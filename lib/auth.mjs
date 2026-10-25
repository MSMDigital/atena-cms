// Accesso nel contesto di Next: cookie di sessione, utente corrente, controllo del ruolo.
import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { findSession, SESSION_DAYS, UNKNOWN_IP } from './sessions.mjs';
import { loadEnv } from './env.mjs';
import { loginPath } from './admin-path.mjs';
import { atLeast } from './permissions.mjs';

export const COOKIE = 'cms_session';

// Una sola verifica nel database per richiesta, anche se più componenti chiedono l'utente.
export const currentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  return findSession(token);
});

// Senza ruolo basta essere entrati; 'author' = autore o amministratore (contenuti propri); 'admin' = solo amministratore. Un utente «normale» non ha privilegi.
export async function requireUser(role) {
  const u = await currentUser();
  if (!u) redirect(loginPath());
  if (role && !atLeast(u, role)) redirect('/admin?negato=1');
  return u;
}

// Cookie "Secure" (mai su http) in produzione, a meno che l'app non sia dichiaratamente in locale: una configurazione dimenticata non deve
// mandare la sessione in chiaro.
export function isSecureDeployment() {
  loadEnv();
  const origin = process.env.APP_ORIGIN ?? '';
  if (origin.startsWith('https://')) return true;
  return process.env.NODE_ENV === 'production' && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(origin);
}

export async function setSessionCookie(token, expires) {
  loadEnv();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires,
    secure: isSecureDeployment(),
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() { (await cookies()).delete(COOKIE); }

// L'indirizzo del client vale solo se l'app sta dietro un proxy fidato; altrimenti X-Forwarded-For sarebbe falsificabile.
export async function clientInfo() {
  loadEnv();
  const h = await headers();
  // Con un proxy fidato l'ultimo valore è quello scritto dal proxy; i precedenti li può inventare il client.
  const fwd = process.env.TRUST_PROXY === '1' ? h.get('x-forwarded-for')?.split(',').at(-1)?.trim() : null;
  return { ip: fwd && /^[0-9a-f:.]{3,45}$/i.test(fwd) ? fwd : UNKNOWN_IP, ua: h.get('user-agent') ?? undefined };
}
