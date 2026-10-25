// Articoli pianificati: a ora passata il sito si rifà da solo, pubblicando solo quegli articoli (le altre bozze restano bozze).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sched-'));
const saved = Object.fromEntries(['TEMPLATES_DIR', 'DATA_DIR', 'SITE_OUT_DIR', 'MEDIA_DIR', 'CMS_TEMPLATE_DIR'].map((k) => [k, process.env[k]]));
Object.assign(process.env, { TEMPLATES_DIR: path.join(SANDBOX, 'templates'), DATA_DIR: path.join(SANDBOX, 'data'), SITE_OUT_DIR: path.join(SANDBOX, 'dist'), MEDIA_DIR: path.join(SANDBOX, 'media') });
delete process.env.CMS_TEMPLATE_DIR;
fs.cpSync(path.join(ROOT, 'templates/starter'), path.join(process.env.TEMPLATES_DIR, 'starter'), { recursive: true, filter: (s) => !/\/tools(\/|$)/.test(s) });

test('pubblicazione pianificata: publishDue rifà il sito solo quando l\'ora è passata e non tocca le altre bozze', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, one, closeDb } = await import('../lib/db.mjs');
  const T = await import('../lib/template.mjs');
  const D = await import('../lib/docs.mjs');
  const { stopRenderers } = await import('../render/host.mjs');
  t.after(async () => { stopRenderers(); await closeDb(); await dropTestDb(); fs.rmSync(SANDBOX, { recursive: true, force: true }); for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  T.setActiveTemplate('starter');
  await D.seedFromFiles({ template: T.loadTemplateFrom(path.join(T.templatesDir(), 'starter')) });
  const first = await D.publishAll(null, { force: true });
  assert.equal(first.ok, true, JSON.stringify(first));
  const out = process.env.SITE_OUT_DIR;
  const inSite = (p) => fs.existsSync(path.join(out, p, 'index.html'));

  assert.equal((await D.publishDue()).nothing, true, 'senza articoli pianificati non fa nulla');

  // un articolo pianificato nel futuro, e una modifica non correlata in sospeso (la home)
  const post = (await D.getDoc('post', 'come-usare-i-moduli')).draft;
  const future = new Date(Date.now() + 2 * 3600_000);   // le ore di pubblicazione sono intere
  const { zurichNow } = await import('../schema/blog.mjs');
  await D.saveDraft('post', 'nuovo-pianificato', { ...post, key: 'nuovo-pianificato', slug: { it: 'nuovo-pianificato' }, title: { it: 'Nuovo pianificato' }, status: 'scheduled', publishAt: `${zurichNow(future).slice(0, 13)}:00` }, null);
  const home = (await D.getDoc('page', 'home')).draft;
  await D.saveDraft('page', 'home', { ...home, name: { it: 'Home modificata' } }, null);
  assert.equal((await D.publishDue()).nothing, true, 'non è ancora ora');
  assert.equal(inSite('blog/nuovo-pianificato'), false);

  // l'ora passa: il sito si rifà con l'articolo, ma la home resta bozza
  const past = `${zurichNow(new Date(Date.now() - 2 * 3600_000)).slice(0, 13)}:00`;
  await D.saveDraft('post', 'nuovo-pianificato', { ...(await D.getDoc('post', 'nuovo-pianificato')).draft, publishAt: past }, null);
  await query('UPDATE publications SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 HOUR)');   // l'ultimo build è anteriore all'ora di uscita
  const r = await D.publishDue();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(inSite('blog/nuovo-pianificato'), 'l\'articolo è online');
  assert.equal(D.docState(await D.getDoc('page', 'home')), 'modified', 'la home resta una bozza non pubblicata');
  assert.equal((await one("SELECT COUNT(*) AS n FROM docs WHERE kind='page' AND doc_key='home' AND published IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(published, '$.name.it')) = 'Home modificata'")).n, 0);
  assert.equal((await D.publishDue()).nothing, true, 'non si ripete');

  // azioni di massa / modifica rapida: si pubblica solo il documento toccato; un articolo nel cestino sparisce dal sito, le altre bozze restano bozze
  await D.trashDoc('post', 'nuovo-pianificato', null);
  const id = (await D.getDoc('post', 'nuovo-pianificato')).id;
  const gone = await D.publishAll(null, { only: new Set([id]), force: true });
  assert.equal(gone.ok, true, JSON.stringify(gone));
  assert.equal(inSite('blog/nuovo-pianificato'), false, 'l\'articolo nel cestino non è più nel sito');
  assert.equal(D.docState(await D.getDoc('page', 'home')), 'modified', 'la home resta una bozza non pubblicata');
});
