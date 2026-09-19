'use server';

import { cookies } from 'next/headers';
import { requireUser, COOKIE } from '@/lib/auth.mjs';
import { changePassword } from '@/lib/sessions.mjs';

// Ogni utente cambia SOLO la propria password (l'identità viene dalla sessione, mai dal modulo).
export async function changePasswordAction(_prev, formData) {
  const user = await requireUser();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const again = String(formData.get('again') ?? '');
  if (!current || !next) return { error: 'Compila tutti i campi.' };
  if (next !== again) return { error: 'Le due password nuove non coincidono.' };
  const r = await changePassword(user.id, current, next, (await cookies()).get(COOKIE)?.value);
  return r.ok ? { ok: true } : { error: r.error };
}
