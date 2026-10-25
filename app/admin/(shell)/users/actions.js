'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { loc } from '@/lib/i18n-server.mjs';
import { createUser, updateUser, resetPassword, deleteUser, bulkUsers } from '@/lib/users.mjs';

const refresh = () => { revalidatePath('/admin/users'); revalidatePath('/admin'); };

// Crea o modifica un utente (solo un admin): `id` assente = nuovo. I dati vengono sempre ripuliti e controllati dal server (lib/users.mjs).
export async function saveUserAction({ id, ...input }) {
  const user = await requireUser('admin');
  const r = id ? await updateUser(Number(id), input, user) : await createUser(input, user);
  refresh();
  return loc(r);
}

// Reimposta la password di un utente: quella scelta o una generata (mostrata una sola volta). L'utente deve riaccedere.
export async function resetPasswordAction(id, chosen) {
  const user = await requireUser('admin');
  const r = await resetPassword(Number(id), user, typeof chosen === 'string' && chosen ? chosen : null);
  refresh();
  return loc(r);
}

export async function deleteUserAction(id) {
  const user = await requireUser('admin');
  const r = await deleteUser(Number(id), user);
  refresh();
  return loc(r);
}

// Azioni di massa: ruolo, profilo pubblico (action 'hide' | 'show'), eliminazione. Le regole di sicurezza valgono per ogni utente (lib/users.mjs).
export async function bulkUsersAction({ ids, action, role }) {
  const user = await requireUser('admin');
  const r = await bulkUsers(Array.isArray(ids) ? ids.map(Number) : [], action, { role }, user);
  refresh();
  return loc(r);
}
