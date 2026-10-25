'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { publishAll } from '@/lib/docs.mjs';
import { loc } from '@/lib/i18n-server.mjs';

// Pubblica tutte le bozze: costruisce il sito e, solo se va a buon fine, lo mette online.
export async function publishAction() {
  const user = await requireUser('admin');
  const r = await publishAll(user.id);
  revalidatePath('/admin');
  revalidatePath('/admin/style');
  return loc(r);
}
