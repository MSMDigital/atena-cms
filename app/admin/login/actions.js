'use server';

import { redirect } from 'next/navigation';
import { attemptLogin } from '@/lib/sessions.mjs';
import { setSessionCookie, clearSessionCookie, clientInfo, COOKIE } from '@/lib/auth.mjs';
import { cookies } from 'next/headers';
import { destroySession } from '@/lib/sessions.mjs';

// Solo indirizzi interni all'admin: niente redirect verso siti esterni.
const safeNext = (n) => (typeof n === 'string' && /^\/admin(\/|$)/.test(n) && !n.startsWith('//') ? n : '/admin');

export async function loginAction(_prev, formData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  // L'email torna indietro: React azzera il form dopo un'azione e chi sbaglia la password non deve riscriverla.
  if (!email || !password) return { error: 'Inserisci email e password.', email };
  const r = await attemptLogin(email, password, await clientInfo());
  if (!r.ok) return { error: r.reason === 'locked' ? 'Troppi tentativi. Riprova tra 15 minuti.' : r.reason === 'busy' ? 'Servizio occupato: riprova tra un momento.' : 'Email o password non corretti.', email };
  await setSessionCookie(r.token, r.expires);
  redirect(safeNext(formData.get('next')));
}

export async function logoutAction() {
  await destroySession((await cookies()).get(COOKIE)?.value);
  await clearSessionCookie();
  redirect('/admin/login');
}
