'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { loc } from '@/lib/i18n-server.mjs';
import { createApiToken, revokeApiToken, deleteApiToken } from '@/lib/api-tokens.mjs';

// Solo un admin gestisce i token. Il token in chiaro torna una sola volta, in risposta alla creazione.
export async function createApiTokenAction(input) {
  const user = await requireUser('admin');
  const r = await createApiToken({ name: input?.name, userId: Number(input?.userId), days: input?.days }, user.id);
  revalidatePath('/admin/api');
  return loc(r);
}

export async function revokeApiTokenAction(id) {
  const user = await requireUser('admin');
  const r = await revokeApiToken(id, user.id);
  revalidatePath('/admin/api');
  return loc(r);
}

export async function deleteApiTokenAction(id) {
  const user = await requireUser('admin');
  const r = await deleteApiToken(id, user.id);
  revalidatePath('/admin/api');
  return loc(r);
}
