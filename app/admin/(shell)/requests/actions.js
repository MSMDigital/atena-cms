'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { setSubmissionStatus, deleteSubmission } from '@/lib/requests.mjs';
import { notifySubmission } from '@/lib/forms.mjs';
import { loc } from '@/lib/i18n-server.mjs';

const idOf = (id) => { const n = Number(id); if (!Number.isInteger(n) || n < 1) throw new Error('Richiesta non valida'); return n; };

export async function setRequestStatusAction(id, status) {
  await requireUser('admin');
  const ok = await setSubmissionStatus(idOf(id), status);
  revalidatePath('/admin', 'layout');
  return { ok };
}

// Rinvia l'email (dopo un errore o una configurazione mancante).
export async function resendRequestMailAction(id) {
  await requireUser('admin');
  const r = await notifySubmission(idOf(id));
  revalidatePath(`/admin/requests/${idOf(id)}`);
  return loc({ ok: r.ok, status: r.status, error: r.error ?? null });
}

// Eliminazione definitiva: solo admin (sono dati personali, la conservazione va decisa da chi risponde del sito).
export async function deleteRequestAction(id) {
  await requireUser('admin');
  const ok = await deleteSubmission(idOf(id));
  revalidatePath('/admin', 'layout');
  return { ok };
}
