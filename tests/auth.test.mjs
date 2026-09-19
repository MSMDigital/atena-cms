import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { hashPassword, verifyPassword } from '../lib/password.mjs';

test('password: hash con sale, verifica giusta e sbagliata', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a, b, 'due hash della stessa password devono differire (sale)');
  assert.match(a, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse battery', a), true);
  assert.equal(await verifyPassword('correct horse batterx', a), false);
  assert.equal(await verifyPassword('x', 'formato-non-valido'), false);
});

test('sessioni e accesso', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, one, closeDb } = await import('../lib/db.mjs');
  const S = await import('../lib/sessions.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); });

  const pw = 'una-password-lunga-e-casuale';
  await query('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', ['anna@example.ch', 'Anna', await hashPassword(pw), 'admin']);
  await query('INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, 0)', ['off@example.ch', 'Off', await hashPassword(pw), 'editor']);

  await t.test('accesso corretto: sessione valida, token mai salvato in chiaro', async () => {
    const r = await S.attemptLogin(' ANNA@Example.ch ', pw, { ip: '10.0.0.1', ua: 'test' });
    assert.equal(r.ok, true);
    assert.equal(r.user.role, 'admin');
    const stored = await query('SELECT id FROM sessions');
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0].id, r.token);
    assert.equal(stored[0].id, S.hashToken(r.token));
    assert.equal((await S.findSession(r.token)).email, 'anna@example.ch');
    await S.destroySession(r.token);
    assert.equal(await S.findSession(r.token), null, 'dopo il logout la sessione non vale più');
  });

  await t.test('password errata ed email inesistente hanno lo stesso esito', async () => {
    const a = await S.attemptLogin('anna@example.ch', 'sbagliata', { ip: '10.0.0.2' });
    const b = await S.attemptLogin('nessuno@example.ch', 'sbagliata', { ip: '10.0.0.3' });
    assert.deepEqual([a.ok, a.reason], [false, 'invalid']);
    assert.deepEqual([b.ok, b.reason], [false, 'invalid']);
  });

  await t.test('utente disattivato non entra, con la password giusta', async () => {
    const r = await S.attemptLogin('off@example.ch', pw, { ip: '10.0.0.4' });
    assert.equal(r.ok, false);
  });

  await t.test('sessione scaduta non vale', async () => {
    const r = await S.attemptLogin('anna@example.ch', pw, { ip: '10.0.0.5' });
    await query('UPDATE sessions SET expires_at = ? WHERE id = ?', [new Date(Date.now() - 1000), S.hashToken(r.token)]);
    assert.equal(await S.findSession(r.token), null);
  });

  await t.test('dopo 5 errori dallo stesso indirizzo l\'account si blocca per quell\'indirizzo, anche con la password giusta', async () => {
    for (let i = 0; i < 5; i++) await S.attemptLogin('anna@example.ch', 'no' + i, { ip: '10.9.9.1' });
    const before = Number((await one('SELECT COUNT(*) AS n FROM sessions')).n);
    const r = await S.attemptLogin('anna@example.ch', pw, { ip: '10.9.9.1' });
    assert.deepEqual([r.ok, r.reason], [false, 'locked']);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM sessions')).n), before, 'un accesso bloccato non crea sessioni');
  });

  await t.test('un estraneo non chiude fuori il titolare: da un altro indirizzo l\'accesso resta possibile', async () => {
    const r = await S.attemptLogin('anna@example.ch', pw, { ip: '10.9.9.77' });
    assert.equal(r.ok, true, 'il blocco vale per l\'indirizzo che ha sbagliato, non per l\'account');
  });

  await t.test('un attacco da molti indirizzi contro lo stesso account si ferma a 20 errori', async () => {
    await query("DELETE FROM login_attempts");
    for (let i = 0; i < 20; i++) await S.attemptLogin('anna@example.ch', 'no' + i, { ip: '198.51.100.' + i });
    const r = await S.attemptLogin('anna@example.ch', pw, { ip: '198.51.100.200' });
    assert.deepEqual([r.ok, r.reason], [false, 'locked']);
    await query("DELETE FROM login_attempts");
  });

  await t.test('richieste in parallelo non aggirano il limite (il tentativo si registra prima di verificare)', async () => {
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => S.attemptLogin('anna@example.ch', 'sbagliata' + i, { ip: '10.8.8.8' })));
    const verified = rs.filter((r) => r.reason === 'invalid').length;
    assert.ok(verified <= 5, `verifiche eseguite: ${verified}`);
    assert.ok(rs.filter((r) => r.reason === 'locked').length >= 25);
    await query("DELETE FROM login_attempts");
  });

  await t.test('un tentativo bloccato non allunga il blocco, e la tabella si ripulisce da sola', async () => {
    for (let i = 0; i < 5; i++) await S.attemptLogin('anna@example.ch', 'no' + i, { ip: '10.7.7.7' });
    for (let i = 0; i < 10; i++) await S.attemptLogin('anna@example.ch', 'no', { ip: '10.7.7.7' });
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = '10.7.7.7'")).n), 5, 'i tentativi bloccati non si contano');
    await query("INSERT INTO login_attempts (email, ip, success, created_at) VALUES ('vecchio@example.ch', 'x', 0, ?)", [new Date(Date.now() - 10 * 86400_000)]);
    await S.purgeAuthTables(true);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM login_attempts WHERE email = 'vecchio@example.ch'")).n), 0);
    await query("DELETE FROM login_attempts");
  });

  await t.test('password enorme: rifiutata senza elaborarla', async () => {
    const r = await S.attemptLogin('anna@example.ch', 'x'.repeat(5000), { ip: '10.6.6.6' });
    assert.deepEqual([r.ok, r.reason], [false, 'invalid']);
  });

  await t.test('cambio password: serve quella attuale, la nuova è lunga, le altre sessioni si chiudono', async () => {
    const a = await S.attemptLogin('anna@example.ch', pw, { ip: '10.5.5.1' });
    const b = await S.attemptLogin('anna@example.ch', pw, { ip: '10.5.5.2' });
    const id = a.user.id;
    assert.equal((await S.changePassword(id, 'sbagliata', 'una-password-nuova-lunga', a.token)).ok, false);
    assert.match((await S.changePassword(id, pw, 'corta', a.token)).error, /almeno 12/);
    assert.equal((await S.changePassword(id, pw, pw, a.token)).ok, false, 'uguale alla vecchia');
    assert.equal((await S.changePassword(id, pw, 'anna@example.ch', a.token)).ok, false, 'uguale all\'email');
    const r = await S.changePassword(id, pw, 'una-password-nuova-lunga', a.token);
    assert.equal(r.ok, true);
    assert.ok(await S.findSession(a.token), 'la sessione in uso resta');
    assert.equal(await S.findSession(b.token), null, 'le altre si chiudono');
    assert.equal((await S.attemptLogin('anna@example.ch', pw, { ip: '10.5.5.3' })).ok, false, 'la vecchia non vale più');
    assert.equal((await S.attemptLogin('anna@example.ch', 'una-password-nuova-lunga', { ip: '10.5.5.4' })).ok, true);
    await S.changePassword(id, 'una-password-nuova-lunga', pw, null);
  });

  await t.test('senza proxy fidato, errori di altre email non bloccano chi accede', async () => {
    for (let i = 0; i < 25; i++) await S.attemptLogin(`x${i}@example.ch`, 'no', { ip: S.UNKNOWN_IP });
    await query('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', ['bruno@example.ch', 'Bruno', await hashPassword(pw), 'editor']);
    const r = await S.attemptLogin('bruno@example.ch', pw, { ip: S.UNKNOWN_IP });
    assert.equal(r.ok, true, 'il limite per indirizzo non deve valere quando l\'indirizzo non è affidabile');
  });

  await t.test('con un indirizzo affidabile, 20 errori lo bloccano', async () => {
    for (let i = 0; i < 20; i++) await S.attemptLogin(`y${i}@example.ch`, 'no', { ip: '203.0.113.7' });
    const r = await S.attemptLogin('bruno@example.ch', pw, { ip: '203.0.113.7' });
    assert.deepEqual([r.ok, r.reason], [false, 'locked']);
  });
});
