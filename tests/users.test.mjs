// Utenti: ruoli, permessi, creazione e modifica con le regole di sicurezza, password, accesso con nome utente, dati pubblici degli autori.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { ownsDoc, ownsMedia, canWrite, isAdmin, authorIs, atLeast } from '../lib/permissions.mjs';
import { passwordProblem, strongPassword } from '../lib/password.mjs';

test('permessi: amministratore tutto, autore solo il proprio, normale niente', () => {
  const admin = { id: 1, role: 'admin', name: 'Anna Admin', username: 'anna' };
  const author = { id: 2, role: 'author', name: 'Bruno Bianchi', username: 'bruno' };
  const normal = { id: 3, role: 'normal', name: 'Carla', username: 'carla' };
  assert.deepEqual([isAdmin(admin), isAdmin(author), canWrite(admin), canWrite(author), canWrite(normal)], [true, false, true, true, false]);
  assert.equal(atLeast(author, 'author'), true); assert.equal(atLeast(normal, 'author'), false); assert.equal(atLeast(author, 'admin'), false);
  const mine = { created_by: 2, draft: {} };
  const assigned = { created_by: 1, draft: { author: 'Bruno Bianchi' } };
  const byUsername = { created_by: null, draft: { author: 'bruno' } };
  const other = { created_by: 1, draft: { author: 'Anna Admin' } };
  const legacy = { created_by: null, draft: {} };
  for (const d of [mine, assigned, byUsername]) assert.equal(ownsDoc(author, d), true);
  for (const d of [other, legacy]) assert.equal(ownsDoc(author, d), false, 'i contenuti di altri e quelli storici non sono dell\'autore');
  assert.equal(ownsDoc(admin, other), true);
  assert.equal(ownsDoc(normal, { created_by: 3, draft: {} }), false, 'un utente normale non modifica nulla, nemmeno ciò che risulta suo');
  assert.equal(authorIs('BRUNO', author), true);
  assert.equal(ownsMedia(author, { source: 'upload', uploaded_by: 2 }), true);
  assert.equal(ownsMedia(author, { source: 'upload', uploaded_by: 1 }), false);
  assert.equal(ownsMedia(author, { source: 'project', uploaded_by: null }), false);
  assert.equal(ownsMedia(admin, { source: 'upload', uploaded_by: 2 }), true);
});

test('password: lunghezza, varietà, niente dati personali; quelle generate la rispettano sempre', () => {
  assert.match(passwordProblem('corta1A!'), /almeno 12/);
  assert.match(passwordProblem('soloMinuscoleeee'), /tre tipi/);
  assert.match(passwordProblem('Mario.Rossi-2026!', { username: 'mario.rossi' }), /nome utente/);
  assert.match(passwordProblem('Abcd1234-xyzQ!'), /prevedibile/);
  assert.equal(passwordProblem('Tr@monto-Blu-4821', { username: 'anna', email: 'anna@example.ch' }), null);
  for (let i = 0; i < 200; i++) assert.equal(passwordProblem(strongPassword({ username: 'anna' }), { username: 'anna' }), null);
});

test('utenti: creazione, modifica, ultimo admin, password, eliminazione, accesso con nome utente, dati pubblici', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, closeDb } = await import('../lib/db.mjs');
  const U = await import('../lib/users.mjs');
  const S = await import('../lib/sessions.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); });
  const pw = 'Tr@monto-Blu-4821';
  const base = (o = {}) => ({ username: 'anna', email: 'anna@example.ch', role: 'admin', password: pw, firstName: 'Anna', lastName: 'Rossi', ...o });

  const a = await U.createUser(base(), null);
  assert.equal(a.ok, true, JSON.stringify(a));
  const admin = { id: a.id, role: 'admin', name: 'Anna Rossi', username: 'anna' };

  await t.test('validazione: nome utente, email, ruolo, password, social, immagine', async () => {
    const bad = await U.createUser({ username: 'A', email: 'no', role: 'dio', password: 'x', firstName: '', linkedin: 'http://x', socials: [{ label: 'X', url: 'no' }], avatar: '../x' }, admin);
    assert.deepEqual(Object.keys(bad.errors).sort(), ['avatar', 'email', 'firstName', 'linkedin', 'role', 'socials', 'username']);
    assert.match((await U.createUser(base({ username: 'bruno', email: 'b@example.ch', password: 'debole' }), admin)).errors.password, /almeno 12/);
    assert.match((await U.createUser(base({ username: 'anna', email: 'altra@example.ch' }), admin)).errors.username, /già in uso/);
    assert.match((await U.createUser(base({ username: 'anna2', email: 'ANNA@example.ch' }), admin)).errors.email, /già in uso/);
  });

  await t.test('profilo completo: social, SEO/GEO, nome completo', async () => {
    const r = await U.createUser(base({ username: 'bruno', email: 'bruno@example.ch', role: 'author', firstName: 'Bruno', lastName: 'Bianchi', description: 'Scrivo di cose.', linkedin: 'https://www.linkedin.com/in/bruno', socials: [{ label: 'Instagram', url: 'https://instagram.com/bruno' }], seo: { title: 'Bruno', jobTitle: 'Coach', knowsAbout: 'leadership, ascolto,  ', noindex: true } }), admin);
    assert.equal(r.ok, true, JSON.stringify(r));
    const u = await U.getUser(r.id);
    assert.deepEqual([u.name, u.role, u.socials.length, u.seo.knowsAbout, u.seo.noindex, u.seo.jobTitle], ['Bruno Bianchi', 'author', 1, ['leadership', 'ascolto'], true, 'Coach']);
  });

  await t.test('accesso con nome utente o con email', async () => {
    assert.equal((await S.attemptLogin('anna', pw, { ip: '10.1.1.1' })).ok, true);
    assert.equal((await S.attemptLogin('ANNA@example.ch', pw, { ip: '10.1.1.2' })).ok, true);
    assert.equal((await S.attemptLogin('anna', 'sbagliata', { ip: '10.1.1.3' })).ok, false);
  });

  await t.test('ultimo amministratore e se stessi', async () => {
    assert.match((await U.updateUser(a.id, { ...(await U.getUser(a.id)), role: 'author' }, admin)).error, /te stesso/);
    assert.match((await U.updateUser(a.id, { ...(await U.getUser(a.id)), active: false }, admin)).error, /te stesso/);
    assert.match((await U.deleteUser(a.id, admin)).error, /tuo stesso account/);
    const b = (await U.listUsers()).find((u) => u.username === 'bruno');
    // un secondo admin: ora il primo si può declassare, ma l'ultimo rimasto no
    assert.equal((await U.updateUser(b.id, { ...b, role: 'admin' }, admin)).ok, true);
    const bAdmin = { id: b.id, role: 'admin', name: b.name, username: 'bruno' };
    assert.equal((await U.updateUser(a.id, { ...(await U.getUser(a.id)), role: 'normal' }, bAdmin)).ok, true);
    assert.match((await U.updateUser(b.id, { ...(await U.getUser(b.id)), role: 'author' }, bAdmin)).error, /te stesso/);
    const third = { id: 4242, role: 'admin', name: 'Terzo', username: 'terzo' };   // un altro admin (inesistente nel DB) che prova a declassare l'ultimo admin vero
    assert.match((await U.updateUser(b.id, { ...(await U.getUser(b.id)), role: 'author' }, third)).error, /almeno un amministratore/);
    assert.match((await U.deleteUser(b.id, third)).error, /almeno un amministratore/);
    await query("UPDATE users SET role = 'admin' WHERE id = ?", [a.id]);
    await query("UPDATE users SET role = 'author' WHERE id = ?", [b.id]);
  });

  await t.test('un utente cambia solo il proprio profilo, non ruolo né email', async () => {
    const b = (await U.listUsers()).find((u) => u.username === 'bruno');
    const self = { id: b.id, role: 'author', name: b.name, username: 'bruno' };
    const r = await U.updateUser(b.id, { ...b, description: 'Nuova bio', role: 'admin', email: 'hack@example.ch', username: 'hack' }, self);
    assert.equal(r.ok, true);
    const after = await U.getUser(b.id);
    assert.deepEqual([after.role, after.email, after.username, after.description], ['author', 'bruno@example.ch', 'bruno', 'Nuova bio']);
    assert.match((await U.updateUser(a.id, { ...(await U.getUser(a.id)), description: 'x' }, self)).error, /Non puoi/);
  });

  await t.test('reimposta la password: generata o scelta, chiude le sessioni, rispetta la politica', async () => {
    const b = (await U.listUsers()).find((u) => u.username === 'bruno');
    const login = await S.attemptLogin('bruno', pw, { ip: '10.2.2.1' });
    assert.equal(login.ok, true);
    const gen = await U.resetPassword(b.id, admin);
    assert.equal(gen.ok, true);
    assert.equal(passwordProblem(gen.password, b), null);
    assert.equal((await S.findSession(login.token)), null, 'le sessioni dell\'utente sono chiuse');
    assert.equal((await S.attemptLogin('bruno', pw, { ip: '10.2.2.2' })).ok, false, 'la vecchia non vale più');
    assert.equal((await S.attemptLogin('bruno', gen.password, { ip: '10.2.2.3' })).ok, true);
    assert.match((await U.resetPassword(b.id, admin, 'debole')).error, /almeno 12/);
    assert.deepEqual(await U.resetPassword(b.id, admin, 'Nuova-Pass-9087!'), { ok: true, password: null });
  });

  await t.test('dati pubblici degli autori: niente email né password; solo chi scrive, attivo e visibile', async () => {
    const c = await U.createUser(base({ username: 'carla', email: 'carla@example.ch', role: 'normal', firstName: 'Carla' }), admin);
    const d = await U.createUser(base({ username: 'dario', email: 'dario@example.ch', role: 'author', firstName: 'Dario', showPublic: false }), admin);
    assert.equal(c.ok && d.ok, true);
    const pub = await U.publicAuthors();
    assert.deepEqual(pub.map((x) => x.username), ['anna', 'bruno'], 'normali e nascosti restano fuori');
    const json = JSON.stringify(pub);
    assert.equal(/example\.ch|hash|scrypt|password/i.test(json), false, 'nessun dato riservato');
  });

  await t.test('elimina un utente: i suoi contenuti restano, senza proprietario', async () => {
    const { saveDraft } = await import('../lib/docs.mjs');
    const b = (await U.listUsers()).find((u) => u.username === 'bruno');
    await saveDraft('post', 'di-bruno', { key: 'di-bruno', status: 'draft', slug: { it: 'di-bruno' }, title: { it: 'Di Bruno' }, date: '2026-01-01', blocks: [] }, b.id);
    assert.equal((await query("SELECT created_by FROM docs WHERE doc_key = 'di-bruno'"))[0].created_by, b.id);
    assert.equal((await U.deleteUser(b.id, admin)).ok, true);
    assert.equal((await query("SELECT created_by FROM docs WHERE doc_key = 'di-bruno'"))[0].created_by, null);
    assert.match((await U.deleteUser(999999, admin)).error, /non esiste/);
  });
});

test('utenti: azioni di massa (ruolo, profilo spento, eliminazione) con le regole di sicurezza', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, closeDb } = await import('../lib/db.mjs');
  const U = await import('../lib/users.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); });
  const mk = async (username, role) => (await U.createUser({ username, email: `${username}@example.ch`, role, password: 'Tr@monto-Blu-4821', firstName: username }, null)).id;
  const [a, b, c, d] = [await mk('anna', 'admin'), await mk('bruno', 'author'), await mk('carla', 'author'), await mk('dario', 'normal')];
  const admin = { id: a, role: 'admin', name: 'anna', username: 'anna' };
  const roleOf = async (id) => (await query('SELECT role FROM users WHERE id = ?', [id]))[0]?.role;

  assert.match((await U.bulkUsers([], 'role', { role: 'author' }, admin)).error, /Nessun utente/);
  assert.match((await U.bulkUsers([b], 'boh', {}, admin)).error, /non valida/);
  assert.match((await U.bulkUsers([b], 'role', { role: 'dio' }, admin)).error, /nuovo ruolo/);

  const r1 = await U.bulkUsers([b, c], 'role', { role: 'normal' }, admin);
  assert.deepEqual([r1.ok, r1.done, r1.skipped.length], [true, 2, 0]);
  assert.deepEqual([await roleOf(b), await roleOf(c)], ['normal', 'normal']);

  const r2 = await U.bulkUsers([a, b], 'role', { role: 'author' }, admin);
  assert.equal(r2.done, 1);
  assert.match(r2.skipped[0], /anna: non puoi farlo su te stesso/);
  assert.equal(await roleOf(a), 'admin');

  const r3 = await U.bulkUsers([b, c], 'hide', {}, admin);
  assert.equal(r3.done, 2);
  assert.deepEqual((await query('SELECT show_public FROM users WHERE id IN (?, ?)', [b, c])).map((x) => x.show_public), [0, 0]);
  await U.bulkUsers([b], 'show', {}, admin);
  assert.equal((await U.publicAuthors()).some((x) => x.username === 'bruno'), true, 'bruno è di nuovo visibile');   // ruolo author dopo r2

  // ultimo admin: un altro admin (fittizio) non può declassarlo né eliminarlo
  const other = { id: 999999, role: 'admin' };
  const r4 = await U.bulkUsers([a], 'role', { role: 'author' }, other);
  assert.match(r4.skipped[0], /almeno un amministratore/);
  const r5 = await U.bulkUsers([a], 'delete', {}, other);
  assert.match(r5.skipped[0], /almeno un amministratore/);
  assert.equal(await roleOf(a), 'admin');

  const r6 = await U.bulkUsers([a, c, d], 'delete', {}, admin);
  assert.equal(r6.done, 2);
  assert.match(r6.skipped[0], /te stesso/);
  assert.deepEqual((await query('SELECT username FROM users ORDER BY id')).map((x) => x.username), ['anna', 'bruno']);
});
