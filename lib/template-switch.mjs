// Cambiare template su un sito con il database: cosa succede ai contenuti già presenti. (Solo con il database; l'installazione dei pacchetti sta in template-install.mjs.)
import { query, one, tx, withLock } from './db.mjs';
import { loadData, publishAll, seedFromFiles } from './docs.mjs';
import { loadTemplateFrom, activeTemplateId, setActiveTemplate, templatesDir, readManifest } from './template.mjs';
import { validateData } from '../schema/validate.mjs';
import { audit } from './audit.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { dataDir } from './template.mjs';

// Copia di sicurezza di tutti i documenti prima di sostituirli (data/backups/content-<data>.json, leggibile solo dal proprietario).
export async function backupContent() {
  const rows = await query('SELECT kind, doc_key, draft, published FROM docs');
  if (!rows.length) return null;
  const dir = path.join(dataDir(), 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `content-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), { mode: 0o600 });
  return file;
}

export const templateDir = (id) => path.join(templatesDir(), id);

// I contenuti attuali (bozze) sono validi con gli schemi di questo template? { docs, errors, warnings }.
export async function contentCompat(tpl) {
  const docs = Number((await one('SELECT COUNT(*) AS n FROM docs')).n);
  if (!docs) return { docs: 0, errors: [], warnings: [] };
  const data = await loadData('draft');
  if (!data.site) return { docs, errors: ['mancano i dati del sito'], warnings: [] };
  const r = validateData({ site: data.site, shared: data.shared, pages: data.pages, translations: data.translations, headers: data.headers, footers: data.footers, posts: data.posts, postTranslations: data.postTranslations, categories: data.categories, tags: data.tags }, tpl);
  return { docs, errors: r.errors, warnings: r.warnings };
}

// Ripristina i documenti da una copia di sicurezza (dopo un'attivazione fallita).
export async function restoreContent(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  await tx(async (t) => {
    await t.query('DELETE FROM doc_revisions'); await t.query('DELETE FROM docs');
    for (const r of rows) await t.query('INSERT INTO docs (kind, doc_key, draft, published, published_at) VALUES (?, ?, ?, ?, IF(? IS NULL, NULL, UTC_TIMESTAMP()))', [r.kind, r.doc_key, r.draft, r.published, r.published]);
  });
}

// content: 'keep' = si tengono i contenuti (solo se compatibili); 'sample' = si sostituiscono con quelli di esempio del template (CANCELLA pagine, dati del sito e stile).
// Con il database vuoto si installano sempre i contenuti di esempio. Alla fine il sito viene pubblicato con il nuovo template.
// Una sola operazione sui template alla volta (installazione, attivazione, rimozione). Se l'attivazione fallisce a metà i contenuti tornano com'erano.
export async function switchTemplate(id, opts = {}) {
  const run = await withLock('cms-template', () => doSwitch(id, opts), 0);
  return run.ok ? run.value : { ok: false, error: 'Un\'altra operazione sui template è in corso: riprova tra un momento.', details: [] };
}

async function doSwitch(id, { userId = null, content = 'keep' } = {}) {
  let tpl;
  try { readManifest(templateDir(id)); tpl = loadTemplateFrom(templateDir(id)); } catch (e) { return { ok: false, error: `Template non utilizzabile: ${e.message}`, details: [] }; }
  const previous = activeTemplateId();
  const compat = await contentCompat(tpl);
  const mode = compat.docs === 0 ? 'sample' : content;

  if (mode === 'keep' && previous !== id && compat.errors.length) {
    return { ok: false, error: 'I contenuti attuali non sono compatibili con questo template.', details: compat.errors.slice(0, 30), compat };
  }
  setActiveTemplate(id);
  let backup = null; let replaced = false;
  try {
    if (mode === 'sample') {
      backup = await backupContent();
      await tx(async (t) => { await t.query('DELETE FROM doc_revisions'); await t.query('DELETE FROM docs'); });
      replaced = true;
      await seedFromFiles({ userId, template: tpl });
    }
    const r = await publishAll(userId, { force: true });
    if (!r.ok) throw new Error(`${r.error}: ${(r.details ?? []).slice(0, 5).join('; ')}`);
    await audit(userId, 'template.activate', `${id}@${tpl.manifest.version} (${mode}${previous && previous !== id ? `, prima: ${previous}` : ''})`);
    return { ok: true, mode, pages: r.pages, previous, backup };
  } catch (e) {
    let restored = false;
    if (replaced && backup) { try { await restoreContent(backup); restored = true; } catch (re) { console.error('ripristino dei contenuti', re?.message); } }
    if (previous && previous !== id) { try { setActiveTemplate(previous); } catch { /* l'attivo precedente non c'è più */ } }
    await audit(userId, 'template.activate.failed', `${id}: ${e.message}${replaced ? (restored ? ' (contenuti ripristinati)' : ` (RIPRISTINO NON RIUSCITO: copia in ${backup})`) : ''}`);
    return { ok: false, error: `Attivazione non riuscita: ${e.message}.${replaced ? (restored ? ' I contenuti precedenti sono stati ripristinati.' : ` Il ripristino automatico non è riuscito: la copia è in ${backup}.`) : ''}`, details: [], mode };
  }
}
