import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { encryptSecret, decryptSecret, canEncrypt } from '../lib/settings.mjs';

const SECRET = 'chiave-di-prova-abbastanza-lunga-1234';
const NUL = String.fromCharCode(0);
const withSecret = (v, fn) => { const keep = process.env.SETTINGS_SECRET; if (v === undefined) delete process.env.SETTINGS_SECRET; else process.env.SETTINGS_SECRET = v; try { return fn(); } finally { if (keep === undefined) delete process.env.SETTINGS_SECRET; else process.env.SETTINGS_SECRET = keep; } };

test('cifratura: andata e ritorno, IV diverso a ogni volta, niente testo in chiaro', () => withSecret(SECRET, () => {
  const a = encryptSecret('p@ss "segreta" è ok'); const b = encryptSecret('p@ss "segreta" è ok');
  assert.notEqual(a, b);
  assert.doesNotMatch(a, /segreta/);
  assert.equal(decryptSecret(a), 'p@ss "segreta" è ok');
  assert.equal(decryptSecret(encryptSecret('')), '');
}));

test('cifratura: chiave sbagliata o dato alterato non si decifrano; senza chiave non si cifra', () => {
  const blob = withSecret(SECRET, () => encryptSecret('valore'));
  assert.equal(withSecret('un-altra-chiave-lunga-abbastanza', () => decryptSecret(blob)), null);
  const [v, iv, tag, ct] = blob.split(':');
  const flipped = Buffer.from(ct, 'base64'); flipped[0] ^= 1;
  assert.equal(withSecret(SECRET, () => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))), null, 'GCM rileva la modifica');
  for (const bad of ['', 'v1:a:b', 'v2:a:b:c', null, undefined, 'x']) assert.equal(withSecret(SECRET, () => decryptSecret(bad)), null);
  withSecret(undefined, () => { assert.equal(canEncrypt(), false); assert.throws(() => encryptSecret('x'), /SETTINGS_SECRET/); assert.equal(decryptSecret(blob), null); });
  withSecret('corta', () => assert.equal(canEncrypt(), false, 'una chiave troppo corta non basta'));
});

test('impostazioni email: salvataggio, lettura, uso e invio', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, one, closeDb } = await import('../lib/db.mjs');
  const S = await import('../lib/settings.mjs');
  const M = await import('../lib/mail.mjs');
  const keep = { secret: process.env.SETTINGS_SECRET, host: process.env.SMTP_HOST, from: process.env.MAIL_FROM };
  t.after(async () => { await closeDb(); await dropTestDb(); for (const [k, v] of [['SETTINGS_SECRET', keep.secret], ['SMTP_HOST', keep.host], ['MAIL_FROM', keep.from]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  process.env.SETTINGS_SECRET = SECRET; delete process.env.SMTP_HOST; delete process.env.MAIL_FROM;
  const adminId = Number((await query("INSERT INTO users (email, name, password_hash, role) VALUES ('a@example.ch', 'Anna Admin', 'x', 'admin')")).insertId);
  const good = (over = {}) => ({ host: 'smtp.esempio.ch', port: 587, security: 'starttls', user: 'sito@esempio.ch', password: 'password-molto-segreta', from: 'sito@esempio.ch', fromName: 'Sito Esempio', ...over });
  const errorsOf = async (over) => (await S.saveMailSettings(good(over), adminId)).errors ?? {};

  await t.test('validazione dei campi', async () => {
    assert.ok((await errorsOf({ host: '' })).host);
    for (const host of ['https://smtp.esempio.ch', 'smtp esempio.ch', 'smtp.esempio.ch/percorso', 'a@b.ch', 'smtp.esempio.ch:587', '-x.ch']) assert.ok((await errorsOf({ host })).host, host);
    for (const port of [0, 70000, 'abc', 1.5, '', -1]) assert.ok((await errorsOf({ port })).port, String(port));
    assert.ok((await errorsOf({ security: 'ssl3' })).security);
    assert.ok((await errorsOf({ from: 'non-una-email' })).from);
    assert.ok((await errorsOf({ from: 'a@b.ch\nBcc: x@y.z' })).from);
    assert.ok((await errorsOf({ fromName: 'Sito <evil@x.z>' })).fromName);
    assert.ok((await errorsOf({ fromName: 'Nome\r\nBcc: x@y.z' })).fromName, 'niente intestazioni nascoste');
    assert.ok((await errorsOf({ fromName: 'x'.repeat(101) })).fromName);
    assert.ok((await errorsOf({ user: 'u\nx' })).user);
    assert.ok((await errorsOf({ password: `a${NUL}b` })).password);
    assert.equal((await one('SELECT COUNT(*) AS n FROM settings')).n, 0, 'nulla è stato salvato');
  });

  await t.test('senza chiave di cifratura la password non si salva (e non si salva niente)', async () => {
    delete process.env.SETTINGS_SECRET;
    try { assert.ok((await errorsOf({})).password); } finally { process.env.SETTINGS_SECRET = SECRET; }
    assert.equal((await S.saveMailSettings(good({ password: '', user: '' }), adminId)).ok, true, 'senza password si può salvare anche senza chiave');
    await S.deleteMailSettings();
  });

  await t.test('la password è cifrata nel database e non torna mai al browser', async () => {
    assert.equal((await S.saveMailSettings(good(), adminId)).ok, true);
    const raw = (await one("SELECT value FROM settings WHERE name = 'mail'")).value;
    assert.doesNotMatch(raw, /password-molto-segreta/);
    assert.match(JSON.parse(raw).passwordEnc, /^v1:/);
    const view = await S.mailSettingsView();
    assert.equal(JSON.stringify(view).includes('password-molto-segreta'), false);
    assert.equal(JSON.stringify(view).includes('v1:'), false, 'nemmeno il testo cifrato');
    assert.deepEqual([view.source, view.settings.hasPassword, view.settings.passwordReadable, view.settings.host, view.settings.fromName, view.settings.updatedBy], ['database', true, true, 'smtp.esempio.ch', 'Sito Esempio', 'Anna Admin']);
  });

  await t.test('modifica: password vuota = si tiene la vecchia; nuova = si sostituisce; "rimuovi" o utente vuoto la tolgono', async () => {
    const enc = async () => JSON.parse((await one("SELECT value FROM settings WHERE name = 'mail'")).value).passwordEnc;
    const first = await enc();
    await S.saveMailSettings(good({ password: '', fromName: 'Altro nome' }), adminId);
    assert.equal(await enc(), first, 'cambiare solo il mittente non tocca la password');
    await S.saveMailSettings(good({ password: '', host: 'smtp2.esempio.ch' }), adminId);
    assert.equal(await enc(), null, 'cambiando server la vecchia password non si riusa: va reinserita');
    assert.equal((await S.mailSettingsView()).settings.host, 'smtp2.esempio.ch');
    await S.saveMailSettings(good({ host: 'smtp2.esempio.ch' }), adminId);
    assert.equal(S.decryptSecret(await enc()), 'password-molto-segreta');
    for (const change of [{ port: 465 }, { user: 'altro@esempio.ch' }, { security: 'ssl' }]) {
      await S.saveMailSettings(good({ host: 'smtp2.esempio.ch', password: '', ...change }), adminId);
      assert.equal(await enc(), null, JSON.stringify(change));
      await S.saveMailSettings(good({ host: 'smtp2.esempio.ch', ...change }), adminId);
    }
    await S.saveMailSettings(good({ host: 'smtp2.esempio.ch', security: 'ssl', user: 'altro@esempio.ch', port: 465 }), adminId);
    await S.saveMailSettings(good({ password: 'nuova-per-il-test' }), adminId);
    await S.saveMailSettings(good({ password: 'un-altra-password' }), adminId);
    assert.notEqual(await enc(), first);
    assert.equal(S.decryptSecret(await enc()), 'un-altra-password');
    await S.saveMailSettings(good({ password: '', clearPassword: true }), adminId);
    assert.equal(await enc(), null);
    assert.equal((await S.mailSettingsView()).settings.hasPassword, false);
    await S.saveMailSettings(good(), adminId);
    await S.saveMailSettings(good({ password: '', user: '' }), adminId);
    assert.equal(await enc(), null, 'senza utente non serve la password');
  });

  await t.test('configurazione per nodemailer: modalità di connessione, autenticazione, mittente con nome', async () => {
    await S.saveMailSettings(good({ security: 'ssl', port: 465 }), adminId);
    let c = await S.resolveMailConfig();
    assert.deepEqual([c.source, c.transport.host, c.transport.port, c.transport.secure, c.transport.auth], ['database', 'smtp.esempio.ch', 465, true, { user: 'sito@esempio.ch', pass: 'password-molto-segreta' }]);
    assert.deepEqual(c.from, { name: 'Sito Esempio', address: 'sito@esempio.ch' });
    await S.saveMailSettings(good({ security: 'starttls', password: '', fromName: '' }), adminId);
    c = await S.resolveMailConfig();
    assert.deepEqual([c.transport.secure, c.transport.requireTLS, c.transport.ignoreTLS, c.from], [false, true, undefined, { name: 'Anna Admin', address: 'sito@esempio.ch' }]);   // senza nome del mittente: il nome dell'account amministratore
    await S.saveMailSettings(good({ security: 'none', port: 25, password: '', user: '' }), adminId);
    c = await S.resolveMailConfig();
    assert.deepEqual([c.transport.secure, c.transport.ignoreTLS, c.transport.auth], [false, true, undefined]);
  });

  await t.test('precedenza: impostazioni salvate, poi .env, poi niente', async () => {
    process.env.SMTP_HOST = 'smtp.da-env.ch'; process.env.MAIL_FROM = 'env@esempio.ch';
    assert.equal((await S.resolveMailConfig()).source, 'database');
    assert.equal(await S.deleteMailSettings(), true);
    assert.equal(await S.deleteMailSettings(), false);
    const c = await S.resolveMailConfig();
    assert.deepEqual([c.source, c.transport.host, c.from], ['env', 'smtp.da-env.ch', 'env@esempio.ch']);
    assert.equal((await S.mailSettingsView()).source, 'env');
    delete process.env.SMTP_HOST; delete process.env.MAIL_FROM;
    assert.equal(await S.resolveMailConfig(), null);
    assert.equal((await S.mailSettingsView()).source, 'none');
    assert.equal((await M.sendTestMail('x@example.ch')).ok, false);
  });

  await t.test('chiave cambiata: errore chiaro, mai un invio senza autenticazione', async () => {
    await S.saveMailSettings(good(), adminId);
    process.env.SETTINGS_SECRET = 'una-chiave-diversa-molto-lunga-99';
    try {
      assert.equal((await S.mailSettingsView()).settings.passwordReadable, false);
      await assert.rejects(S.resolveMailConfig(), /non si può decifrare/);
      const r = await M.sendTestMail('x@example.ch');
      assert.deepEqual([r.ok, /decifrare/.test(r.error)], [false, true]);
      const s = await M.sendSubmissionMail({ block: { id: 'f', fields: [], delivery: { recipients: ['a@b.ch'], subject: 's' } }, values: {}, submission: { id: 1, page_key: 'p', created_at: new Date() } });
      assert.equal(s.status, 'failed');
    } finally { process.env.SETTINGS_SECRET = SECRET; }
    await S.deleteMailSettings();
  });

  await t.test('invio vero verso un server SMTP che richiede l\'accesso: usa utente e password salvati', async () => {
    const received = []; let creds = null;
    const server = new SMTPServer({
      allowInsecureAuth: true, disabledCommands: ['STARTTLS'],
      onAuth(auth, _s, cb) { creds = { user: auth.username, pass: auth.password }; return auth.username === 'sito@esempio.ch' && auth.password === 'password-molto-segreta' ? cb(null, { user: 1 }) : cb(new Error('Credenziali rifiutate')); },
      onData(stream, session, cb) { const ch = []; stream.on('data', (c) => ch.push(c)); stream.on('end', () => { received.push({ to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(ch).toString('utf8') }); cb(); }); },
    });
    await new Promise((res) => server.listen(0, '127.0.0.1', res));
    const port = server.server.address().port;
    try {
      await S.saveMailSettings(good({ host: '127.0.0.1', port, security: 'none' }), adminId);
      const ok = await M.sendTestMail('destinataria@example.ch');
      assert.deepEqual([ok.ok, ok.to, ok.via], [true, 'destinataria@example.ch', 'database'], JSON.stringify(ok));
      assert.deepEqual(creds, { user: 'sito@esempio.ch', pass: 'password-molto-segreta' });
      assert.deepEqual(received[0].to, ['destinataria@example.ch']);
      assert.match(received[0].raw, /^From: "?Sito Esempio"? <sito@esempio\.ch>$/m);
      assert.match(received[0].raw, /^Subject: Prova invio email/m);

      await S.saveMailSettings(good({ host: '127.0.0.1', port, security: 'none', password: 'sbagliata' }), adminId);
      const bad = await M.sendTestMail('destinataria@example.ch');
      assert.equal(bad.ok, false);
      assert.match(bad.error, /Credenziali rifiutate|Invalid login|authentication/i);
      assert.equal(received.length, 1, 'con la password sbagliata non parte nulla');

      await S.saveMailSettings(good({ host: '127.0.0.1', port: 1, security: 'none', password: '' }), adminId);
      assert.equal((await M.sendTestMail('destinataria@example.ch')).ok, false, 'server irraggiungibile: errore, non blocco');
    } finally { await new Promise((res) => server.close(res)); }
  });
});
