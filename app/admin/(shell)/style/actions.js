'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import { saveDraft } from '@/lib/docs.mjs';
import { validateTokens } from '@/render/tokens.mjs';

// Salva la bozza dei token. Il sito online non cambia finché non si pubblica.
export async function saveTokensAction(tokens, rev) {
  const user = await requireUser('admin');
  const t = await getT();
  const errors = validateTokens(tokens);
  if (errors.length) return { ok: false, errors };
  const r = await saveDraft('tokens', 'main', tokens, user.id, { expectedRev: rev });
  revalidatePath('/admin');
  if (r.conflict) return { ok: false, conflict: true, errors: [t('{by} ha modificato lo stile nel frattempo: ricarica la pagina.', { by: r.by ?? t('Qualcun altro') })] };
  return { ok: true, changed: r.changed, rev: r.rev };
}
