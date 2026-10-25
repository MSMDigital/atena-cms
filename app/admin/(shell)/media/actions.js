'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';
import { one } from '@/lib/db.mjs';
import { ownsMedia } from '@/lib/permissions.mjs';
import { listMedia, updateAlt, updateMeta, editImage, renameMedia, UploadError, deleteMedia, mediaUsage, isSafeLogical } from '@/lib/media.mjs';

const valid = (t, p) => { if (!isSafeLogical(p)) throw new Error(t('Immagine non valida')); };
// Un autore modifica solo le immagini che ha caricato lui; un admin tutte.
const mine = async (t, user, p) => { if (!ownsMedia(user, await one('SELECT source, uploaded_by FROM media WHERE path = ?', [p]))) throw new Error(t('Puoi modificare solo le immagini che hai caricato tu.')); };

export async function refreshMediaAction() {
  await requireUser('author');
  return listMedia();
}

export async function updateAltAction(path, alt) {
  const user = await requireUser('author');
  const t = await getT();
  valid(t, path);
  await mine(t, user, path);
  if (typeof alt !== 'string') throw new Error(t('Testo non valido'));
  return { ok: await updateAlt(path, alt) };
}

export async function usageAction(path) {
  await requireUser('author');
  valid(await getT(), path);
  return mediaUsage(path);
}

export async function deleteMediaAction(path) {
  const user = await requireUser('author');
  const t = await getT();
  valid(t, path);
  await mine(t, user, path);
  const r = await deleteMedia(path);
  revalidatePath('/admin/media');
  return loc(r);
}

// Titolo, testo alternativo, didascalia e descrizione dell'immagine.
export async function updateMetaAction(path, meta) {
  const user = await requireUser('author');
  const t = await getT();
  valid(t, path);
  await mine(t, user, path);
  if (!meta || typeof meta !== 'object') throw new Error(t('Dati non validi'));
  const r = { ok: await updateMeta(path, meta) };
  revalidatePath('/admin/media');
  return r;
}

// Ritaglio e/o ridimensionamento: sul posto (stessa immagine, vale ovunque sia usata) o come nuova immagine.
export async function editImageAction(path, { crop, width, mode }) {
  const user = await requireUser('author');
  const t = await getT();
  valid(t, path);
  if (mode === 'replace') await mine(t, user, path);   // la copia si può fare da qualsiasi immagine, la modifica sul posto solo dalle proprie
  try {
    const item = await editImage(path, { crop: crop ?? null, width: width ?? null, mode }, user.id);
    revalidatePath('/admin/media');
    return { ok: true, item };
  } catch (e) {
    if (e instanceof UploadError) return loc({ ok: false, error: e.message });
    console.error('modifica immagine', e);
    return { ok: false, error: t('Errore imprevisto durante la modifica.') };
  }
}

// Nuovo nome del file: aggiorna da solo le pagine e gli articoli che usano l'immagine.
export async function renameMediaAction(path, name) {
  const user = await requireUser('author');
  const t = await getT();
  valid(t, path);
  await mine(t, user, path);
  try {
    const r = await renameMedia(path, String(name ?? ''));
    revalidatePath('/admin/media'); revalidatePath('/admin'); revalidatePath('/admin/pages'); revalidatePath('/admin/posts');
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof UploadError) return loc({ ok: false, error: e.message });
    console.error('rinomina immagine', e);
    return { ok: false, error: t('Errore imprevisto durante la rinomina.') };
  }
}
