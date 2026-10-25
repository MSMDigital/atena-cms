'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';
import { saveMailSettings, deleteMailSettings, mailSettingsView, saveMailRecipients } from '@/lib/settings.mjs';
import { sendTestMail } from '@/lib/mail.mjs';

const EMAIL = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]{2,}$/;

// Salva i parametri. Restituisce sempre la vista aggiornata (senza password) o gli errori per campo.
export async function saveMailSettingsAction(input) {
  const user = await requireUser('admin');
  const r = await saveMailSettings(input, user.id);
  revalidatePath('/admin/email');
  return r.ok ? { ok: true, view: await mailSettingsView() } : await loc(r);
}

// Rimuove le impostazioni salvate (si torna alle variabili .env, se ci sono).
export async function deleteMailSettingsAction() {
  await requireUser('admin');
  await deleteMailSettings();
  revalidatePath('/admin/email');
  return { ok: true, view: await mailSettingsView() };
}

// Email di prova con le impostazioni SALVATE, all'indirizzo indicato.
export async function sendTestMailAction(to) {
  await requireUser('admin');
  const t = await getT();
  const addr = typeof to === 'string' ? to.trim() : '';
  if (!EMAIL.test(addr) || addr.length > 254) return { ok: false, error: t('Indirizzo non valido.') };
  return loc(await sendTestMail(addr));
}

// Gli indirizzi che ricevono le richieste dei moduli (valgono per i moduli senza destinatari propri).
export async function saveMailRecipientsAction(input) {
  const user = await requireUser('admin');
  const r = await saveMailRecipients(input, user.id);
  revalidatePath('/admin/email');
  return loc(r);
}

