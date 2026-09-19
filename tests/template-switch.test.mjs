// Cambiare template su un sito con contenuti: compatibilità, sostituzione con copia di sicurezza, ripristino se qualcosa va storto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-switch-'));
const saved = Object.fromEntries(['TEMPLATES_DIR', 'DATA_DIR', 'SITE_OUT_DIR', 'MEDIA_DIR', 'CMS_TEMPLATE_DIR'].map((k) => [k, process.env[k]]));
Object.assign(process.env, { TEMPLATES_DIR: path.join(SANDBOX, 'templates'), DATA_DIR: path.join(SANDBOX, 'data'), SITE_OUT_DIR: path.join(SANDBOX, 'dist'), MEDIA_DIR: path.join(SANDBOX, 'media') });
delete process.env.CMS_TEMPLATE_DIR;

const cp = (id, as = id) => fs.cpSync(path.join(ROOT, 'templates', id), path.join(process.env.TEMPLATES_DIR, as), { recursive: true, filter: (s) => !/\/tools(\/|$)/.test(s) });
for (const id of ['mammano', 'starter']) cp(id);
cp('starter', 'rotto');
fs.writeFileSync(path.join(process.env.TEMPLATES_DIR, 'rotto/template.json'), JSON.stringify({ id: 'rotto', name: 'Rotto', version: '1.0.0', engine: 1 }));
fs.writeFileSync(path.join(process.env.TEMPLATES_DIR, 'rotto/render/index.mjs'), "export default { renderPage() { throw new Error('esplode in pubblicazione'); } };");

test('cambio di template con i contenuti', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, one, closeDb } = await import('../lib/db.mjs');
  const T = await import('../lib/template.mjs');
  const S = await import('../lib/template-switch.mjs');
  const D = await import('../lib/docs.mjs');
  const { stopRenderers } = await import('../render/host.mjs');
  t.after(async () => { stopRenderers(); await closeDb(); await dropTestDb(); fs.rmSync(SANDBOX, { recursive: true, force: true }); for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  T.setActiveTemplate('mammano');
  await D.seedFromFiles({ template: T.loadTemplateFrom(path.join(T.templatesDir(), 'mammano')) });
  const snapshot = async () => (await query('SELECT kind, doc_key, draft, published FROM docs ORDER BY kind, doc_key')).map((r) => [r.kind, r.doc_key, r.draft, r.published]);
  const before = await snapshot();
  const N = before.length;
  assert.ok(N >= 15);

  await t.test('contenuti incompatibili: "tenere" si rifiuta con l\'elenco dei problemi e non cambia nulla', async () => {
    const r = await S.switchTemplate('starter', { userId: null, content: 'keep' });
    assert.equal(r.ok, false);
    assert.match(r.error, /non sono compatibili/);
    assert.ok(r.details.length > 0);
    assert.equal(T.activeTemplateId(), 'mammano');
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('attivazione che fallisce a metà: contenuti e template attivo tornano com\'erano', async () => {
    const r = await S.switchTemplate('rotto', { userId: null, content: 'sample' });
    assert.equal(r.ok, false);
    assert.match(r.error, /esplode in pubblicazione/);
    assert.match(r.error, /contenuti precedenti sono stati ripristinati/);
    assert.equal(T.activeTemplateId(), 'mammano', 'il template attivo è quello di prima');
    const after = await snapshot();
    assert.equal(after.length, N);
    assert.deepEqual(after.map((x) => [x[0], x[1], JSON.parse(x[2]).key ?? null]), before.map((x) => [x[0], x[1], JSON.parse(x[2]).key ?? null]), 'stessi documenti');
    const backups = fs.readdirSync(path.join(T.dataDir(), 'backups'));
    assert.equal(backups.length, 1, 'la copia di sicurezza c\'è');
    const log = await one("SELECT detail FROM audit_log WHERE action = 'template.activate.failed' ORDER BY id DESC LIMIT 1");
    assert.match(log.detail, /contenuti ripristinati/);
  });

  await t.test('sostituzione con i contenuti di esempio: riesce, copia 0600, sito pubblicato con il nuovo template', async () => {
    const r = await S.switchTemplate('starter', { userId: null, content: 'sample' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(T.activeTemplateId(), 'starter');
    assert.equal((await one('SELECT COUNT(*) AS n FROM docs')).n, 6);
    const backups = fs.readdirSync(path.join(T.dataDir(), 'backups'));
    assert.equal(backups.length, 2);
    for (const b of backups) assert.equal(fs.statSync(path.join(T.dataDir(), 'backups', b)).mode & 0o777, 0o600);
    assert.match(fs.readFileSync(path.join(process.env.SITE_OUT_DIR, 'index.html'), 'utf8'), /class="site-header"/);
  });

  await t.test('due operazioni insieme: una sola procede, l\'altra è avvisata', async () => {
    const [a, b] = await Promise.all([S.switchTemplate('mammano', { userId: null, content: 'sample' }), S.switchTemplate('mammano', { userId: null, content: 'sample' })]);
    const results = [a, b];
    assert.equal(results.filter((x) => x.ok).length, 1, JSON.stringify(results.map((x) => x.error ?? 'ok')));
    assert.match(results.find((x) => !x.ok).error, /in corso/);
  });

  await t.test('con il database vuoto si installano sempre i contenuti di esempio', async () => {
    await query('DELETE FROM doc_revisions'); await query('DELETE FROM docs');
    const r = await S.switchTemplate('starter', { userId: null, content: 'keep' });
    assert.deepEqual([r.ok, r.mode], [true, 'sample']);
  });
});
