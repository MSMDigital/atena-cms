// Installazione guidata: chiave, controlli dei campi, scrittura di .env, stato installato, database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-setup-'));
const keep = { data: process.env.DATA_DIR, env: process.env.ENV_FILE, tok: process.env.INSTALL_TOKEN, dbpw: process.env.DB_PASSWORD };
process.env.DATA_DIR = path.join(SANDBOX, 'data');
process.env.ENV_FILE = path.join(SANDBOX, '.env');
delete process.env.INSTALL_TOKEN;
const E = await import('../lib/env.mjs');
E.loadEnv();
const REAL_DB = Object.fromEntries(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_ROOT_PASSWORD'].map((k) => [k, process.env[k]]));   // le prove sul .env cambiano process.env: si ripristina per la prova sul database
const I = await import('../lib/install.mjs');
test.after(() => { for (const [k, v] of Object.entries(REAL_DB)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } fs.rmSync(SANDBOX, { recursive: true, force: true }); for (const [k, v] of [['DATA_DIR', keep.data], ['ENV_FILE', keep.env], ['INSTALL_TOKEN', keep.tok], ['DB_PASSWORD', keep.dbpw]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

test('chiave di installazione: creata una volta, con permessi 600; INSTALL_TOKEN dall\'ambiente ha la precedenza', () => {
  const t = I.installToken();
  assert.ok(t.length >= 30);
  assert.equal(I.installToken(), t, 'stessa chiave a ogni chiamata');
  assert.equal(fs.statSync(path.join(process.env.DATA_DIR, 'install-token')).mode & 0o777, 0o600);
  process.env.INSTALL_TOKEN = 'una-chiave-scelta-da-me-lunga';
  try { assert.equal(I.installToken(), 'una-chiave-scelta-da-me-lunga'); } finally { delete process.env.INSTALL_TOKEN; }
  process.env.INSTALL_TOKEN = 'corta';
  try { assert.equal(I.installToken(), t, 'una chiave troppo corta si ignora'); } finally { delete process.env.INSTALL_TOKEN; }
});

test('chiave: giusta passa, sbagliata no, e dopo 10 errori si blocca anche quella giusta', () => {
  const t = I.installToken();
  for (const bad of ['', undefined, null, 'x', t + 'x', t.slice(1), 'a'.repeat(1000)]) assert.equal(I.checkInstallToken(bad).ok, false, String(bad).slice(0, 10));
  assert.equal(I.checkInstallToken(t).ok, true);
  for (let i = 0; i < 12; i++) I.checkInstallToken('sbagliata' + i);
  const r = I.checkInstallToken(t);
  assert.deepEqual([r.ok, /Troppi tentativi/.test(r.error)], [false, true]);
});

test('controlli dei campi: database, admin, indirizzi', () => {
  const okDb = { host: 'db.esempio.ch', port: 3306, name: 'sito_1', user: 'utente', password: 'PasswordSicura123' };
  assert.deepEqual(I.validateDb(okDb).errors, {});
  for (const [k, v] of [['host', 'http://x'], ['host', 'a b'], ['host', ''], ['port', 0], ['port', 70000], ['port', 'abc'], ['name', 'a;drop'], ['name', ''], ['user', ''], ['password', ''], ['password', "con'apice"], ['password', 'con$dollaro'], ['password', 'con"virgolette'], ['password', 'con\\slash'], ['password', 'con#cancelletto'], ['password', 'a\nb'], ['password', ' spazi ']]) {
    assert.ok(I.validateDb({ ...okDb, [k]: v }).errors[k], `${k}=${JSON.stringify(v)}`);
  }
  const okA = { name: 'Anna', email: 'Anna@Esempio.ch', password: 'una-password-lunga-1', again: 'una-password-lunga-1' };
  assert.deepEqual(I.validateAdmin(okA).errors, {});
  assert.equal(I.validateAdmin(okA).value.email, 'anna@esempio.ch');
  for (const [k, v] of [['email', 'no'], ['email', 'a@b.ch\nBcc: x@y.z'], ['name', ''], ['password', 'corta'], ['again', 'diversa-lunga-lunga']]) assert.ok(I.validateAdmin({ ...okA, [k]: v }).errors[k], k);
  assert.ok(I.validateAdmin({ ...okA, password: 'anna@esempio.ch', again: 'anna@esempio.ch' }).errors.password, 'uguale all\'email');
  assert.equal(I.validateOrigin('https://www.esempio.ch', 'x'), 'https://www.esempio.ch');
  assert.equal(I.validateOrigin('http://localhost:3000/', 'x'), 'http://localhost:3000');
  for (const bad of ['javascript:alert(1)', 'https://x.ch/percorso', 'https://x.ch/?a=1', 'https://u:p@x.ch', 'non un url', 'ftp://x.ch', '']) assert.ok(I.validateOrigin(bad, 'x').error, bad);
});

test('.env: permessi 600, chiavi generate, copia del vecchio, chiavi esistenti conservate, valori letterali', () => {
  const file = process.env.ENV_FILE;
  const db = { host: '127.0.0.1', port: 3307, name: 'sito', user: 'cms', password: 'Password_Sicura-123' };
  const written = I.writeEnv({ db, appOrigin: 'https://admin.esempio.ch', trustProxy: true });
  assert.ok(written.includes('SETTINGS_SECRET') && written.includes('IP_HASH_SECRET'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^DB_PASSWORD=Password_Sicura-123$/m);
  assert.match(text, /^TRUST_PROXY=1$/m);
  const secret = text.match(/^SETTINGS_SECRET=(\S+)$/m)[1];
  assert.ok(secret.length >= 30);
  // seconda scrittura: la chiave che cifra le password non cambia, si tiene una copia del file precedente, le altre variabili si conservano
  fs.appendFileSync(file, 'SMTP_HOST=smtp.esempio.ch\n');
  I.writeEnv({ db: { ...db, password: 'AltraPassword-456' }, appOrigin: 'https://admin.esempio.ch', trustProxy: false });
  const text2 = fs.readFileSync(file, 'utf8');
  assert.equal(text2.match(/^SETTINGS_SECRET=(\S+)$/m)[1], secret);
  assert.match(text2, /^SMTP_HOST=smtp\.esempio\.ch$/m);
  assert.match(text2, /^TRUST_PROXY=0$/m);
  assert.ok(fs.readdirSync(path.dirname(file)).some((n) => n.startsWith('.env.bak-')), 'copia del file precedente');
  assert.equal(process.env.DB_PASSWORD, 'AltraPassword-456', 'anche il processo in corso usa i valori nuovi');
  // e il file si rilegge come lo scrive: caratteri "strani" tra apici
  I.writeEnv({ db: { ...db, password: 'con spazio&e%percento' }, appOrigin: 'https://admin.esempio.ch', trustProxy: true });
  assert.match(fs.readFileSync(file, 'utf8'), /^DB_PASSWORD='con spazio&e%percento'$/m);
});

test('stato: senza il file non installato; con il file installato', async () => {
  delete process.env.DB_PASSWORD;                      // niente database configurato: non si può "adottare"
  fs.rmSync(path.join(process.env.DATA_DIR, 'installed.json'), { force: true });
  assert.equal(await I.isInstalled(), false);
  I.markInstalled({ template: 'x@1.0.0' });
  assert.equal(fs.statSync(path.join(process.env.DATA_DIR, 'installed.json')).mode & 0o777, 0o600);
  assert.equal(await I.isInstalled(), true);
});

test('requisiti: cartelle scrivibili e strumenti presenti', async () => {
  const r = await I.checkRequirements();
  assert.equal(r.ok, true, JSON.stringify(r.items.filter((i) => !i.ok)));
  assert.ok(r.items.some((i) => /sharp/.test(i.name)) && r.items.some((i) => /\.env/.test(i.name)));
});

test('database: connessione, messaggi chiari, tabelle create e ripetibile', { skip: !hasDb && 'database di prova non disponibile' }, async () => {
  for (const [k, v] of Object.entries(REAL_DB)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await setupTestDb();                                  // crea il database di prova e applica le migrazioni
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;
  const good = { host: DB_HOST ?? '127.0.0.1', port: +DB_PORT, name: 'atena_cms_test', user: DB_USER, password: DB_PASSWORD };
  try {
    const again = await I.testAndMigrateDb(good);
    assert.deepEqual([again.ok, again.applied.length], [true, 0], 'database già aggiornato: nulla da applicare');
    const wrongPw = await I.testAndMigrateDb({ ...good, password: 'sbagliata' });
    assert.match(wrongPw.error, /utente o password/);
    const noDb = await I.testAndMigrateDb({ ...good, name: 'database_che_non_esiste_xyz' });
    assert.match(noDb.error, /non esiste o l'utente non ha i permessi/);
    const noServer = await I.testAndMigrateDb({ ...good, port: 1 });
    assert.match(noServer.error, /non risponde/);
    assert.doesNotMatch(JSON.stringify([wrongPw, noDb, noServer]), new RegExp(DB_PASSWORD), 'la password non compare negli errori');
  } finally { await dropTestDb(); }
});
