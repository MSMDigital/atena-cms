'use server';

import { redirect } from 'next/navigation';
import { attemptLogin } from '@/lib/sessions.mjs';
import { setSessionCookie, clearSessionCookie, clientInfo, COOKIE } from '@/lib/auth.mjs';
import { cookies } from 'next/headers';
import { loginPath } from '@/lib/admin-path.mjs';
import { destroySession } from '@/lib/sessions.mjs';
import { getT } from '@/lib/i18n-server.mjs';

// Solo indirizzi interni all'admin: niente redirect verso siti esterni.
const safeNext = (n) => (typeof n === 'string' && /^\/admin(\/|$)/.test(n) && !n.startsWith('//') ? n : '/admin');

export async function loginAction(_prev, formData) {
  const t = await getT();
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  // L'email torna indietro: React azzera il form dopo un'azione e chi sbaglia la password non deve riscriverla.
  if (!email || !password) return { error: t('Inserisci email (o nome utente) e password.'), email };
  const r = await attemptLogin(email, password, await clientInfo());
  if (!r.ok) return { error: r.reason === 'locked' ? t('Troppi tentativi. Riprova tra 15 minuti.') : r.reason === 'busy' ? t('Servizio occupato: riprova tra un momento.') : t('Credenziali non corrette.'), email };
  await setSessionCookie(r.token, r.expires);
  redirect(safeNext(formData.get('next')));
}

export async function logoutAction() {
  await destroySession((await cookies()).get(COOKIE)?.value);
  await clearSessionCookie();
  redirect(loginPath());
}
