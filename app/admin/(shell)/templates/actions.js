'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { confirmPassword } from '@/lib/sessions.mjs';
import { switchTemplate, contentCompat, templateDir } from '@/lib/template-switch.mjs';
import { removeTemplate } from '@/lib/template-install.mjs';
import { loadTemplateFrom, TEMPLATE_ID } from '@/lib/template.mjs';
import { audit } from '@/lib/audit.mjs';
import { withLock } from '@/lib/db.mjs';

const okId = (id) => { if (typeof id !== 'string' || !TEMPLATE_ID.test(id)) throw new Error('Template non valido'); return id; };

// Quanto i contenuti attuali sono compatibili con un template (senza cambiare nulla).
export async function checkTemplateAction(id) {
  await requireUser('admin');
  const c = await contentCompat(loadTemplateFrom(templateDir(okId(id))));
  return { docs: c.docs, errors: c.errors.slice(0, 15), errorCount: c.errors.length };
}

// Attiva un template. content: 'keep' (tiene i contenuti, se compatibili) o 'sample' (li sostituisce con quelli di esempio: cancella pagine, dati del sito e stile).
export async function activateTemplateAction({ id, content, password }) {
  const user = await requireUser('admin');
  okId(id);
  if (!['keep', 'sample'].includes(content)) throw new Error('Scelta non valida');
  const ok = await confirmPassword(user.id, password);
  if (!ok.ok) return { ok: false, error: ok.error };
  const r = await switchTemplate(id, { userId: user.id, content });
  revalidatePath('/admin', 'layout');
  return r;
}

export async function removeTemplateAction({ id, password }) {
  const user = await requireUser('admin');
  okId(id);
  const ok = await confirmPassword(user.id, password);
  if (!ok.ok) return { ok: false, error: ok.error };
  const lock = await withLock('cms-template', async () => { try { removeTemplate(id); return null; } catch (e) { return e.message; } }, 0);
  if (!lock.ok) return { ok: false, error: 'Un\'altra operazione sui template è in corso: riprova tra un momento.' };
  if (lock.value) return { ok: false, error: lock.value };
  await audit(user.id, 'template.remove', id);
  revalidatePath('/admin/templates');
  return { ok: true };
}
