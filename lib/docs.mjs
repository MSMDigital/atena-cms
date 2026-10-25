// Contenuti nel database: token, dati del sito, blocchi condivisi e pagine. Ogni documento ha una bozza e una versione pubblicata.
import fs from 'node:fs';
import path from 'node:path';
import { query, one, tx, withLock, parseJson, toJson } from './db.mjs';
import { ROOT } from './env.mjs';
import { buildSite, BuildError } from '../render/build.mjs';
import { requireTemplate } from './template.mjs';
import { validateTokens } from '../render/tokens.mjs';
import { findPageRefs } from './refs.mjs';
import { zurichNow } from '../schema/blog.mjs';
import { mediaDir } from './media.mjs';
import { publicAuthors } from './users.mjs';
import { getGeneral, publicGeneral } from './general.mjs';
import { makeTranslation, translationKey, baseOf, textOf, renameLocale } from '../render/translations.mjs';

const row = (d) => d && ({ ...d, draft: parseJson(d.draft), published: parseJson(d.published) });

export async function getDoc(kind, key) {
  return row(await one('SELECT * FROM docs WHERE kind = ? AND doc_key = ?', [kind, key]));
}

// Stato di un documento: 'unpublished' (mai online), 'modified' (bozza diversa da quella online), 'clean', 'deleted' (nel cestino ma ancora online:
// sparirà dal sito alla prossima pubblicazione), 'trashed' (nel cestino, non più online: si può ripristinare o eliminare per sempre).
export const docState = (d) => (d.deleted_at ? (d.published == null ? 'trashed' : 'deleted') : d.published == null ? 'unpublished' : toJson(d.draft) === toJson(d.published) ? 'clean' : 'modified');

// Assembla i dati del sito da bozze o da versioni pubblicate. Con 'published' i documenti mai pubblicati restano fuori.
// `draftIds`: con state 'published', i documenti con questi id si prendono comunque dalla bozza (pubblicazione di pochi documenti, come gli articoli pianificati).
export async function loadData(state = 'draft', { draftIds = null } = {}) {
  const docs = (await query('SELECT * FROM docs')).map(row).filter((d) => state !== 'draft' || !d.deleted_at);
  const pick = (d) => (state === 'draft' || draftIds?.has(d.id) ? d.draft : d.published);
  const data = { site: null, tokens: null, shared: {}, pages: [], translations: [], posts: [], postTranslations: [] };   // translations: le versioni per lingua delle pagine (render/translations.mjs)
  for (const d of docs) {
    if (d.deleted_at && draftIds?.has(d.id)) continue;   // spostato nel cestino e pubblicato ora: sparisce dal sito
    const v = pick(d);
    if (v == null) continue;
    if (d.kind === 'tokens') data.tokens = v; else if (d.kind === 'site') data.site = v; else if (d.kind === 'shared') data.shared = v; else if (d.kind === 'post') (v.translationOf ? data.postTranslations : data.posts).push(v); else if (d.kind === 'categories') data.categories = v; else if (d.kind === 'tags') data.tags = v; else if (d.kind === 'headers') data.headers = v; else if (d.kind === 'footers') data.footers = v; else if (v.translationOf) data.translations.push(v); else data.pages.push(v);
  }
  data.settings = publicGeneral(await getGeneral());   // fuso, formati di data e ora (mai l'email dell'amministrazione)
  data.authors = await publicAuthors();   // profili pubblici degli autori (mai email né password)
  data.posts.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || a.key.localeCompare(b.key));
  data.pages.sort((a, b) => (a.key === 'home' ? -1 : b.key === 'home' ? 1 : a.key.localeCompare(b.key)));
  return data;
}

export async function listDocs() {
  return (await query('SELECT id, kind, doc_key, draft, published, draft_updated_at, published_at, rev, deleted_at, created_by FROM docs ORDER BY kind, doc_key')).map(row).map((d) => ({ id: d.id, createdBy: d.created_by, kind: d.kind, key: d.doc_key, state: docState(d), deletedAt: d.deleted_at, draftUpdatedAt: d.draft_updated_at, publishedAt: d.published_at, rev: d.rev, data: d.draft }));
}

// Salva la bozza. Non fa nulla (e non crea revisioni) se il contenuto non è cambiato.
// Con `expectedRev` rileva le modifiche concorrenti: se nel frattempo qualcun altro ha salvato, non scrive e restituisce { conflict: true }.
export async function saveDraft(kind, key, data, userId, { expectedRev } = {}) {
  const json = toJson(data);
  return tx(async (t) => {
    const cur = (await t.query('SELECT id, draft, rev, deleted_at FROM docs WHERE kind = ? AND doc_key = ? FOR UPDATE', [kind, key]))[0];
    if (!cur) {
      if (expectedRev != null) return { conflict: true, reason: 'missing' };
      const r = await t.query('INSERT INTO docs (kind, doc_key, draft, draft_updated_by, created_by) VALUES (?, ?, ?, ?, ?)', [kind, key, json, userId, userId]);   // chi lo salva per primo è il proprietario
      await t.query('INSERT INTO doc_revisions (doc_id, data, action, created_by) VALUES (?, ?, ?, ?)', [r.insertId, json, 'save', userId]);
      return { changed: true, rev: 1 };
    }
    if (cur.deleted_at) return { conflict: true, reason: 'deleted' };
    if (expectedRev != null && cur.rev !== expectedRev) {
      const by = (await t.query('SELECT u.name FROM docs d LEFT JOIN users u ON u.id = d.draft_updated_by WHERE d.id = ?', [cur.id]))[0]?.name;
      return { conflict: true, reason: 'rev', rev: cur.rev, by };
    }
    if (cur.draft === json) return { changed: false, rev: cur.rev };
    await t.query('UPDATE docs SET draft = ?, rev = rev + 1, draft_updated_at = UTC_TIMESTAMP(), draft_updated_by = ? WHERE id = ?', [json, userId, cur.id]);
    await t.query('INSERT INTO doc_revisions (doc_id, data, action, created_by) VALUES (?, ?, ?, ?)', [cur.id, json, 'save', userId]);
    return { changed: true, rev: cur.rev + 1 };
  });
}

export async function revisions(kind, key, limit = 20) {
  const d = await one('SELECT id FROM docs WHERE kind = ? AND doc_key = ?', [kind, key]);
  if (!d) return [];
  return (await query('SELECT r.id, r.action, r.created_at, u.name AS by_name FROM doc_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE r.doc_id = ? ORDER BY r.id DESC LIMIT ?', [d.id, limit]));
}

export async function revisionData(id) {
  const r = await one('SELECT data FROM doc_revisions WHERE id = ?', [id]);
  return r ? parseJson(r.data) : null;
}

export const outDir = () => path.resolve(process.env.SITE_OUT_DIR ?? path.join(ROOT, 'dist'));

// Pubblica tutte le bozze: costruisce il sito in una cartella temporanea e, solo se va a buon fine, la mette online e segna i documenti come pubblicati.
// Con dati non validi non cambia né il sito né lo stato dei documenti.
export async function publishAll(userId, { force = false, only = null } = {}) {
  // Una pubblicazione alla volta (anche tra processi): due build insieme si pesterebbero le cartelle.
  const run = await withLock('cms-publish', () => publishOnce(userId, { force, only }), 0);
  return run.ok ? run.value : { ok: false, error: "Un'altra pubblicazione è in corso", details: ['riprova tra un momento'], changed: [] };
}

async function publishOnce(userId, { force, only = null }) {
  const docs = (await query('SELECT * FROM docs')).map(row);
  const changed = docs.filter((d) => (!only || only.has(d.id)) && !['clean', 'trashed'].includes(docState(d)));   // include i documenti nel cestino ancora online: spariranno dal sito
  if (!changed.length && !force) return { ok: true, nothing: true, changed: [] };
  const names = changed.map((d) => `${d.kind}:${d.doc_key}${d.deleted_at ? ' (eliminata)' : ''}`);

  const data = only ? await loadData('published', { draftIds: only }) : await loadData('draft');   // `only`: il resto del sito resta com'è online
  const tmp = path.join(ROOT, `.dist-tmp-${process.pid}-${Date.now()}`);   // nome proprio: mai la cartella di un'altra pubblicazione
  let result;
  try {
    if (!data.tokens || !data.site) throw new BuildError('Mancano i dati del sito o i token', ['esegui npm run db:seed']);
    result = await buildSite(data, { outDir: tmp, mediaDir: mediaDir(), fontCacheDir: path.join(ROOT, '.cache/fonts') });
  } catch (e) {
    const details = e instanceof BuildError ? e.details : [String(e.message ?? e)];
    await query('INSERT INTO publications (created_by, status, pages, changed, log) VALUES (?, ?, ?, ?, ?)', [userId, 'failed', 0, names.join(', ').slice(0, 65000), [e.message, ...details].join('\n').slice(0, 65000)]);
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: false, error: e.message, details, changed: names };
  }

  const dest = outDir();
  // Scambio con due rename (il sito non resta mai senza pagine); se la cartella è un punto di mount e non si può rinominare, si ricade sul vecchio metodo.
  const old = `${dest}.old-${process.pid}`;
  const cleanOld = () => { try { fs.rmSync(old, { recursive: true, force: true }); } catch (e) { console.error('pubblicazione: la vecchia copia non si cancella', old, e?.message); } };   // un residuo da ripulire non è un errore di pubblicazione
  cleanOld();
  try {
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    fs.renameSync(tmp, dest);
  } catch {
    // Lo scambio non è riuscito (per esempio punto di mount): si copia. Qui `tmp` esiste ancora, perché è lo scambio a spostarlo.
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(tmp, dest, { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  cleanOld();

  await tx(async (t) => {
    for (const d of changed) {
      if (d.deleted_at) { await t.query('UPDATE docs SET published = NULL, published_at = NULL WHERE id = ?', [d.id]); continue; }   // resta nel cestino, ma non è più online
      await t.query('UPDATE docs SET published = draft, published_at = UTC_TIMESTAMP(), published_by = ? WHERE id = ?', [userId, d.id]);
      await t.query('INSERT INTO doc_revisions (doc_id, data, action, created_by) VALUES (?, ?, ?, ?)', [d.id, toJson(d.draft), 'publish', userId]);
    }
    await t.query('INSERT INTO publications (created_by, status, pages, changed, log) VALUES (?, ?, ?, ?, ?)', [userId, 'ok', result.pages, names.join(', ').slice(0, 65000), [result.fontNote, ...result.warnings].join('\n').slice(0, 65000)]);
  });
  return { ok: true, pages: result.pages, changed: names, warnings: result.warnings, outDir: dest };
}

// Articoli pianificati: se qualcuno è arrivato all'ora dopo l'ultimo build, si rifà il sito. Si pubblica solo la bozza di quegli articoli
// (le altre modifiche in sospeso restano bozze); il build mostra l'articolo perché la sua ora è passata. Da chiamare ogni minuto circa.
export async function publishDue(now = new Date()) {
  const last = await one('SELECT created_at FROM publications ORDER BY id DESC LIMIT 1');
  const tz = (await getGeneral()).timezone;
  const lastLocal = last ? zurichNow(new Date(last.created_at), tz) : '';   // nessuna pubblicazione registrata (sito appena installato): vale qualsiasi ora passata
  const nowLocal = zurichNow(now, tz);
  const due = (await query("SELECT * FROM docs WHERE kind = 'post' AND deleted_at IS NULL")).map(row)
    .filter((d) => d.draft?.status === 'scheduled' && d.draft.publishAt && d.draft.publishAt <= nowLocal && d.draft.publishAt > lastLocal);
  if (!due.length) return { ok: true, nothing: true };
  const r = await publishAll(null, { only: new Set(due.map((d) => d.id)), force: true });
  if (!r.ok) {   // nessuno guarda: si avvisa l'amministrazione
    const { notifyAdmin } = await import('./mail.mjs');
    await notifyAdmin('Pubblicazione pianificata non riuscita', `La pubblicazione automatica degli articoli pianificati non è riuscita.\n\n${[r.error, ...(r.details ?? [])].filter(Boolean).slice(0, 6).join('\n')}\n\nIl sito online non è cambiato. Correggi gli errori e premi «Pubblica» nell'admin.`);
  }
  return r;   // force: l'articolo può già essere «pubblicato» (nascosto) e il sito va rifatto lo stesso   // un fallimento resta nello storico delle pubblicazioni e non si ripete da solo
}

export async function lastPublication() {
  return one('SELECT p.id, p.created_at, p.status, p.pages, p.changed, u.name AS by_name FROM publications p LEFT JOIN users u ON u.id = p.created_by ORDER BY p.id DESC LIMIT 1');
}

// Importa i file del template (tokens.json, content/) nel database. Senza `force` non tocca i documenti già presenti.
export async function seedFromFiles({ userId = null, force = false, template = requireTemplate(), siteUrl = null } = {}) {
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const c = (f) => path.join(template.contentDir, f);
  const items = [
    ['tokens', 'main', read(template.tokensFile)],
    ['site', 'main', read(c('site.json'))],
    ['shared', 'main', read(c('shared.json'))],
    ...['headers', 'footers', 'categories', 'tags'].filter((k) => fs.existsSync(c(`${k}.json`))).map((k) => [k, 'main', read(c(`${k}.json`))]),
    ...(fs.existsSync(c('posts')) ? fs.readdirSync(c('posts')).filter((f) => f.endsWith('.json')).sort().map((f) => { const p = read(c(`posts/${f}`)); return ['post', p.key, p]; }) : []),   // solo nei template che scorporano header e footer
    ...fs.readdirSync(c('pages')).filter((f) => f.endsWith('.json')).sort().map((f) => { const p = read(c(`pages/${f}`)); return ['page', p.key, p]; }),
  ];
  if (siteUrl) items[1][2].siteUrl = siteUrl;   // installazione: l'indirizzo pubblico scelto al posto di quello di esempio
  const errors = validateTokens(items[0][2]);
  if (errors.length) throw new Error('tokens.json non valido: ' + errors.join('; '));
  let inserted = 0, updated = 0, skipped = 0;
  for (const [kind, key, data] of items) {
    const json = toJson(data);
    await tx(async (t) => {
      const cur = (await t.query('SELECT id FROM docs WHERE kind = ? AND doc_key = ? FOR UPDATE', [kind, key]))[0];
      if (cur && !force) { skipped++; return; }
      if (cur) {
        await t.query('UPDATE docs SET draft = ?, published = ?, rev = rev + 1, deleted_at = NULL, draft_updated_at = UTC_TIMESTAMP(), draft_updated_by = ?, published_at = UTC_TIMESTAMP(), published_by = ? WHERE id = ?', [json, json, userId, userId, cur.id]);
        await t.query('INSERT INTO doc_revisions (doc_id, data, action, created_by) VALUES (?, ?, ?, ?)', [cur.id, json, 'import', userId]);
        updated++;
      } else {
        const r = await t.query('INSERT INTO docs (kind, doc_key, draft, published, draft_updated_by, published_at, published_by) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)', [kind, key, json, json, userId, userId]);
        await t.query('INSERT INTO doc_revisions (doc_id, data, action, created_by) VALUES (?, ?, ?, ?)', [r.insertId, json, 'import', userId]);
        inserted++;
      }
    });
  }
  return { inserted, updated, skipped };
}

// Siti già in uso con un template che scorpora header e footer: se i documenti non esistono ancora, li crea (in bozza) dai contenuti di esempio del
// template, riempiendo ciò che si può dai dati del sito (convenzione sui nomi: header.brandName e header.nav da site.brand.name e site.nav,
// footer.text e footer.legal da site.footer). Finché non si pubblica, il sito continua a usare i dati del sito, come prima.
export async function ensureLayoutDocs(userId, template = requireTemplate()) {
  const site = (await getDoc('site', 'main'))?.draft ?? {};
  const fill = {
    headers: (e, props) => { if (props.brandName && site.brand?.name) e.brandName = site.brand.name; if (props.nav && Array.isArray(site.nav)) e.nav = site.nav; },
    footers: (e, props) => { if (props.text && site.footer?.text) e.text = site.footer.text; if (props.legal && Array.isArray(site.footer?.legal)) e.legal = site.footer.legal; },
  };
  const created = [];
  for (const [kind, one] of [['headers', template.schema.header], ['footers', template.schema.footer]]) {
    if (!one?.properties || await getDoc(kind, 'main')) continue;
    const file = path.join(template.contentDir, `${kind}.json`);
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    for (const e of Object.values(data)) fill[kind](e, one.properties);
    await saveDraft(kind, 'main', data, userId);
    created.push(kind);
  }
  return created;
}

// ---- pagine: creazione, eliminazione, riferimenti -------------------------------------------------

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const SLUG_RE = /^[a-z0-9-]+$/;

// Crea una pagina in bozza, vuota. La chiave non si cambia più (i link la usano); l'indirizzo sì.
export async function createPage({ key, name, slug, parent, author }, userId) {
  if (key === 'new' || key === NOT_FOUND_KEY) return { ok: false, error: `La chiave «${key}» è riservata.` };
  if (!KEY_RE.test(key ?? '') || String(key).includes('--')) return { ok: false, error: 'La chiave può contenere solo lettere minuscole, numeri e trattini (un trattino alla volta: «--» è riservato alle lingue).' };
  if (!name?.trim()) return { ok: false, error: 'Serve un nome.' };
  if (!SLUG_RE.test(slug ?? '')) return { ok: false, error: "L'indirizzo può contenere solo lettere minuscole, numeri e trattini." };
  const docs = (await query("SELECT doc_key, draft, deleted_at FROM docs WHERE kind = 'page'")).map(row);
  const site = (await getDoc('site', 'main'))?.draft;
  if (docs.some((d) => d.doc_key === key)) return { ok: false, error: docs.find((d) => d.doc_key === key).deleted_at ? `La pagina "${key}" è nel cestino: ripristinala o eliminala per sempre.` : `Esiste già una pagina con chiave "${key}".` };
  const live = docs.filter((d) => !d.deleted_at).map((d) => d.draft).filter((p) => !p.translationOf);
  if (parent && !live.some((p) => p.key === parent)) return { ok: false, error: 'La pagina padre non esiste.' };
  if (live.some((p) => (p.parent ?? null) === (parent || null) && (p.slug?.[site?.locales?.base ?? 'it'] ?? p.slug?.it) === slug)) return { ok: false, error: 'Esiste già una pagina con questo indirizzo allo stesso livello.' };
  const page = {
    key, status: 'draft', slug: { it: slug }, parent: parent || null,
    name: { it: name.trim() }, title: { it: name.trim() }, description: { it: '' }, blocks: [],
    ...(author ? { author } : {}),
  };
  const base = site?.locales?.base ?? 'it';
  if (base !== 'it') { page.slug = { [base]: slug }; page.name = { [base]: name.trim() }; page.title = { [base]: name.trim() }; page.description = { [base]: '' }; }
  if (site?.locales?.base) page.lang = base;
  await saveDraft('page', key, page, userId);
  await ensureTranslations(page, site, userId);
  return { ok: true, key };
}

// Per ogni lingua attiva oltre a quella di base crea (in bozza) la versione della pagina che ancora non c'è. `only`: solo queste lingue.
export async function ensureTranslations(page, site, userId, only = null, kind = 'page') {
  const base = site?.locales?.base;
  if (!base || page.translationOf) return [];
  const created = [];
  for (const lang of site.locales.enabled ?? []) {
    if (lang === base || (only && !only.includes(lang))) continue;
    const key = translationKey(page.key, lang);
    if (await one('SELECT id FROM docs WHERE kind = ? AND doc_key = ?', [kind, key])) continue;
    await saveDraft(kind, key, makeTranslation(page, base, lang), userId);
    created.push(key);
  }
  return created;
}

// La pagina 404 («Impostazioni → 404»): un normale documento pagina con la chiave «404». Non compare tra le pagine, non entra nella sitemap e il
// build la scrive come 404.html (anche per lingua: en/404.html), che il server mostra con stato 404 per ogni indirizzo che non esiste.
export const NOT_FOUND_KEY = '404';
export const isNotFoundKey = (k) => k === NOT_FOUND_KEY || String(k).startsWith(`${NOT_FOUND_KEY}--`);

// Contenuto di partenza se il template non porta il suo (content/pages/404.json): una pagina con un solo blocco «Codice HTML», valido in ogni template.
const FALLBACK_404 = () => ({
  key: NOT_FOUND_KEY, status: 'published', noindex: true, slug: { it: '404' }, name: { it: 'Pagina non trovata' }, title: { it: 'Pagina non trovata (404)' },
  description: { it: 'La pagina che cerchi non esiste o è stata spostata.' },
  blocks: [{ id: '404-1-html', type: 'html', surface: 'light', html: '<div style="max-width:40rem;margin:0 auto;padding:6rem 1.5rem;text-align:center;font-family:system-ui,sans-serif"><p style="margin:0;font-size:5rem;font-weight:700;line-height:1">404</p><h1 style="margin:1rem 0 .5rem">Pagina non trovata</h1><p>La pagina che cerchi non esiste o è stata spostata.</p><p><a href="/">Torna alla home</a></p></div>' }],
});

// Crea la pagina 404 (in bozza) dal contenuto del template se non c'è ancora; con più lingue anche le sue versioni. Restituisce true se l'ha creata.
export async function ensure404(userId, template = requireTemplate()) {
  const cur = await getDoc('page', NOT_FOUND_KEY);
  if (cur && !cur.deleted_at) return false;
  const file = path.join(template.contentDir, 'pages', '404.json');
  let page = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : FALLBACK_404();
  const site = (await getDoc('site', 'main'))?.draft;
  const base = site?.locales?.base;
  if (base && base !== 'it') page = renameLocale(page, 'it', base);
  if (base) page.lang = base;
  page = { ...page, key: NOT_FOUND_KEY, status: 'published', noindex: true };
  if (cur) await query('DELETE FROM docs WHERE id = ?', [cur.id]);   // nel cestino (non dovrebbe): si ricrea
  await saveDraft('page', NOT_FOUND_KEY, page, userId);
  await ensureTranslations(page, site, userId);
  return true;
}

// Crea un articolo in bozza, vuoto. La chiave è l'indirizzo scelto alla creazione e poi non cambia; l'indirizzo si può cambiare.
export async function createPost({ title, slug, date, author }, userId) {
  if (!title?.trim()) return { ok: false, error: 'Serve un titolo.' };
  if (!SLUG_RE.test(slug ?? '') || slug === 'new' || String(slug).includes('--')) return { ok: false, error: "L'indirizzo può contenere solo lettere minuscole, numeri e trattini (un trattino alla volta, e non può essere «new»)." };
  const docs = (await query("SELECT doc_key, draft, deleted_at FROM docs WHERE kind = 'post'")).map(row);
  if (docs.some((d) => d.doc_key === slug)) return { ok: false, error: docs.find((d) => d.doc_key === slug).deleted_at ? `L'articolo "${slug}" è nel cestino: ripristinalo o eliminalo per sempre.` : `Esiste già un articolo con indirizzo "${slug}".` };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
  const site = (await getDoc('site', 'main'))?.draft;
  const B = baseOf(site);   // i testi nella lingua dei contenuti di base
  const post = { key: slug, status: 'draft', ...(site?.locales?.base ? { lang: B } : {}), slug: { [B]: slug }, title: { [B]: title.trim() }, date: day, categories: [], tags: [], blocks: [], ...(author ? { author } : {}) };
  await saveDraft('post', slug, post, userId);
  await ensureTranslations(post, site, userId, null, 'post');
  return { ok: true, key: slug };
}

export async function pageReferences(key) {
  const docs = (await query('SELECT kind, doc_key, draft FROM docs WHERE deleted_at IS NULL')).map((d) => ({ kind: d.kind, key: d.doc_key, data: parseJson(d.draft) }));
  return findPageRefs(docs, key);
}

// Sposta una pagina o un articolo nel cestino (se nessuno la usa). Se era online sparisce dal sito alla prossima pubblicazione; si può ripristinare.
export async function trashDoc(kind, key, userId) {
  if (kind === 'page' && key === 'home') return { ok: false, error: 'La home non si può eliminare.' };
  if (kind === 'page' && key === NOT_FOUND_KEY) return { ok: false, error: 'La pagina 404 non si può eliminare: si modifica da Impostazioni → 404.' };
  const doc = await one('SELECT id, published, deleted_at FROM docs WHERE kind = ? AND doc_key = ?', [kind, key]);
  if (!doc || doc.deleted_at) return { ok: false, error: kind === 'post' ? "L'articolo non esiste." : 'La pagina non esiste.' };
  if (kind === 'page') {
    const refs = await pageReferences(key);
    if (refs.length) return { ok: false, error: 'La pagina è ancora usata: togli prima i riferimenti.', refs };
  }
  await query('UPDATE docs SET deleted_at = UTC_TIMESTAMP(), draft_updated_by = ? WHERE id = ?', [userId, doc.id]);
  let pending = doc.published != null;
  if (kind === 'page' || kind === 'post') for (const tr of await translationDocs(key, kind)) {   // le versioni in altre lingue seguono la pagina di base
    if (tr.deleted_at) continue;
    await query('UPDATE docs SET deleted_at = UTC_TIMESTAMP(), draft_updated_by = ? WHERE id = ?', [userId, tr.id]);
    pending ||= tr.published != null;
  }
  return { ok: true, pending };
}

// Le versioni in altre lingue di una pagina (documenti «chiave--lingua»), anche nel cestino.
export async function translationDocs(baseKey, kind = 'page') {
  const rows = await query('SELECT id, doc_key, draft, published, deleted_at FROM docs WHERE kind = ? AND doc_key LIKE ?', [kind, `${String(baseKey).replace(/[\\%_]/g, '\\$&')}--%`]);
  return rows.map(row).filter((d) => d.draft?.translationOf === baseKey);
}
export const deletePage = (key, userId) => trashDoc('page', key, userId);

// Ripristina dal cestino. Una pagina o un articolo tornano in bozza (non online finché non si pubblicano); se la pagina padre non c'è più si
// rimette sotto la home, se l'indirizzo è stato preso nel frattempo si aggiunge un suffisso.
export async function restoreDoc(kind, key, userId) {
  const doc = await one('SELECT id, draft, published, deleted_at FROM docs WHERE kind = ? AND doc_key = ?', [kind, key]);
  if (!doc?.deleted_at) return { ok: false, error: 'Non è nel cestino.' };
  const data = parseJson(doc.draft);
  if ((kind === 'page' || kind === 'post') && data.translationOf) {   // una versione in un'altra lingua si ripristina solo se c'è la pagina di base
    const baseDoc = await one('SELECT deleted_at FROM docs WHERE kind = ? AND doc_key = ?', [kind, data.translationOf]);
    if (!baseDoc || baseDoc.deleted_at) return { ok: false, error: kind === 'post' ? "Ripristina prima l'articolo di base." : 'Ripristina prima la pagina di base.' };
  } else if (kind === 'page') {
    const live = (await query("SELECT doc_key, draft FROM docs WHERE kind = 'page' AND deleted_at IS NULL")).map(row).filter((d) => !d.draft.translationOf);
    const L = data.lang ?? 'it';   // la lingua in cui è scritto l'indirizzo
    if (data.parent && !live.some((d) => d.doc_key === data.parent)) data.parent = null;
    while (live.some((d) => (d.draft.parent ?? null) === (data.parent ?? null) && d.draft.slug?.[L] === data.slug?.[L])) data.slug = { ...data.slug, [L]: `${data.slug[L]}-ripristinata` };
  } else {
    const live = (await query("SELECT draft FROM docs WHERE kind = ? AND deleted_at IS NULL", [kind])).map(row);
    const L = Object.keys(data.slug ?? {}).find((l) => data.slug[l]) ?? 'it';   // la lingua del suo indirizzo
    while (live.some((d) => d.draft.slug?.[L] === data.slug?.[L])) data.slug = { ...data.slug, [L]: `${data.slug[L]}-ripristinato` };
  }
  if (doc.published == null) data.status = 'draft';   // mai online o già tolta dal sito: torna in bozza
  await query('UPDATE docs SET deleted_at = NULL, draft = ?, rev = rev + 1, draft_updated_at = UTC_TIMESTAMP(), draft_updated_by = ? WHERE id = ?', [toJson(data), userId, doc.id]);
  if ((kind === 'page' || kind === 'post') && !data.translationOf) for (const tr of await translationDocs(key, kind)) {   // tornano anche le versioni in altre lingue (in bozza)
    if (!tr.deleted_at) continue;
    const next = { ...tr.draft, ...(tr.published == null ? { status: 'draft' } : {}) };
    await query('UPDATE docs SET deleted_at = NULL, draft = ?, rev = rev + 1, draft_updated_at = UTC_TIMESTAMP(), draft_updated_by = ? WHERE id = ?', [toJson(next), userId, tr.id]);
  }
  return { ok: true };
}

// Eliminazione definitiva: solo dal cestino.
export async function purgeDoc(kind, key) {
  const doc = await one('SELECT id, deleted_at FROM docs WHERE kind = ? AND doc_key = ?', [kind, key]);
  if (!doc?.deleted_at) return { ok: false, error: 'Si elimina per sempre solo dal cestino.' };
  await query('DELETE FROM docs WHERE id = ?', [doc.id]);
  if (kind === 'page' || kind === 'post') for (const tr of await translationDocs(key, kind)) if (tr.deleted_at) await query('DELETE FROM docs WHERE id = ?', [tr.id]);
  return { ok: true };
}

// Il cestino: pagine e articoli eliminati, con quando e se sono ancora online.
export async function listTrash() {
  return (await query("SELECT id, kind, doc_key, draft, published, deleted_at FROM docs WHERE deleted_at IS NOT NULL AND kind IN ('page', 'post') ORDER BY deleted_at DESC")).map(row).map((d) => ({ id: d.id, kind: d.kind, key: d.doc_key, name: textOf(d.draft?.name, d.draft?.lang ?? 'it', 'it') || textOf(d.draft?.title, d.draft?.lang ?? 'it', 'it') || d.doc_key, deletedAt: d.deleted_at, stillOnline: d.published != null }));
}
export async function trashCounts() {
  const rows = await query("SELECT kind, COUNT(*) AS n FROM docs WHERE deleted_at IS NOT NULL AND kind IN ('page', 'post') GROUP BY kind");
  const c = { page: 0, post: 0 };
  for (const r of rows) c[r.kind] = Number(r.n);
  return c;
}
