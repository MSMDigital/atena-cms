// Pagina 404 (Impostazioni → 404): documento «404», creato dal template, pubblicato come 404.html e mai indirizzo o voce della sitemap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

test('pagina 404: creata dal template, protetta, pubblicata come 404.html', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  process.env.CMS_TEMPLATE_DIR = path.join(ROOT, 'templates/starter');
  await setupTestDb();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-out-'));
  process.env.SITE_OUT_DIR = out;
  const { query, closeDb } = await import('../lib/db.mjs');
  const D = await import('../lib/docs.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); fs.rmSync(out, { recursive: true, force: true }); });
  await query("INSERT INTO users (email, name, password_hash, role) VALUES ('t@example.ch', 'T', 'x', 'admin')");
  await D.seedFromFiles({ userId: 1 });

  await t.test('il template porta la sua pagina 404', async () => {
    const d = await D.getDoc('page', '404');
    assert.ok(d, 'il contenuto di esempio del template ha una pagina 404');
    assert.equal(d.draft.noindex, true);
  });

  await t.test('in un sito che non ce l\'ha, ensure404 la crea una volta sola', async () => {
    await query("DELETE FROM docs WHERE kind = 'page' AND doc_key = '404'");
    assert.equal(await D.ensure404(1), true);
    assert.equal((await D.getDoc('page', '404')).draft.status, 'published');
    assert.equal(await D.ensure404(1), false, 'la seconda volta non fa niente');
  });

  await t.test('è riservata: non si crea né si elimina come una pagina qualsiasi', async () => {
    assert.equal((await D.createPage({ key: '404', name: 'x', slug: 'x' }, 1)).ok, false);
    assert.equal((await D.trashDoc('page', '404', 1)).ok, false);
    assert.ok(D.isNotFoundKey('404') && D.isNotFoundKey('404--en') && !D.isNotFoundKey('404-bis'));
  });

  await t.test('la pubblicazione scrive 404.html, senza indirizzo /404/ né sitemap', async () => {
    const r = await D.publishAll(1);
    assert.equal(r.ok, true, JSON.stringify(r));
    const html = fs.readFileSync(path.join(out, '404.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex/);
    assert.equal(fs.existsSync(path.join(out, '404/index.html')), false);
    assert.doesNotMatch(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'), /404/);
  });
});
