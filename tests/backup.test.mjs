// Backup e ripristino: andata e ritorno di database, immagini, sito pubblicato e template; sicurezza contro pacchetti ostili o danneggiati.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-backup-'));
const saved = Object.fromEntries(['TEMPLATES_DIR', 'DATA_DIR', 'SITE_OUT_DIR', 'MEDIA_DIR', 'CMS_TEMPLATE_DIR', 'SETTINGS_SECRET', 'ENV_FILE', 'BACKUP_MAX_MB'].map((k) => [k, process.env[k]]));
Object.assign(process.env, { TEMPLATES_DIR: path.join(SANDBOX, 'templates'), DATA_DIR: path.join(SANDBOX, 'data'), SITE_OUT_DIR: path.join(SANDBOX, 'dist'), MEDIA_DIR: path.join(SANDBOX, 'media'), ENV_FILE: path.join(SANDBOX, '.env'), SETTINGS_SECRET: 'chiave-di-prova-abbastanza-lunga-1234' });
delete process.env.CMS_TEMPLATE_DIR;
fs.writeFileSync(process.env.ENV_FILE, 'SETTINGS_SECRET=chiave-di-prova-abbastanza-lunga-1234\n');
fs.cpSync(path.join(ROOT, 'templates/starter'), path.join(process.env.TEMPLATES_DIR, 'starter'), { recursive: true, filter: (s) => !/\/tools(\/|$)/.test(s) });

test('backup: andata e ritorno completo, con le regole di sicurezza del ripristino', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, one, closeDb } = await import('../lib/db.mjs');
  const T = await import('../lib/template.mjs');
  const D = await import('../lib/docs.mjs');
  const M = await import('../lib/media.mjs');
  const B = await import('../lib/backup.mjs');
  const { stopRenderers } = await import('../render/host.mjs');
  t.after(async () => { stopRenderers(); await closeDb(); await dropTestDb(); fs.rmSync(SANDBOX, { recursive: true, force: true }); for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  T.setActiveTemplate('starter');
  await D.seedFromFiles({ template: T.loadTemplateFrom(path.join(T.templatesDir(), 'starter')) });
  const admin = Number((await query("INSERT INTO users (username, email, name, password_hash, role) VALUES ('anna', 'anna@example.ch', 'Anna', 'hash-segreto', 'admin')")).insertId);
  await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [admin]);
  await query("INSERT INTO settings (name, value) VALUES ('general', ?)", [JSON.stringify({ timezone: 'Europe/Rome', note: 'è «così» — ✓ \\ "x" \n a capo; DROP TABLE users;' })]);
  const img = await M.saveUpload(await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 9, g: 99, b: 199 } } }).jpeg().toBuffer(), 'foto.jpg', admin);
  fs.mkdirSync(process.env.SITE_OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SITE_OUT_DIR, 'index.html'), '<h1>sito pubblicato</h1>');
  const docsBefore = await query('SELECT kind, doc_key, draft, published FROM docs ORDER BY id');
  const mediaBefore = fs.readFileSync(path.join(process.env.MEDIA_DIR, img.path));

  let pkg;
  await t.test('crea il pacchetto: manifest per primo, database, immagini, sito, template; niente sessioni né segreti', async () => {
    pkg = await B.createBackup({ includeSite: true, includeSecrets: false, userId: admin });
    assert.match(pkg.name, B.PACKAGE_NAME);
    const files = unzipSync(new Uint8Array(fs.readFileSync(path.join(B.backupsDir(), pkg.name))));
    const names = Object.keys(files);
    assert.equal(names[0], 'manifest.json');
    assert.ok(names.includes('database.jsonl') && names.includes(`media/${img.path}`) && names.includes('site/index.html') && names.some((n) => n.startsWith('templates/starter/')));
    assert.equal(names.includes('secrets.json'), false, 'la chiave dei segreti solo se richiesta');
    const db = Buffer.from(files['database.jsonl']).toString('utf8');
    assert.doesNotMatch(db, /INSERT INTO `sessions`/, 'le sessioni non si portano via');
    assert.match(db, /INSERT INTO `users`/);
    const m = await B.readManifest(path.join(B.backupsDir(), pkg.name));
    assert.deepEqual([m.format, m.app, m.template.id, m.includes.site, m.includes.secrets, m.database.tables.users], [1, 'atena-cms', 'starter', true, false, 1]);
    assert.equal(B.listBackups()[0].name, pkg.name);
    const withSecrets = await B.createBackup({ includeSecrets: true, tag: 'prova' });
    assert.match(withSecrets.name, /-prova\.zip$/);
    assert.ok('secrets.json' in unzipSync(new Uint8Array(fs.readFileSync(path.join(B.backupsDir(), withSecrets.name)))));
    B.deleteBackup(withSecrets.name);
  });

  await t.test('ripristino: database, immagini e sito tornano com\'erano; sessioni azzerate; backup di sicurezza fatto', async () => {
    // si rovina tutto
    await query('DELETE FROM docs'); await query("UPDATE users SET name = 'Rovinato', password_hash = 'altro'"); await query("DELETE FROM settings WHERE name = 'general'");
    fs.writeFileSync(path.join(process.env.MEDIA_DIR, img.path), 'rovinata'); fs.rmSync(process.env.SITE_OUT_DIR, { recursive: true, force: true });
    fs.writeFileSync(path.join(process.env.MEDIA_DIR, 'uploads', 'estranea.webp'), 'x');
    const r = await B.restoreBackup(path.join(B.backupsDir(), pkg.name), { userId: null });
    assert.equal(r.ok, true);
    assert.match(r.safety, /-pre\.zip$/);
    assert.ok(fs.existsSync(path.join(B.backupsDir(), r.safety)), 'il backup di sicurezza esiste');
    const docsAfter = await query('SELECT kind, doc_key, draft, published FROM docs ORDER BY id');
    assert.deepEqual(docsAfter, docsBefore);
    const u = await one("SELECT name, password_hash, username FROM users WHERE id = ?", [admin]);
    assert.deepEqual([u.name, u.password_hash, u.username], ['Anna', 'hash-segreto', 'anna']);
    assert.equal((await query('SELECT COUNT(*) AS n FROM sessions'))[0].n, 0, 'si riaccede');
    assert.deepEqual(JSON.parse((await one("SELECT value FROM settings WHERE name = 'general'")).value).note, 'è «così» — ✓ \\ "x" \n a capo; DROP TABLE users;', 'testo con virgolette, a capo e punto e virgola intatto');
    assert.deepEqual(fs.readFileSync(path.join(process.env.MEDIA_DIR, img.path)), mediaBefore);
    assert.equal(fs.existsSync(path.join(process.env.MEDIA_DIR, 'uploads', 'estranea.webp')), false, 'il resto delle immagini è quello del backup');
    assert.equal(fs.readFileSync(path.join(process.env.SITE_OUT_DIR, 'index.html'), 'utf8'), '<h1>sito pubblicato</h1>');
    assert.equal((await query('SELECT COUNT(*) AS n FROM schema_migrations'))[0].n > 0, true);
  });

  await t.test('pacchetti ostili o rotti: rifiutati senza toccare il sito', async () => {
    const dir = B.restoreDir(); fs.mkdirSync(dir, { recursive: true });
    const manifest = (extra = {}) => strToU8(JSON.stringify({ format: 1, app: 'atena-cms', createdAt: new Date().toISOString(), migrations: [], database: { sha256: 'x', tables: {} }, includes: {}, files: {}, ...extra }));
    const write = (name, files) => { const f = path.join(dir, name); fs.writeFileSync(f, Buffer.from(zipSync(files))); return f; };
    const rejects = async (file, re) => { const before = await query('SELECT COUNT(*) AS n FROM docs'); await assert.rejects(B.restoreBackup(file, { install: true }), re); assert.deepEqual(await query('SELECT COUNT(*) AS n FROM docs'), before, 'il database non è cambiato'); };
    await rejects(write('non-zip.zip', { 'ciao.txt': strToU8('x') }), /manifest all'inizio|non è un backup di Atena/);
    await rejects(write('ostile.zip', { 'manifest.json': manifest(), 'media/../../fuori.txt': strToU8('x') }), /percorso non ammesso/);
    await rejects(write('assoluto.zip', { 'manifest.json': manifest(), '/etc/passwd': strToU8('x') }), /percorso non ammesso/);
    await rejects(write('altro.zip', { 'manifest.json': manifest(), 'app/segreto.js': strToU8('x') }), /non è un backup di Atena/);
    await rejects(write('futuro.zip', { 'manifest.json': manifest({ migrations: ['999_dal_futuro.sql'] }), 'database.jsonl': strToU8('') }), /versione più recente/);
    await rejects(write('senza-db.zip', { 'manifest.json': manifest() }), /manca il database/);
    const line = `${JSON.stringify('DELETE FROM docs')}\n`;
    await rejects(write('manomesso.zip', { 'manifest.json': manifest({ database: { sha256: crypto.createHash('sha256').update('altro').digest('hex'), tables: {} } }), 'database.jsonl': strToU8(line) }), /danneggiato/);
    await rejects(write('formato.zip', { 'manifest.json': manifest({ format: 99 }), 'database.jsonl': strToU8('') }), /versione di formato diversa|non è un backup/);
    const good = path.join(B.backupsDir(), pkg.name); const bytes = fs.readFileSync(good);
    fs.writeFileSync(path.join(dir, 'tagliato.zip'), bytes.subarray(0, Math.floor(bytes.length * 0.6)));
    await assert.rejects(B.restoreBackup(path.join(dir, 'tagliato.zip'), { install: true }));
    assert.ok((await query('SELECT COUNT(*) AS n FROM docs'))[0].n > 0, 'dopo un pacchetto tagliato i contenuti ci sono ancora');
    const list = await B.listRestoreFiles();
    assert.equal(list.find((f) => f.name === 'non-zip.zip').valid, false);
    process.env.BACKUP_MAX_MB = '0.0001';
    await assert.rejects(B.restoreBackup(good, { install: true }), /supera il limite/);
    delete process.env.BACKUP_MAX_MB;
  });

  await t.test('nomi: solo pacchetti con il nome giusto si scaricano o si eliminano', () => {
    assert.equal(B.backupPath('../../.env'), null);
    assert.equal(B.backupPath('atena-backup-20260101-000000.zip.json'), null);
    assert.ok(B.backupPath(pkg.name));
    assert.equal(B.restoreFilePath('../x.zip'), null);
    assert.equal(B.deleteBackup('non-esiste.zip'), false);
  });
});
