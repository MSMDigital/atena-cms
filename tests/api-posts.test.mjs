// API degli articoli (POST /api/posts): conversione del testo, token, limiti e creazione in bozza.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { textToHtml } from '../lib/api-posts.mjs';
import { TOKEN_FORMAT } from '../lib/api-tokens.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('testo: markdown semplice → HTML sanificato, mai HTML grezzo', () => {
  assert.equal(textToHtml('Ciao **mondo** e *tu*.'), '<p>Ciao <strong>mondo</strong> e <em>tu</em>.</p>');
  assert.match(textToHtml('# Titolo\n\n### Sotto'), /^<h2>Titolo<\/h2><h3>Sotto<\/h3>$/);
  assert.match(textToHtml('- uno\n- due'), /^<ul><li>uno<\/li><li>due<\/li><\/ul>$/);
  assert.match(textToHtml('1. uno\n2. due'), /^<ol>/);
  assert.match(textToHtml('[sito](https://esempio.ch)'), /<a href="https:\/\/esempio\.ch">sito<\/a>/);
  const evil = textToHtml('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](data:text/html,x)');
  assert.doesNotMatch(evil, /<script|<img|<a /i, 'nessun tag pericoloso: resta solo testo escapato');
  assert.doesNotMatch(evil, /href=/i, 'nessun link con javascript: o data:');
  assert.equal(textToHtml('   \n\n  '), '');
});

test('token: formato fisso (256 bit di casualità)', () => {
  assert.ok(TOKEN_FORMAT.test(`atn_${'a'.repeat(43)}`));
  for (const bad of ['', 'atn_corto', `atn_${'a'.repeat(44)}`, `xyz_${'a'.repeat(43)}`, `atn_${'a'.repeat(42)}!`]) assert.equal(TOKEN_FORMAT.test(bad), false);
});

test('route: fuori dal middleware, solo POST, nessun CORS, risposte senza cache', () => {
  const route = fs.readFileSync('app/api/posts/route.js', 'utf8');
  assert.match(fs.readFileSync('middleware.js', 'utf8'), /matcher: \['\/\(\(\?!api\/posts\|/, 'api/posts deve essere escluso dal matcher');
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export (async function|const) (OPTIONS|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /Access-Control-Allow/);
  assert.match(route, /no-store/); assert.match(route, /authenticateApi/); assert.match(route, /isAdminHost/);
});

test('API articoli: token, autenticazione, limiti e bozza', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, closeDb } = await import('../lib/db.mjs');
  const D = await import('../lib/docs.mjs');
  const U = await import('../lib/users.mjs');
  const K = await import('../lib/api-tokens.mjs');
  const P = await import('../lib/api-posts.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); });
  await D.seedFromFiles({ force: true });
  const mk = async (username, role) => (await U.createUser({ username, email: `${username}@example.ch`, role, password: 'Tr@monto-Blu-4821', firstName: username, lastName: 'Test' }, null)).id;
  const adminId = await mk('anna', 'admin'); const authorId = await mk('bruno', 'author'); const normalId = await mk('carla', 'normal');

  await t.test('creazione token: solo per admin e autori attivi; si vede una volta, nel database c\'è solo l\'hash', async () => {
    assert.equal((await K.createApiToken({ name: 'x', userId: normalId }, adminId)).ok, false);
    assert.equal((await K.createApiToken({ name: '', userId: authorId }, adminId)).ok, false);
    assert.equal((await K.createApiToken({ name: 'x', userId: authorId, days: 9999 }, adminId)).ok, false);
    const r = await K.createApiToken({ name: 'Claude', userId: authorId, days: 30 }, adminId);
    assert.ok(r.ok && TOKEN_FORMAT.test(r.token));
    const rows = JSON.stringify(await query('SELECT * FROM api_tokens'));
    assert.ok(!rows.includes(r.token) && !rows.includes(r.token.slice(4)), 'il token in chiaro non è nel database');
    t.token = r.token;
  });

  await t.test('autenticazione: token errato, revocato, scaduto, utente disattivato; blocco dopo troppi tentativi', async () => {
    const ok = await K.authenticateApi(`Bearer ${t.token}`, '10.0.0.1');
    assert.ok(ok.ok); assert.equal(ok.user.id, authorId);
    for (const h of [undefined, '', t.token, `Basic ${t.token}`, `Bearer ${t.token}x`, 'Bearer atn_' + 'b'.repeat(43)]) assert.equal((await K.authenticateApi(h, '10.0.0.2')).ok, false);
    await query("UPDATE api_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 DAY");
    assert.equal((await K.authenticateApi(`Bearer ${t.token}`, '10.0.0.3')).ok, false, 'scaduto');
    await query('UPDATE api_tokens SET expires_at = NULL');
    await query("UPDATE users SET active = 0 WHERE id = ?", [authorId]);
    assert.equal((await K.authenticateApi(`Bearer ${t.token}`, '10.0.0.3')).ok, false, 'utente disattivato');
    await query("UPDATE users SET active = 1 WHERE id = ?", [authorId]);
    await K.revokeApiToken((await query('SELECT id FROM api_tokens'))[0].id, adminId);
    assert.equal((await K.authenticateApi(`Bearer ${t.token}`, '10.0.0.3')).ok, false, 'revocato');
    let last; for (let i = 0; i < 12; i++) last = await K.authenticateApi('Bearer sbagliato', '10.0.0.9');
    assert.equal(last.reason, 'locked');
    assert.equal((await K.authenticateApi('Bearer sbagliato', '10.0.0.10')).reason, 'denied', 'il blocco è per indirizzo');
  });

  await t.test('articolo: sempre in bozza, proprietà dell\'utente del token, testo sanificato, immagine ricodificata', async () => {
    const user = { id: authorId, name: 'bruno Test', role: 'author' };
    const r = await P.createApiPost({ title: 'Un articolo da Claude', text: 'Ciao **mondo**.\n\n<script>x</script>', image: { data: PNG, filename: 'foto.png', alt: 'Un pixel' } }, user);
    assert.ok(r.ok, JSON.stringify(r));
    const doc = await D.getDoc('post', r.key);
    assert.equal(doc.draft.status, 'draft'); assert.equal(doc.published, null); assert.equal(doc.created_by, authorId);
    assert.match(doc.draft.image.src, /^uploads\/.+\.webp$/);
    assert.doesNotMatch(JSON.stringify(doc.draft.blocks), /<script/);
    assert.match(JSON.stringify(doc.draft.blocks), /<strong>mondo<\/strong>/);
    const again = await P.createApiPost({ title: 'Un articolo da Claude', text: 'x' }, user);
    assert.ok(again.ok); assert.notEqual(again.key, r.key, 'stesso titolo: indirizzo diverso');
  });

  await t.test('rifiuti: dati non validi, immagine non raster o falsa, limite orario', async () => {
    const user = { id: authorId, name: 'bruno Test', role: 'author' };
    for (const body of [null, [], {}, { title: 'ab', text: 'x' }, { title: 'Valido', text: '' }, { title: 'Valido', text: 'x'.repeat(100_001) }, { title: 'Valido', text: 'x', image: 'no' }, { title: 'Valido', text: 'x', image: { data: 'PHN2Zz48L3N2Zz4=' } }, { title: 'Valido', text: 'x', image: { data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') } }, { title: 'Valido', text: 'x', image: { data: '!!!' } }]) {
      const r = await P.createApiPost(body, user);
      assert.equal(r.ok, false, JSON.stringify(body)?.slice(0, 80)); assert.ok(r.status >= 400);
    }
    const before = Number((await query("SELECT COUNT(*) AS n FROM docs WHERE kind = 'post'"))[0].n);
    await query("DELETE FROM audit_log WHERE action = 'api-post'");
    for (let i = 0; i < P.postsPerHour(); i++) await query("INSERT INTO audit_log (user_id, action) VALUES (?, 'api-post')", [authorId]);
    assert.equal((await P.createApiPost({ title: 'Oltre il limite', text: 'x' }, user)).status, 429);
    assert.equal(Number((await query("SELECT COUNT(*) AS n FROM docs WHERE kind = 'post'"))[0].n), before, 'nessun articolo creato oltre il limite');
  });
});
