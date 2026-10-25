'use server';

import { cookies } from 'next/headers';
import { requireUser, COOKIE } from '@/lib/auth.mjs';
import { changePassword } from '@/lib/sessions.mjs';
import { getUser, updateUser } from '@/lib/users.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';

// Ogni utente cambia SOLO la propria password (l'identità viene dalla sessione, mai dal modulo).
export async function changePasswordAction(_prev, formData) {
  const user = await requireUser();
  const t = await getT();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const again = String(formData.get('again') ?? '');
  if (!current || !next) return { error: t('Compila tutti i campi.') };
  if (next !== again) return { error: t('Le due password nuove non coincidono.') };
  const r = await changePassword(user.id, current, next, (await cookies()).get(COOKIE)?.value);
  return r.ok ? { ok: true } : await loc({ error: r.error });
}

// Ognuno modifica SOLO il proprio profilo; nome utente, email, ruolo e stato restano quelli attuali (li cambia un admin da Utenti).
export async function saveProfileAction(input) {
  const user = await requireUser();
  const t = await getT();
  const cur = await getUser(user.id);
  if (!cur) return { ok: false, error: t('Utente non valido.') };
  return loc(await updateUser(user.id, { ...input, username: cur.username, email: cur.email, role: cur.role, active: true }, user));
}
