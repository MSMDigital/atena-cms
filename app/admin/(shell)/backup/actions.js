'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';
import { confirmPassword } from '@/lib/sessions.mjs';
import { createBackup, deleteBackup, restoreBackup, backupPath, restoreFilePath, PACKAGE_NAME } from '@/lib/backup.mjs';
import fs from 'node:fs';

const refresh = () => revalidatePath('/admin/backup');

// Crea il pacchetto di backup (database, immagini, template attivo e, a scelta, sito pubblicato e chiave delle password email).
export async function createBackupAction({ includeSite = true, includeSecrets = false } = {}) {
  const user = await requireUser('admin');
  try { const r = await createBackup({ includeSite: !!includeSite, includeSecrets: !!includeSecrets, userId: user.id }); refresh(); return { ok: true, name: r.name, size: r.size }; }
  catch (e) { return loc({ ok: false, error: String(e.message).slice(0, 300) }); }
}

export async function deleteBackupAction(name) {
  await requireUser('admin');
  const t = await getT();
  const ok = deleteBackup(String(name));
  refresh();
  return ok ? { ok: true } : { ok: false, error: t('Il backup non esiste.') };
}

// Ripristino: sostituisce database, immagini e sito con quelli del pacchetto. Serve la password dell'admin e la parola «RIPRISTINA»;
// prima si crea da solo un backup di sicurezza. `source`: 'package' (creato qui) o 'upload' (caricato in data/restore).
export async function restoreBackupAction({ source, name, password, phrase }) {
  const user = await requireUser('admin');
  const t = await getT();
  if (phrase !== 'RIPRISTINA') return { ok: false, error: t('Per confermare scrivi la parola RIPRISTINA.') };
  const file = source === 'upload' ? restoreFilePath(name) : backupPath(name);
  if (!file || !fs.existsSync(file)) return { ok: false, error: t('Il pacchetto non esiste.') };
  const c = await confirmPassword(user.id, password);
  if (!c.ok) return loc({ ok: false, error: c.error });
  try {
    const r = await restoreBackup(file, { userId: user.id });
    return { ok: true, safety: r.safety, secretsReset: r.secretsReset, created: r.manifest.createdAt };
  } catch (e) { return loc({ ok: false, error: String(e.message).slice(0, 400) }); }
}
