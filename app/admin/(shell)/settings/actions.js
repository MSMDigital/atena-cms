'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';
import { saveGeneral } from '@/lib/general.mjs';
import { applyLocales } from '@/lib/languages.mjs';

const refresh = () => ['/admin', '/admin/settings/general', '/admin/settings/languages', '/admin/site'].forEach((p) => revalidatePath(p, 'layout'));

// Impostazioni generali: email dell'amministrazione, fuso orario, formati, primo giorno della settimana, lingua dell'admin.
export async function saveGeneralAction(input) {
  const user = await requireUser('admin');
  const r = await saveGeneral(input, user.id);
  refresh();
  return r.ok ? { ok: true } : loc(r);
}

// Lingue del sito: quali sono attive, quale è predefinita e il codice di ciascuna (html lang, og:locale). Si scrive nella bozza dei dati del sito:
// le lingue nuove escono con «Pubblica».
export async function saveLocalesAction({ enabled, default: def, tags, baseLang }) {
  const user = await requireUser('admin');
  const t = await getT();
  const r = await applyLocales({ enabled, def, tags, baseLang }, user.id);
  refresh();
  ['/admin/pages', '/admin/trash'].forEach((p) => revalidatePath(p));
  if (r.conflict) return { ok: false, error: t('Qualcuno ha modificato i dati del sito nel frattempo: ricarica la pagina.') };
  return loc(r);
}
