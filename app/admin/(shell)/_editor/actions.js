'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';
import { loadData, saveDraft, createPage, createPost, trashDoc, restoreDoc, purgeDoc, getDoc, docState, publishAll } from '@/lib/docs.mjs';
import { unsafeText, deliveryProblem, htmlBlockProblem, allowedCode } from '@/lib/content-guard.mjs';
import { createTranslation } from '@/lib/languages.mjs';
import { baseOf, textOf } from '@/render/translations.mjs';
import { renderDraftPreview } from '@/lib/preview.mjs';
import { validateData } from '@/schema/validate.mjs';
import { keyOf } from '@/schema/blog.mjs';
import { LOCALES } from '@/schema/common.mjs';
import { isAdmin, canWrite, ownsDoc, AUTHOR_KINDS } from '@/lib/permissions.mjs';

const KINDS = ['page', 'site', 'shared', 'headers', 'footers', 'post', 'categories', 'tags'];
const ADMIN_ONLY = new Set(['site', 'headers', 'footers']);   // i dati del sito, gli header e i footer li cambia solo un admin
const KEY = /^[a-z0-9][a-z0-9-]*$/;
const MAX_JSON = 1_000_000;

// Controlli comuni: chi può modificare cosa, e che i dati abbiano almeno la forma giusta.
async function guard({ kind, key, data }) {
  const t = await getT();
  if (!KINDS.includes(kind)) throw new Error(t('Tipo di documento non valido'));
  const user = await requireUser(ADMIN_ONLY.has(kind) ? 'admin' : undefined);   // l'editor modifica pagine e blocchi condivisi, non i dati del sito
  if (typeof key !== 'string') throw new Error(t('Chiave non valida'));   // KEY.test coercerebbe un array (['home']) in stringa
  if ((kind === 'page' || kind === 'post') && !KEY.test(key)) throw new Error(t('Chiave non valida'));
  if (kind !== 'page' && kind !== 'post' && key !== 'main') throw new Error(t('Chiave non valida'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(t('Dati non validi'));
  if (JSON.stringify(data).length > MAX_JSON) throw new Error(t('Documento troppo grande'));
  if ((kind === 'page' || kind === 'post') && data.key !== key) throw new Error(t('La chiave non si può cambiare'));
  if (!isAdmin(user)) {   // un autore modifica solo pagine e articoli propri, già esistenti (si creano con le azioni apposite)
    if (!canWrite(user)) throw new Error(t('Non hai i permessi per modificare i contenuti.'));
    if (!AUTHOR_KINDS.has(kind)) throw new Error(t('Questo documento lo modifica solo un amministratore.'));
    const doc = await getDoc(kind, key);
    if (!doc || doc.deleted_at) throw new Error(t('Il contenuto non esiste.'));
    if (!ownsDoc(user, doc)) throw new Error(t('Puoi modificare solo i tuoi contenuti.'));
  }
  return user;
}

// Un autore (non admin) non cambia l'autore di un contenuto: lo assegna l'admin.
const keepAuthor = async (user, kind, key, data) => {
  if (isAdmin(user) || !AUTHOR_KINDS.has(kind)) return data;
  const old = (await getDoc(kind, key))?.draft?.author;
  const next = { ...data };
  if (old) next.author = old; else delete next.author;
  return next;
};

const docId = (kind, key) => (kind === 'page' || kind === 'post' ? `${kind}:${key}` : kind);

// Salva la bozza. Le bozze incomplete si possono salvare: è la pubblicazione a richiedere contenuti validi.
async function saveDocAction_({ kind, key, data: input, rev }) {
  const user = await guard({ kind, key, data: input });
  const data = await keepAuthor(user, kind, key, input);
  // Il server non si fida del browser: HTML non ammesso nei testi = niente salvataggio (l'editor vede il perché). Fanno eccezione i campi
  // di codice del motore (tracciamento, llms.txt, blocco "Codice HTML"): sono sempre riservati a un admin, controllato qui sotto.
  const bad = unsafeText(data, allowedCode(kind));
  if (bad) return { ok: false, error: `Il testo in "${bad}" contiene HTML non ammesso: si possono usare solo i pulsanti di formattazione.` };
  if (user.role !== 'admin') {
    const old = (await getDoc(kind, key))?.draft;
    const problem = deliveryProblem(kind, data, old) ?? htmlBlockProblem(kind, data, old);
    if (problem) return { ok: false, error: problem };
  }
  const r = await saveDraft(kind, key, data, user.id, { expectedRev: rev });
  ['/admin', '/admin/posts', '/admin/pages'].forEach((p) => revalidatePath(p));   // gli elenchi (stato, semaforo SEO/GEO) mostrano subito il salvataggio
  if (r.conflict) return { ok: false, conflict: r.reason, by: r.by };
  return { ok: true, changed: r.changed, rev: r.rev };
}

// Problemi del documento così com'è nell'editor (anche non salvato), nel contesto degli altri documenti.
async function validateDocAction_({ kind, key, data }) {
  await guard({ kind, key, data });
  const base = await loadData('draft');
  const isTr = kind === 'page' && !!data.translationOf;
  const pages = kind === 'page' && !isTr ? [...base.pages.filter((p) => p.key !== key), data] : base.pages;
  const translations = isTr ? [...(base.translations ?? []).filter((p) => p.key !== key), data] : base.translations;
  const isPostTr = kind === 'post' && !!data.translationOf;
  const posts = kind === 'post' && !isPostTr ? [...(base.posts ?? []).filter((p) => p.key !== key), data] : base.posts;
  const postTranslations = isPostTr ? [...(base.postTranslations ?? []).filter((p) => p.key !== key), data] : base.postTranslations;
  const { issues } = validateData({ posts, postTranslations, categories: kind === 'categories' ? data : base.categories, tags: kind === 'tags' ? data : base.tags, site: kind === 'site' ? data : base.site, shared: kind === 'shared' ? data : base.shared, pages, translations, headers: kind === 'headers' ? data : base.headers, footers: kind === 'footers' ? data : base.footers });
  const id = docId(kind, key);
  return { issues: issues.filter((i) => i.doc === id), othersBlocking: issues.filter((i) => i.doc !== id && i.severity === 'error').length };
}

async function previewDocAction_({ kind, key, data, path }) {
  await guard({ kind, key, data });
  return renderDraftPreview({ kind, key, data }, path);
}

async function createPageAction_(input) {
  const user = await requireUser('author');
  const r = await createPage({ key: String(input?.key ?? '').trim(), name: String(input?.name ?? ''), slug: String(input?.slug ?? '').trim(), parent: input?.parent || null, author: isAdmin(user) ? undefined : user.name }, user.id);
  revalidatePath('/admin');
  revalidatePath('/admin/pages');
  return r;
}

// Cestino: pagine e articoli si spostano, si ripristinano o si eliminano per sempre (solo un admin).
const TRASHABLE = new Set(['page', 'post']);
const trashArgs = async (kind, key) => { const t = await getT(); if (!TRASHABLE.has(kind) || typeof key !== 'string' || !KEY.test(key)) throw new Error(t('Richiesta non valida')); };
const refresh = () => ['/admin', '/admin/pages', '/admin/posts', '/admin/trash'].forEach((p) => revalidatePath(p));
async function trashDocAction_(kind, key) { const user = await requireUser('admin'); await trashArgs(kind, key); const r = await trashDoc(kind, key, user.id); refresh(); return r; }
async function restoreDocAction_(kind, key) { const user = await requireUser('admin'); await trashArgs(kind, key); const r = await restoreDoc(kind, key, user.id); refresh(); return r; }
async function purgeDocAction_(kind, key) { await requireUser('admin'); await trashArgs(kind, key); const r = await purgeDoc(kind, key); refresh(); return r; }
async function deletePageAction_(key) { const user = await requireUser('admin'); await trashArgs('page', key); const r = await trashDoc('page', key, user.id); refresh(); return r; }

async function createPostAction_(input) {
  const user = await requireUser('author');
  const r = await createPost({ title: String(input?.title ?? ''), slug: String(input?.slug ?? '').trim(), date: String(input?.date ?? ''), author: user.name }, user.id);
  refresh();
  return r;
}

// Pubblica / metti in bozza dall'elenco: cambia solo il campo «status» della bozza (online dopo la prossima pubblicazione).
async function setStatusAction_(kind, key, status) {
  const user = await requireUser('author');
  if (!TRASHABLE.has(kind) || typeof key !== 'string' || !KEY.test(key) || !['draft', 'published'].includes(status)) return { ok: false, error: 'Richiesta non valida' };
  const doc = await getDoc(kind, key);
  if (!doc || doc.deleted_at) return { ok: false, error: 'Non esiste.' };
  if (!ownsDoc(user, doc)) return { ok: false, error: 'Puoi modificare solo i tuoi contenuti.' };
  const r = await saveDraft(kind, key, { ...doc.draft, status }, user.id);
  refresh();
  return { ok: true, changed: r.changed };
}

// Tag (o categoria) creato al volo dall'articolo: se la chiave esiste già si riusa, altrimenti si aggiunge all'elenco (come bozza, da pubblicare col sito).
async function createTermAction_(kind, name) {
  const user = await requireUser('author');
  if (kind !== 'tags' && kind !== 'categories') return { ok: false, error: 'Richiesta non valida' };
  const label = String(name ?? '').trim().replace(/\s+/g, ' ');
  const key = keyOf(label);
  if (!label || label.length > 60 || !key) return { ok: false, error: 'Scrivi un nome (al massimo 60 caratteri, con almeno una lettera o un numero).' };
  const doc = await getDoc(kind, 'main');
  const cur = doc?.draft ?? {};
  const B = baseOf((await getDoc('site', 'main'))?.draft);
  if (Object.hasOwn(cur, key)) return { ok: true, key, name: textOf(cur[key]?.name, B, 'it') || label, existed: true };
  const r = await saveDraft(kind, 'main', { ...cur, [key]: { name: { [B]: label } } }, user.id);
  if (r.conflict) return { ok: false, error: 'Non è stato possibile salvare, riprova.' };
  revalidatePath('/admin');
  return { ok: true, key, name: label };
}

// ---- modifica rapida e di massa degli articoli (elenco) ----------------------------------------------------------------
const POST_STATUS = ['draft', 'scheduled', 'published'];
const SLUG = /^[a-z0-9-]+$/;
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;   // ore intere: il controllo delle pubblicazioni gira una volta all'ora
const keysOk = (keys) => Array.isArray(keys) && keys.length > 0 && keys.length <= 200 && keys.every((k) => typeof k === 'string' && KEY.test(k));

// «Aggiorna» della modifica rapida = pubblicazione, ma solo di quel documento (le altre bozze restano bozze). Serve un admin: un editor salva la bozza.
// Con il documento escono anche tag e categorie ancora non pubblicati (l'articolo può usarli). Restituisce { published } oppure { publishError }.
async function publishDocs(user, refs, { terms = false } = {}) {
  const t = await getT();
  if (user.role !== 'admin') return { published: false };
  const ids = new Set();
  for (const [kind, key] of refs) { const doc = await getDoc(kind, key); if (doc) ids.add(doc.id); }
  if (terms) for (const k of ['tags', 'categories']) { const d = await getDoc(k, 'main'); if (d && !d.deleted_at && docState(d) !== 'clean') ids.add(d.id); }
  if (!ids.size) return { published: false };
  const r = await publishAll(user.id, { only: ids, force: true });
  ['/admin', '/admin/posts', '/admin/pages', '/admin/tags', '/admin/categories', '/admin/trash'].forEach((p) => revalidatePath(p));
  return r.ok ? { published: true } : { publishError: [r.error, ...(r.details ?? [])].filter(Boolean).slice(0, 3).map((x) => t(x)).join(' — ') };
}
const publishOnly = (user, kind, key) => publishDocs(user, [[kind, key]], { terms: kind === 'post' });

// Titolo, autore, indirizzo (per lingua), stato (con data e ora se pianificato) di un articolo. Per un admin equivale a una pubblicazione.
async function quickEditPostAction_({ key, title, author, slug, status, publishAt }) {
  const user = await requireUser('author');
  if (typeof key !== 'string' || !KEY.test(key)) return { ok: false, error: 'Richiesta non valida' };
  const doc = await getDoc('post', key);
  if (!doc || doc.deleted_at) return { ok: false, error: 'L\'articolo non esiste.' };
  if (!ownsDoc(user, doc)) return { ok: false, error: 'Puoi modificare solo i tuoi contenuti.' };
  if (!isAdmin(user)) author = doc.draft.author;   // l'autore lo assegna l'admin
  const cur = doc.draft;
  const t = String(title ?? '').trim();
  if (!t) return { ok: false, error: 'Il titolo non può essere vuoto.' };
  if (!POST_STATUS.includes(status)) return { ok: false, error: 'Stato non valido.' };
  const B = baseOf((await loadData('draft')).site);   // la lingua dei contenuti di base
  const nextSlug = { ...cur.slug };
  for (const [l, v] of Object.entries(slug ?? {})) {
    if (!LOCALES.includes(l)) continue;
    const x = String(v ?? '').trim();
    if (x === '') { if (l === B) return { ok: false, error: 'L\'indirizzo non può essere vuoto.' }; delete nextSlug[l]; continue; }
    if (!SLUG.test(x)) return { ok: false, error: 'L\'indirizzo usa solo lettere minuscole, numeri e trattini.' };
    nextSlug[l] = x;
  }
  const others = (await loadData('draft')).posts.filter((p) => p.key !== key);
  for (const [l, x] of Object.entries(nextSlug)) if (others.some((p) => p.slug?.[l] === x)) return { ok: false, error: `L'indirizzo «${x}» è già usato da un altro articolo.` };
  const next = { ...cur, title: { ...cur.title, [B]: t }, slug: nextSlug, status };
  const a = String(author ?? '').trim().slice(0, 120);
  if (a) next.author = a; else delete next.author;
  if (status === 'scheduled') {
    if (!DT.test(String(publishAt ?? ''))) return { ok: false, error: 'Indica data e ora intera di pubblicazione (per esempio 09:00).' };
    next.publishAt = publishAt;
  } else delete next.publishAt;
  const r = await saveDraft('post', key, next, user.id);
  refresh();
  return { ok: true, changed: r.changed, ...(await publishOnly(user, 'post', key)) };
}

// Azioni su più articoli: stato, autore, categorie e tag da aggiungere, cestino (solo admin).
async function bulkPostsAction_({ keys, action, set = {} }) {
  if (!keysOk(keys)) return { ok: false, error: 'Nessun articolo selezionato.' };
  const user = await requireUser(action === 'trash' ? 'admin' : 'author');
  const catDoc = await getDoc('categories', 'main'); const tagDoc = await getDoc('tags', 'main');
  const only = (list, doc) => (Array.isArray(list) ? list.filter((k) => typeof k === 'string' && Object.hasOwn(doc?.draft ?? {}, k)) : []);
  const addCats = only(set.addCategories, catDoc); const addTags = only(set.addTags, tagDoc);
  const status = set.status && POST_STATUS.filter((x) => x !== 'scheduled').includes(set.status) ? set.status : null;   // «pianificato» ha bisogno di una data: si fa dalla modifica rapida
  const author = typeof set.author === 'string' ? set.author.trim().slice(0, 120) : '';
  let done = 0; const touched = [];
  for (const key of keys) {
    if (action === 'trash') { const r = await trashDoc('post', key, user.id); if (r?.ok !== false) { done++; touched.push(key); } continue; }
    const doc = await getDoc('post', key);
    if (!doc || doc.deleted_at || !ownsDoc(user, doc)) continue;   // un autore tocca solo i propri
    const next = { ...doc.draft };
    if (status) { next.status = status; if (status !== 'scheduled') delete next.publishAt; }
    if (author && isAdmin(user)) next.author = author;
    if (addCats.length) next.categories = [...new Set([...(next.categories ?? []), ...addCats])];
    if (addTags.length) next.tags = [...new Set([...(next.tags ?? []), ...addTags])];
    const r = await saveDraft('post', key, next, user.id);
    if (!r.conflict) { done++; touched.push(key); }
  }
  refresh();
  return { ok: true, done, ...(await publishDocs(user, touched.map((k) => ['post', k]), { terms: true })) };   // anche le azioni di massa pubblicano (solo un admin)
}

// ---- tabella di tag e categorie ------------------------------------------------------------------------------------------------
const TERMS = new Set(['tags', 'categories']);

// Nuovo termine (la chiave si ricava dal nome) o modifica di nome e descrizione di uno esistente (la chiave non cambia: è l'indirizzo e il legame con gli articoli).
async function saveTermAction_({ kind, key, name, description }) {
  const user = await requireUser('admin');
  if (!TERMS.has(kind)) return { ok: false, error: 'Richiesta non valida' };
  const label = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!label || label.length > 60) return { ok: false, error: 'Scrivi un nome (al massimo 60 caratteri).' };
  const desc = String(description ?? '').trim().slice(0, 500);
  const cur = (await getDoc(kind, 'main'))?.draft ?? {};
  let k = key;
  if (k == null) {
    k = keyOf(label);
    if (!k) return { ok: false, error: 'Il nome deve contenere almeno una lettera o un numero.' };
    if (Object.hasOwn(cur, k)) return { ok: false, error: `Esiste già: l'indirizzo «${k}» è già usato.` };
  } else if (typeof k !== 'string' || !KEY.test(k) || !Object.hasOwn(cur, k)) return { ok: false, error: 'Non esiste.' };
  const prev = cur[k] ?? {};
  const B = baseOf((await getDoc('site', 'main'))?.draft);
  const next = { ...prev, name: { ...prev.name, [B]: label } };
  if (desc) next.description = { ...prev.description, [B]: desc }; else if (prev.description) { const { [B]: _drop, ...rest } = prev.description; if (Object.keys(rest).length) next.description = rest; else delete next.description; }
  const r = await saveDraft(kind, 'main', { ...cur, [k]: next }, user.id);
  if (r.conflict) return { ok: false, error: 'Non è stato possibile salvare, riprova.' };
  ['/admin', '/admin/tags', '/admin/categories'].forEach((p) => revalidatePath(p));
  return { ok: true, key: k };
}

// Elimina uno o più termini e li toglie dagli articoli che li usano (bozze).
async function deleteTermsAction_({ kind, keys }) {
  const user = await requireUser('admin');
  if (!TERMS.has(kind) || !keysOk(keys)) return { ok: false, error: 'Richiesta non valida' };
  const cur = (await getDoc(kind, 'main'))?.draft ?? {};
  const next = { ...cur };
  for (const k of keys) delete next[k];
  await saveDraft(kind, 'main', next, user.id);
  const field = kind === 'tags' ? 'tags' : 'categories';
  for (const d of (await loadData('draft')).posts) {
    if (!(d[field] ?? []).some((k) => keys.includes(k))) continue;
    await saveDraft('post', d.key, { ...d, [field]: d[field].filter((k) => !keys.includes(k)) }, user.id);
  }
  ['/admin', '/admin/tags', '/admin/categories', '/admin/posts'].forEach((p) => revalidatePath(p));
  return { ok: true, done: keys.length };
}

// ---- pagine: modifica rapida e azioni di massa ----------------------------------------------------------------------------------
// Nome, titolo e descrizione SEO, indirizzo (per lingua), autore, stato di una pagina. Per un admin equivale a una pubblicazione.
async function quickEditPageAction_({ key, name, title, description, slug, status, author }) {
  const user = await requireUser('author');
  if (typeof key !== 'string' || !KEY.test(key)) return { ok: false, error: 'Richiesta non valida' };
  const doc = await getDoc('page', key);
  if (!doc || doc.deleted_at) return { ok: false, error: 'La pagina non esiste.' };
  if (!ownsDoc(user, doc)) return { ok: false, error: 'Puoi modificare solo i tuoi contenuti.' };
  if (!isAdmin(user)) author = doc.draft.author;   // l'autore lo assegna l'admin
  if (!['draft', 'published'].includes(status)) return { ok: false, error: 'Stato non valido.' };
  if (key === 'home' && status !== 'published') return { ok: false, error: 'La home deve restare pubblicata.' };
  const cur = doc.draft;
  const n = String(name ?? '').trim();
  if (!n) return { ok: false, error: 'Il nome non può essere vuoto.' };
  const L = cur.lang ?? 'it';   // la lingua in cui è scritta la pagina
  const nextSlug = { ...cur.slug };
  for (const [l, v] of Object.entries(slug ?? {})) {
    if (!LOCALES.includes(l)) continue;
    const x = String(v ?? '').trim();
    if (key === 'home') { nextSlug[l] = ''; continue; }   // la home ha indirizzo vuoto
    if (x === '') { if (l === L) return { ok: false, error: 'L\'indirizzo non può essere vuoto.' }; delete nextSlug[l]; continue; }
    if (!SLUG.test(x)) return { ok: false, error: 'L\'indirizzo usa solo lettere minuscole, numeri e trattini.' };
    nextSlug[l] = x;
  }
  if (key !== 'home') {
    const others = (await loadData('draft')).pages.filter((p) => p.key !== key && (p.parent ?? null) === (cur.parent ?? null));
    for (const [l, x] of Object.entries(nextSlug)) if (others.some((p) => p.slug?.[l] === x)) return { ok: false, error: `L\'indirizzo «${x}» è già usato da un\'altra pagina allo stesso livello.` };
  }
  const next = { ...cur, name: { ...cur.name, [L]: n }, slug: nextSlug, status };
  const t = String(title ?? '').trim(); const d = String(description ?? '').trim();
  if (t) next.title = { ...cur.title, [L]: t.slice(0, 300) };
  if (d) next.description = { ...cur.description, [L]: d.slice(0, 2000) };
  const a = String(author ?? '').trim().slice(0, 120);
  if (a) next.author = a; else delete next.author;
  const r = await saveDraft('page', key, next, user.id);
  refresh();
  return { ok: true, changed: r.changed, ...(await publishOnly(user, 'page', key)) };
}

// Azioni su più pagine: stato, autore, cestino (solo admin). La home non si mette in bozza né nel cestino.
async function bulkPagesAction_({ keys, action, set = {} }) {
  const t = await getT();
  if (!keysOk(keys)) return { ok: false, error: 'Nessuna pagina selezionata.' };
  const user = await requireUser(action === 'trash' ? 'admin' : 'author');
  const status = ['draft', 'published'].includes(set.status) ? set.status : null;
  const author = typeof set.author === 'string' ? set.author.trim().slice(0, 120) : '';
  let done = 0; const skipped = []; const touched = [];
  for (const key of keys) {
    if (action === 'trash') { const r = await trashDoc('page', key, user.id); if (r?.ok) { done++; touched.push(key); } else skipped.push(`${key}: ${t(r?.error ?? 'non riuscito')}`); continue; }
    const doc = await getDoc('page', key);
    if (!doc || doc.deleted_at || !ownsDoc(user, doc)) continue;   // un autore tocca solo le proprie
    const next = { ...doc.draft };
    if (status) { if (key === 'home' && status !== 'published') { skipped.push(`home: ${t('deve restare pubblicata')}`); continue; } next.status = status; }
    if (author && isAdmin(user)) next.author = author;
    const r = await saveDraft('page', key, next, user.id);
    if (!r.conflict) { done++; touched.push(key); }
  }
  refresh();
  return { ok: true, done, skipped, ...(await publishDocs(user, touched.map((k) => ['page', k]))) };
}

// Crea (in bozza) la versione di una pagina in una lingua attiva.
async function createTranslationAction_(baseKey, lang, kind = 'page') {
  const user = await requireUser('author');
  if (!TRASHABLE.has(kind) || typeof baseKey !== 'string' || !KEY.test(baseKey) || !LOCALES.includes(lang)) return { ok: false, error: 'Richiesta non valida' };
  const doc = await getDoc(kind, baseKey);
  if (!doc || doc.deleted_at || !ownsDoc(user, doc)) return { ok: false, error: kind === 'post' ? "L'articolo non esiste." : 'La pagina non esiste.' };
  const r = await createTranslation(baseKey, lang, user.id, kind);
  refresh();
  return r;
}

// ---- esportazioni: i messaggi che tornano al browser passano da loc() (lingua del CMS) ----
export async function saveDocAction(...a) { return loc(await saveDocAction_(...a)); }
export async function validateDocAction(...a) { return validateDocAction_(...a); }
export async function previewDocAction(...a) { return loc(await previewDocAction_(...a)); }
export async function createPageAction(...a) { return loc(await createPageAction_(...a)); }
export async function trashDocAction(...a) { return loc(await trashDocAction_(...a)); }
export async function restoreDocAction(...a) { return loc(await restoreDocAction_(...a)); }
export async function purgeDocAction(...a) { return loc(await purgeDocAction_(...a)); }
export async function deletePageAction(...a) { return loc(await deletePageAction_(...a)); }
export async function createPostAction(...a) { return loc(await createPostAction_(...a)); }
export async function setStatusAction(...a) { return loc(await setStatusAction_(...a)); }
export async function createTermAction(...a) { return loc(await createTermAction_(...a)); }
export async function quickEditPostAction(...a) { return loc(await quickEditPostAction_(...a)); }
export async function bulkPostsAction(...a) { return loc(await bulkPostsAction_(...a)); }
export async function saveTermAction(...a) { return loc(await saveTermAction_(...a)); }
export async function deleteTermsAction(...a) { return loc(await deleteTermsAction_(...a)); }
export async function quickEditPageAction(...a) { return loc(await quickEditPageAction_(...a)); }
export async function bulkPagesAction(...a) { return loc(await bulkPagesAction_(...a)); }
export async function createTranslationAction(...a) { return loc(await createTranslationAction_(...a)); }
