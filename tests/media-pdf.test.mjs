// PDF nella libreria: riconoscimento dal contenuto, rifiuto del contenuto attivo, link «file» pubblicato, anteprima e testi ricchi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectImageRefs } from '../render/images.mjs';
import { createContext } from '../render/context.mjs';
import { sanitizeRich } from '../render/sanitize.mjs';
import { INLINE, BLOCK } from '../schema/common.mjs';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${extra} >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`);

test('link «file» e href="file:…": risolti in /assets/img/…, raccolti per la pubblicazione, ammessi dal sanificatore e dagli schemi', () => {
  const ctx = createContext({ site: { siteUrl: 'https://x.ch', locales: { default: 'it', enabled: ['it'], tags: { it: 'it-CH' } }, strings: {} }, pages: [], shared: {} }, 'it');
  assert.equal(ctx.link({ type: 'file', file: 'uploads/listino-2026-ab12cd34ef.pdf' }), '/assets/img/uploads/listino-2026-ab12cd34ef.pdf');
  assert.equal(ctx.link({ type: 'file', file: '../../etc/passwd' }), '#');
  const html = String(ctx.rich({ it: '<p><a href="file:uploads/menu.pdf">Menu</a> <a href="file:uploads/x.exe">no</a></p>' }));
  assert.match(html, /href="\/assets\/img\/uploads\/menu\.pdf"/);
  assert.doesNotMatch(html, /x\.exe/);
  assert.match(sanitizeRich('<a href="file:uploads/a-1.pdf">x</a>'), /href="file:uploads\/a-1\.pdf"/);
  assert.doesNotMatch(sanitizeRich('<a href="file:uploads/a.html">x</a>'), /href/);
  assert.ok(new RegExp(INLINE).test('<a href="file:uploads/a-1.pdf">x</a>'));
  assert.ok(new RegExp(BLOCK).test('<p><a href="file:uploads/a-1.pdf">x</a></p>'));
  assert.equal(new RegExp(INLINE).test('<a href="file:uploads/a.html">x</a>'), false);

  const refs = collectImageRefs({ site: {}, shared: {}, pages: [{ status: 'published', blocks: [{ cta: { type: 'file', file: 'uploads/a.pdf' } }, { text: '<a href="file:uploads/b.pdf">b</a>' }] }, { status: 'draft', blocks: [{ cta: { type: 'file', file: 'uploads/bozza.pdf' } }] }] });
  assert.deepEqual([...refs].sort(), ['uploads/a.pdf', 'uploads/b.pdf']);
});

test('libreria: un PDF si riconosce dal contenuto, si conserva com\'è, si riusa; contenuto attivo e file finti si rifiutano', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-pdf-'));
  process.env.MEDIA_DIR = dir;
  const { closeDb } = await import('../lib/db.mjs');
  const M = await import('../lib/media.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); fs.rmSync(dir, { recursive: true, force: true }); delete process.env.MEDIA_DIR; });

  const a = await M.saveUpload(pdf(), 'Test PDF Uno.pdf', null);
  assert.equal(a.kind, 'pdf');
  assert.match(a.path, /^uploads\/test-pdf-uno-[0-9a-f]{10}\.pdf$/);
  assert.equal(fs.readFileSync(path.join(dir, a.path)).toString('latin1').slice(0, 5), '%PDF-');
  assert.equal((await M.saveUpload(pdf(), 'altro nome.pdf', null)).path.replace(/^uploads\/[^-]*-[^-]*-?/, '').length > 0, true);
  const again = await M.saveUpload(pdf(), 'Test PDF Uno.pdf', null);
  assert.equal(again.path, a.path, 'stesso contenuto: si riusa');

  for (const bad of ['/JavaScript (app.alert(1))', '/S /JavaScript', '/AA << /O 5 0 R >>', '/Launch', '/EmbeddedFile', '/J#61vaScript', '/OpenAction << /S /JS /JS (x) >>']) {
    await assert.rejects(() => M.saveUpload(pdf(bad), 'cattivo.pdf', null), /non ammesso/, bad);
  }
  // un nome di font non è un'azione: /AAAAAA+Calibri e /JSON non devono dare falsi positivi
  await assert.doesNotReject(() => M.saveUpload(pdf('/BaseFont /AAAAAA+Calibri /Meta /JSON'), 'ok-font.pdf', null));
  await assert.rejects(() => M.saveUpload(Buffer.from('MZ\x90\x00 non sono un pdf'), 'finto.pdf', null), /Formato non supportato/);
  await assert.rejects(() => M.saveUpload(Buffer.from('<html>%PDF-1.4</html>'), 'doppio.pdf', null), /Formato non supportato/, 'il PDF comincia a offset 0');

  // sostituzione: PDF con PDF, non con un'immagine; niente ritaglio
  await assert.rejects(() => M.replaceUpload(a.path, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]), 'x.jpg', null), /Un PDF si sostituisce con un altro PDF/);
  const rep = await M.replaceUpload(a.path, pdf('/Title (nuovo)'), 'nuovo.pdf', null);
  assert.equal(rep.path, a.path);
  await assert.rejects(() => M.editImage(a.path, { width: 100 }, null), /PDF non si possono/);
  assert.equal(await M.thumbnail(a.path), null);
  assert.ok((await M.listMedia()).find((i) => i.path === a.path)?.kind === 'pdf');
});
