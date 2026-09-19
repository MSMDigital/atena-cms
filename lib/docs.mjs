// Contenuti nel database: token, dati del sito, blocchi condivisi e pagine. Ogni documento ha una bozza e una versione pubblicata.
import fs from 'node:fs';
import path from 'node:path';
import { query, one, tx, withLock, parseJson, toJson } from './db.mjs';
import { ROOT } from './env.mjs';
import { buildSite, BuildError } from '../render/build.mjs';
import { requireTemplate } from './template.mjs';
import { validateTokens } from '../render/tokens.mjs';
import { findPageRefs } from './refs.mjs';
import { mediaDir } from './media.mjs';

const row = (d) => d && ({ ...d, draft: parseJson(d.draft), published: parseJson(d.published) });

export async function getDoc(kind, key) {
  return row(await one('SELECT * FROM docs WHERE kind = ? AND doc_key = ?', [kind, key]));
}

// Stato di un documento: 'unpublished' (mai online), 'modified' (bozza diversa da quella online), 'clean', 'deleted' (sparirà alla prossima pubblicazione).
export const docState = (d) => (d.deleted_at ? 'deleted' : d.published == null ? 'unpublished' : toJson(d.draft) === toJson(d.published) ? 'clean' : 'modified');

// Assembla i dati del sito da bozze o da versioni pubblicate. Con 'published' i documenti mai pubblicati restano fuori.
export async function loadData(state = 'draft') {
  const docs = (await query('SELECT * FROM docs')).map(row).filter((d) => state !== 'draft' || !d.deleted_at);
  const pick = (d) => (state === 'draft' ? d.draft : d.published);
  const data = { site: null, tokens: null, shared: {}, pages: [] };
  for (const d of docs) {
    const v = pick(d);
    if (v == null) continue;
    if (d.kind === 'tokens') data.tokens = v; else if (d.kind === 'site') data.site = v; else if (d.kind === 'shared') data.shared = v; else data.pages.push(v);
  }
  data.pages.sort((a, b) => (a.key === 'home' ? -1 : b.key === 'home' ? 1 : a.key.localeCompare(b.key)));
  return data;
}

export async function listDocs() {
  return (await query('SELECT id, kind, doc_key, draft, published, draft_updated_at, published_at, rev, deleted_at FROM docs ORDER BY kind, doc_key')).map(row).map((d) => ({ id: d.id, kind: d.kind, key: d.doc_key, state: docState(d), draftUpdatedAt: d.draft_updated_at, publishedAt: d.published_at, rev: d.rev, data: d.draft }));
}

// Salva la bozza. Non fa nulla (e non crea revisioni) se il contenuto non è cambiato.
// Con `expectedRev` rileva le modifiche concorrenti: se nel frattempo qualcun altro ha salvato, non scrive e restituisce { conflict: true }.
export async function saveDraft(kind, key, data, userId, { expectedRev } = {}) {
  const json = toJson(data);
  return tx(async (t) => {
    const cur = (await t.query('SELECT id, draft, rev, deleted_at FROM docs WHERE kind = ? AND doc_key = ? FOR UPDATE', [kind, key]))[0];
    if (!cur) {
      if (expectedRev != null) return { conflict: true, reason: 'missing' };
      const r = await t.query('INSERT INTO docs (kind, doc_key, draft, draft_updated_by) VALUES (?, ?, ?, ?)', [kind, key, json, userId]);
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
export async function publishAll(userId, { force = false } = {}) {
  // Una pubblicazione alla volta (anche tra processi): due build insieme si pesterebbero le cartelle.
  const run = await withLock('cms-publish', () => publishOnce(userId, { force }), 0);
  return run.ok ? run.value : { ok: false, error: "Un'altra pubblicazione è in corso", details: ['riprova tra un momento'], changed: [] };
}

async function publishOnce(userId, { force }) {
  const docs = (await query('SELECT * FROM docs')).map(row);
  const changed = docs.filter((d) => docState(d) !== 'clean');   // include i documenti cancellati: spariranno dal sito
  if (!changed.length && !force) return { ok: true, nothing: true, changed: [] };
  const names = changed.map((d) => `${d.kind}:${d.doc_key}${d.deleted_at ? ' (eliminata)' : ''}`);

  const data = await loadData('draft');
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
  fs.rmSync(old, { recursive: true, force: true });
  try {
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    fs.renameSync(tmp, dest);
    fs.rmSync(old, { recursive: true, force: true });
  } catch {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(tmp, dest, { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(old, { recursive: true, force: true });
  }

  await tx(async (t) => {
    for (const d of changed) {
      if (d.deleted_at) { await t.query('DELETE FROM docs WHERE id = ?', [d.id]); continue; }
      await t.query('UPDATE docs SET published = draft, published_at = UTC_TIMESTAMP(), published_by = ? WHERE id = ?', [userId, d.id]);
      await t.query('INSERT INTO doc_revisions (doc_id, data, action, created_by) VALUES (?, ?, ?, ?)', [d.id, toJson(d.draft), 'publish', userId]);
    }
    await t.query('INSERT INTO publications (created_by, status, pages, changed, log) VALUES (?, ?, ?, ?, ?)', [userId, 'ok', result.pages, names.join(', ').slice(0, 65000), [result.fontNote, ...result.warnings].join('\n').slice(0, 65000)]);
  });
  return { ok: true, pages: result.pages, changed: names, warnings: result.warnings, outDir: dest };
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

// ---- pagine: creazione, eliminazione, riferimenti -------------------------------------------------

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const SLUG_RE = /^[a-z0-9-]+$/;

// Crea una pagina in bozza, vuota. La chiave non si cambia più (i link la usano); l'indirizzo sì.
export async function createPage({ key, name, slug, parent }, userId) {
  if (!KEY_RE.test(key ?? '')) return { ok: false, error: 'La chiave può contenere solo lettere minuscole, numeri e trattini.' };
  if (!name?.trim()) return { ok: false, error: 'Serve un nome.' };
  if (!SLUG_RE.test(slug ?? '')) return { ok: false, error: "L'indirizzo può contenere solo lettere minuscole, numeri e trattini." };
  const docs = (await query("SELECT doc_key, draft, deleted_at FROM docs WHERE kind = 'page'")).map(row);
  if (docs.some((d) => d.doc_key === key)) return { ok: false, error: docs.find((d) => d.doc_key === key).deleted_at ? `La pagina "${key}" è in attesa di eliminazione: pubblica prima.` : `Esiste già una pagina con chiave "${key}".` };
  const live = docs.filter((d) => !d.deleted_at).map((d) => d.draft);
  if (parent && !live.some((p) => p.key === parent)) return { ok: false, error: 'La pagina padre non esiste.' };
  if (live.some((p) => (p.parent ?? null) === (parent || null) && p.slug?.it === slug)) return { ok: false, error: 'Esiste già una pagina con questo indirizzo allo stesso livello.' };
  const page = {
    key, status: 'draft', slug: { it: slug }, parent: parent || null,
    name: { it: name.trim() }, title: { it: name.trim() }, description: { it: '' }, blocks: [],
  };
  await saveDraft('page', key, page, userId);
  return { ok: true, key };
}

export async function pageReferences(key) {
  const docs = (await query('SELECT kind, doc_key, draft FROM docs WHERE deleted_at IS NULL')).map((d) => ({ kind: d.kind, key: d.doc_key, data: parseJson(d.draft) }));
  return findPageRefs(docs, key);
}

// Elimina una pagina se nessuno la usa. Mai pubblicata: subito. Già pubblicata: sparisce alla prossima pubblicazione.
export async function deletePage(key, userId) {
  if (key === 'home') return { ok: false, error: 'La home non si può eliminare.' };
  const doc = await one("SELECT id, published, deleted_at FROM docs WHERE kind = 'page' AND doc_key = ?", [key]);
  if (!doc || doc.deleted_at) return { ok: false, error: 'La pagina non esiste.' };
  const refs = await pageReferences(key);
  if (refs.length) return { ok: false, error: 'La pagina è ancora usata: togli prima i riferimenti.', refs };
  if (doc.published == null) await query('DELETE FROM docs WHERE id = ?', [doc.id]);
  else await query('UPDATE docs SET deleted_at = UTC_TIMESTAMP(), draft_updated_by = ? WHERE id = ?', [userId, doc.id]);
  return { ok: true, pending: doc.published != null };
}
