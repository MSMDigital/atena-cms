'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { loc } from '@/lib/i18n-server.mjs';
import { audit } from '@/lib/audit.mjs';
import { checkSlug, saveSlug, clearSlug, randomSlug } from '@/lib/admin-path.mjs';
import { viewState } from './view-state';

export async function saveAdminPathAction(input) {
  const user = await requireUser('admin');
  const slug = String(input ?? '').trim().toLowerCase();
  const err = checkSlug(slug);
  if (err) return loc({ ok: false, error: err });
  const r = saveSlug(slug);
  if (!r.ok) return loc(r);
  await audit(user.id, 'admin-path', 'indirizzo di accesso personalizzato impostato');
  revalidatePath('/admin/security');
  return { ok: true, ...(await viewState()) };
}

export async function clearAdminPathAction() {
  const user = await requireUser('admin');
  clearSlug();
  await audit(user.id, 'admin-path', 'indirizzo di accesso personalizzato rimosso (torna /admin/login)');
  revalidatePath('/admin/security');
  return { ok: true, ...(await viewState()) };
}

export async function suggestAdminPathAction() {
  await requireUser('admin');
  return { slug: randomSlug() };
}
