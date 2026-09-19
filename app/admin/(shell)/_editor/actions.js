'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { loadData, saveDraft, createPage, deletePage, getDoc } from '@/lib/docs.mjs';
import { unsafeText, deliveryProblem } from '@/lib/content-guard.mjs';
import { renderDraftPreview } from '@/lib/preview.mjs';
import { validateData } from '@/schema/validate.mjs';

const KINDS = ['page', 'site', 'shared'];
const KEY = /^[a-z0-9][a-z0-9-]*$/;
const MAX_JSON = 1_000_000;

// Controlli comuni: chi può modificare cosa, e che i dati abbiano almeno la forma giusta.
async function guard({ kind, key, data }) {
  if (!KINDS.includes(kind)) throw new Error('Tipo di documento non valido');
  const user = await requireUser(kind === 'site' ? 'admin' : undefined);   // l'editor modifica pagine e blocchi condivisi, non i dati del sito
  if (typeof key !== 'string') throw new Error('Chiave non valida');   // KEY.test coercerebbe un array (['home']) in stringa
  if (kind === 'page' && !KEY.test(key)) throw new Error('Chiave non valida');
  if (kind !== 'page' && key !== 'main') throw new Error('Chiave non valida');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dati non validi');
  if (JSON.stringify(data).length > MAX_JSON) throw new Error('Documento troppo grande');
  if (kind === 'page' && data.key !== key) throw new Error('La chiave della pagina non si può cambiare');
  return user;
}

const docId = (kind, key) => (kind === 'page' ? `page:${key}` : kind);

// Salva la bozza. Le bozze incomplete si possono salvare: è la pubblicazione a richiedere contenuti validi.
export async function saveDocAction({ kind, key, data, rev }) {
  const user = await guard({ kind, key, data });
  // Il server non si fida del browser: HTML non ammesso nei testi = niente salvataggio (l'editor vede il perché).
  const bad = unsafeText(data);
  if (bad) return { ok: false, error: `Il testo in "${bad}" contiene HTML non ammesso: si possono usare solo i pulsanti di formattazione.` };
  if (user.role !== 'admin') {
    const problem = deliveryProblem(kind, data, (await getDoc(kind, key))?.draft);
    if (problem) return { ok: false, error: problem };
  }
  const r = await saveDraft(kind, key, data, user.id, { expectedRev: rev });
  revalidatePath('/admin');
  if (r.conflict) return { ok: false, conflict: r.reason, by: r.by };
  return { ok: true, changed: r.changed, rev: r.rev };
}

// Problemi del documento così com'è nell'editor (anche non salvato), nel contesto degli altri documenti.
export async function validateDocAction({ kind, key, data }) {
  await guard({ kind, key, data });
  const base = await loadData('draft');
  const pages = kind === 'page' ? [...base.pages.filter((p) => p.key !== key), data] : base.pages;
  const { issues } = validateData({ site: kind === 'site' ? data : base.site, shared: kind === 'shared' ? data : base.shared, pages });
  const id = docId(kind, key);
  return { issues: issues.filter((i) => i.doc === id), othersBlocking: issues.filter((i) => i.doc !== id && i.severity === 'error').length };
}

export async function previewDocAction({ kind, key, data, path }) {
  await guard({ kind, key, data });
  return renderDraftPreview({ kind, key, data }, path);
}

export async function createPageAction(input) {
  const user = await requireUser();
  const r = await createPage({ key: String(input?.key ?? '').trim(), name: String(input?.name ?? ''), slug: String(input?.slug ?? '').trim(), parent: input?.parent || null }, user.id);
  revalidatePath('/admin');
  revalidatePath('/admin/pages');
  return r;
}

export async function deletePageAction(key) {
  const user = await requireUser('admin');
  if (typeof key !== 'string' || !KEY.test(key)) return { ok: false, error: 'Chiave non valida' };
  const r = await deletePage(key, user.id);
  revalidatePath('/admin');
  revalidatePath('/admin/pages');
  return r;
}
