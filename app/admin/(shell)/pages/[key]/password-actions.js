'use server';

import { requireUser } from '@/lib/auth.mjs';
import { loc } from '@/lib/i18n-server.mjs';
import { setPageAccessPassword, clearPageAccessPassword, pageAccessView } from '@/lib/page-access.mjs';

// Solo admin: la password della pagina non è un contenuto (non passa da bozza/pubblicazione), vale da subito.
export async function setPagePasswordAction(_prev, formData) {
  const user = await requireUser('admin');
  const key = String(formData.get('key') ?? '');
  const password = String(formData.get('password') ?? '');
  const again = String(formData.get('again') ?? '');
  if (!key) return loc({ error: 'Pagina non valida.' });
  if (!password || password !== again) return loc({ error: 'Le due password non coincidono.' });
  const r = await setPageAccessPassword(key, password, user.id);
  return r.ok ? { ok: true, view: await pageAccessView(key) } : loc({ error: r.error });
}

export async function clearPagePasswordAction(_prev, formData) {
  await requireUser('admin');
  const key = String(formData.get('key') ?? '');
  if (!key) return loc({ error: 'Pagina non valida.' });
  await clearPageAccessPassword(key);
  return { ok: true, view: await pageAccessView(key) };
}
