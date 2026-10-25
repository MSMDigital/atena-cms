// Backup e ripristino dell'intero sito, nello spirito del plugin Duplicator di WordPress: UN pacchetto zip con tutto, da riportare su un altro
// server (o sullo stesso) e ripristinare dall'admin oppure dalla procedura di installazione.
//
// Il pacchetto (atena-backup-AAAAMMGG-HHMMSS.zip) contiene, in quest'ordine:
//   manifest.json            versione del formato, data, template, migrazioni, conteggi e impronta (SHA-256) del database
//   database.jsonl           il database: una riga JSON per istruzione SQL (DROP/CREATE/INSERT); niente da interpretare, nessun ";" ambiguo
//   config/active-template.json, templates/<id>/…   il template attivo (si copia solo se sul server di arrivo manca)
//   media/…                  le immagini caricate
//   site/…                   il sito pubblicato (facoltativo: si rigenera con «Pubblica»)
//   secrets.json             la chiave che cifra le password email salvate (facoltativa: senza, quelle password vanno reinserite)
// NON contiene .env, le password del database né il codice del CMS (quello si installa a parte, come per un sito nuovo).
//
// Sicurezza del ripristino: il pacchetto non è mai fidato. Si leggono solo nomi di file ammessi (niente «..», percorsi assoluti o cartelle
// fuori dall'elenco), con tetti al numero di file e ai byte scritti; si estrae prima in una cartella provvisoria e solo se tutto è a posto si
// tocca il sito; prima di sovrascrivere un sito con dati si fa un backup di sicurezza.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import mysql from 'mysql2/promise';
import mysqlRaw from 'mysql2';
import { Zip, ZipDeflate, Unzip, UnzipInflate } from 'fflate';
import { ROOT, loadEnv, envFile } from './env.mjs';
import { withLock } from './db.mjs';
import { dataDir, templatesDir, activeTemplateId } from './template.mjs';
import { mediaDir } from './media.mjs';
import { migrate } from './migrate.mjs';
import { audit } from './audit.mjs';
import { decryptSecret } from './settings.mjs';

export const FORMAT = 1;
export const backupsDir = () => path.join(dataDir(), 'backups', 'packages');
export const restoreDir = () => path.join(dataDir(), 'restore');
const siteDir = () => { loadEnv(); return path.resolve(process.env.SITE_OUT_DIR ?? path.join(ROOT, 'dist')); };
const maxBytes = () => { loadEnv(); return (+process.env.BACKUP_MAX_MB || 4096) * 1024 * 1024; };
const MAX_FILES = 300_000;
const EXCLUDED_ROWS = new Set(['sessions', 'login_attempts']);   // sessioni e tentativi di accesso non si portano via

export const PACKAGE_NAME = /^atena-backup-\d{8}-\d{6}(?:-[a-z]{1,8})?\.zip$/;
export const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.zip$/;

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');

const dbConf = () => {
  loadEnv();
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  return { host: DB_HOST ?? '127.0.0.1', port: +(DB_PORT ?? 3306), database: DB_NAME, user: DB_USER, password: DB_PASSWORD };
};

// ---- scrittura dello zip, in streaming (nessun file intero in memoria) ----------------------------------------------------------------

class ZipWriter {
  constructor(file) {
    this.out = fs.createWriteStream(file, { mode: 0o600 });
    this.err = null;
    this.done = new Promise((res, rej) => { this.out.on('finish', res); this.out.on('error', rej); });
    this.zip = new Zip((err, chunk, final) => { if (err) { this.err = err; return; } this.out.write(chunk); if (final) this.out.end(); });
  }
  async drain() { if (this.out.writableNeedDrain) await once(this.out, 'drain'); if (this.err) throw this.err; }
  // Tutto con deflate (anche i file già compressi, a livello 0): chi legge lo zip in streaming non gestisce i file «stored» con descrittore di dati.
  async addBuffer(name, buf, level = 6) { const f = new ZipDeflate(name, { level }); this.zip.add(f); f.push(buf, true); await this.drain(); }
  async addFile(name, file, level = 6) {
    const f = new ZipDeflate(name, { level }); this.zip.add(f);
    for await (const chunk of fs.createReadStream(file, { highWaterMark: 256 * 1024 })) { f.push(chunk, false); await this.drain(); }
    f.push(new Uint8Array(0), true);
    await this.drain();
  }
  async finish() { this.zip.end(); await this.done; if (this.err) throw this.err; }
}

const PRECOMPRESSED = /\.(webp|jpe?g|png|gif|woff2?|zip|mp4|webm|avif)$/i;

// File normali di una cartella (niente collegamenti simbolici), con percorso relativo in stile POSIX.
function listFiles(root, { skipDirs = [], skipFile = () => false } = {}) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!skipDirs.includes(e.name)) walk(abs, r); }
      else if (e.isFile() && !skipFile(e.name)) out.push({ rel: r, abs, size: fs.statSync(abs).size });
    }
  };
  walk(root, '');
  return out;
}

// ---- database: dump e importazione ----------------------------------------------------------------------------------------------------

async function dumpDatabase(file) {
  const conn = await mysql.createConnection({ ...dbConf(), charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, timezone: 'Z' });
  const out = fs.createWriteStream(file, { mode: 0o600 });
  const hash = crypto.createHash('sha256');
  const line = async (sql) => { const s = `${JSON.stringify(sql)}\n`; hash.update(s); if (!out.write(s)) await once(out, 'drain'); };
  const counts = {};
  try {
    const tables = (await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"))[0].map((r) => Object.values(r)[0]);
    await line('SET NAMES utf8mb4');
    await line('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) {
      const q = mysqlRaw.escapeId(t);
      const create = (await conn.query(`SHOW CREATE TABLE ${q}`))[0][0]['Create Table'];
      await line(`DROP TABLE IF EXISTS ${q}`);
      await line(create);
      counts[t] = 0;
      if (EXCLUDED_ROWS.has(t)) continue;
      const pk = (await conn.query(`SHOW KEYS FROM ${q} WHERE Key_name = 'PRIMARY'`))[0].sort((a, b) => a.Seq_in_index - b.Seq_in_index).map((k) => mysqlRaw.escapeId(k.Column_name));
      const order = pk.length ? ` ORDER BY ${pk.join(', ')}` : '';
      for (let offset = 0; ; offset += 500) {
        const [rows, fields] = await conn.query(`SELECT * FROM ${q}${order} LIMIT 500 OFFSET ${offset}`);
        if (!rows.length) break;
        const cols = fields.map((f) => mysqlRaw.escapeId(f.name)).join(', ');
        let batch = []; let size = 0;
        const flush = async () => { if (batch.length) { await line(`INSERT INTO ${q} (${cols}) VALUES ${batch.join(', ')}`); batch = []; size = 0; } };
        for (const r of rows) {
          const v = `(${fields.map((f) => mysqlRaw.escape(r[f.name])).join(', ')})`;
          batch.push(v); size += v.length; counts[t]++;
          if (size > 2_000_000) await flush();
        }
        await flush();
        if (rows.length < 500) break;
      }
    }
    await line('SET FOREIGN_KEY_CHECKS = 1');
  } finally { await conn.end(); }
  out.end(); await once(out, 'finish');
  return { sha256: hash.digest('hex'), counts };
}

async function importDatabase(file) {
  const conn = await mysql.createConnection({ ...dbConf(), charset: 'utf8mb4', multipleStatements: false });
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of (await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"))[0].map((r) => Object.values(r)[0])) await conn.query(`DROP TABLE IF EXISTS ${mysqlRaw.escapeId(t)}`);   // anche le tabelle che il backup non conosce: le migrazioni le ricreano
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const l of rl) { if (!l) continue; const sql = JSON.parse(l); if (typeof sql !== 'string') throw new Error('database.jsonl non valido'); await conn.query(sql); }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally { await conn.end(); }
}

// ---- creazione --------------------------------------------------------------------------------------------------------------------------

const migrationNames = () => fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

// Crea il pacchetto in data/backups/packages. Opzioni: includeSite (il sito pubblicato), includeSecrets (la chiave delle password email), tag (suffisso nel nome).
export async function createBackup({ includeSite = true, includeSecrets = false, tag = null, userId = null } = {}) {
  const run = await withLock('cms-backup', () => createInner({ includeSite, includeSecrets, tag, userId }), 0);
  if (!run.ok) throw new Error('Un altro backup o ripristino è in corso: riprova tra un momento.');
  return run.value;
}

async function createInner({ includeSite, includeSecrets, tag, userId }) {
  loadEnv();
  fs.mkdirSync(backupsDir(), { recursive: true, mode: 0o700 });
  const name = `atena-backup-${stamp()}${tag ? `-${String(tag).replace(/[^a-z]/g, '').slice(0, 8)}` : ''}.zip`;
  const final = path.join(backupsDir(), name);
  const tmp = `${final}.part`;
  fs.mkdirSync(dataDir(), { recursive: true });
  const work = fs.mkdtempSync(path.join(dataDir(), 'backup-work-'));
  try {
    const dbFile = path.join(work, 'database.jsonl');
    const db = await dumpDatabase(dbFile);
    const media = listFiles(mediaDir(), { skipDirs: ['.thumbs'], skipFile: (n) => n.endsWith('.tmp') || n.endsWith('.part') });
    const site = includeSite ? listFiles(siteDir()) : [];
    const tplId = activeTemplateId();
    const tplRoot = tplId ? path.join(templatesDir(), tplId) : null;
    const tplFiles = tplRoot ? listFiles(tplRoot, { skipDirs: ['node_modules', '.git'] }) : [];
    const secrets = includeSecrets && process.env.SETTINGS_SECRET ? { SETTINGS_SECRET: process.env.SETTINGS_SECRET } : null;
    const manifest = {
      format: FORMAT, app: 'atena-cms', createdAt: new Date().toISOString(), template: tplId ? { id: tplId } : null,
      migrations: migrationNames(), database: { sha256: db.sha256, tables: db.counts },
      files: { media: media.length, site: site.length, template: tplFiles.length }, bytes: { media: media.reduce((n, f) => n + f.size, 0), site: site.reduce((n, f) => n + f.size, 0) },
      includes: { site: includeSite, secrets: !!secrets }, siteUrl: process.env.APP_ORIGIN ?? null,
    };
    const z = new ZipWriter(tmp);
    await z.addBuffer('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    await z.addFile('database.jsonl', dbFile);
    if (tplId) await z.addBuffer('config/active-template.json', Buffer.from(JSON.stringify({ id: tplId })));
    for (const f of tplFiles) await z.addFile(`templates/${tplId}/${f.rel}`, f.abs, PRECOMPRESSED.test(f.rel) ? 0 : 6);
    for (const f of media) await z.addFile(`media/${f.rel}`, f.abs, PRECOMPRESSED.test(f.rel) ? 0 : 6);
    for (const f of site) await z.addFile(`site/${f.rel}`, f.abs, PRECOMPRESSED.test(f.rel) ? 0 : 6);
    if (secrets) await z.addBuffer('secrets.json', Buffer.from(JSON.stringify(secrets)));
    await z.finish();
    fs.renameSync(tmp, final);
    fs.writeFileSync(`${final}.json`, JSON.stringify(manifest), { mode: 0o600 });   // riassunto per l'elenco (senza dover riaprire lo zip)
    await audit(userId, 'backup.create', `${name} (${(fs.statSync(final).size / 1048576).toFixed(1)} MB)`);
    return { name, size: fs.statSync(final).size, manifest };
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

// ---- elenco ----------------------------------------------------------------------------------------------------------------------------------

const summary = (m) => m && ({ createdAt: m.createdAt, template: m.template?.id ?? null, includesSite: !!m.includes?.site, includesSecrets: !!m.includes?.secrets, media: m.files?.media ?? 0, bytesMedia: m.bytes?.media ?? 0 });

export function listBackups() {
  const dir = backupsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => PACKAGE_NAME.test(n)).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    let m = null; try { m = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')); } catch { /* senza riassunto */ }
    return { name, size: st.size, modifiedAt: st.mtime.toISOString(), ...summary(m) };
  }).sort((a, b) => b.name.localeCompare(a.name));
}

export const backupPath = (name) => (PACKAGE_NAME.test(String(name)) ? path.join(backupsDir(), name) : null);

export function deleteBackup(name) {
  const p = backupPath(name);
  if (!p || !fs.existsSync(p)) return false;
  fs.rmSync(p, { force: true }); fs.rmSync(`${p}.json`, { force: true });
  return true;
}

// Pacchetti caricati a mano (FTP) in data/restore: si ripristinano da lì, come con Duplicator.
export async function listRestoreFiles() {
  const dir = restoreDir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((n) => UPLOAD_NAME.test(n))) {
    const file = path.join(dir, name);
    let m = null; try { m = await readManifest(file); } catch { /* non è un pacchetto valido */ }
    out.push({ name, size: fs.statSync(file).size, valid: !!m, ...summary(m) });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export const restoreFilePath = (name) => (UPLOAD_NAME.test(String(name)) ? path.join(restoreDir(), name) : null);

// ---- lettura sicura dello zip (streaming) ----------------------------------------------------------------------------------------------------

const ALLOWED = [/^manifest\.json$/, /^database\.jsonl$/, /^secrets\.json$/, /^config\/active-template\.json$/, /^media\/[^\0]+$/, /^site\/[^\0]+$/, /^templates\/[a-z][a-z0-9-]{1,40}\/[^\0]+$/];
function safeName(raw) {
  const n = String(raw);
  if (n.endsWith('/')) return null;   // le cartelle si creano da sole
  if (n.includes('\\') || n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.includes('//') || n.split('/').some((s) => s === '..' || s === '.' || s === '') || Array.from(n).some((c) => c.charCodeAt(0) < 32)) throw new Error(`Il pacchetto contiene un percorso non ammesso: ${n.slice(0, 80)}`);
  if (!ALLOWED.some((r) => r.test(n))) throw new Error(`Il pacchetto contiene un file che non è un backup di Atena: ${n.slice(0, 80)}`);
  return n;
}

class Stop extends Error {}

// Legge lo zip in streaming. handler.open(name) → { write(chunk), end() } oppure null per saltare il file.
async function streamZip(zipPath, handler) {
  const unzip = new Unzip(); unzip.register(UnzipInflate);
  let files = 0; let total = 0; let failure = null;
  unzip.onfile = (f) => {
    if (failure) return;
    try {
      if (++files > MAX_FILES) throw new Error('Il pacchetto contiene troppi file.');
      const n = safeName(f.name);
      const sink = n && handler.open(n);
      if (!sink) return;
      f.ondata = (err, chunk, last) => {
        if (failure) return;
        if (err) { failure = err; return; }
        total += chunk.length;
        if (total > maxBytes()) { failure = new Error('Il pacchetto, una volta aperto, supera il limite consentito (BACKUP_MAX_MB).'); return; }
        try { sink.write(chunk); if (last) sink.end(); } catch (e) { failure = e; }
      };
      f.start();
    } catch (e) { failure = e; }
  };
  try {
    for await (const chunk of fs.createReadStream(zipPath, { highWaterMark: 256 * 1024 })) {
      unzip.push(chunk, false);
      if (failure) break;
      await handler.flush?.();
    }
    if (!failure) unzip.push(new Uint8Array(0), true);
  } catch (e) { if (!(e instanceof Stop)) failure = failure ?? e; }
  if (failure && !(failure instanceof Stop)) throw failure;
}

const memorySink = (limit, done) => { const parts = []; let n = 0; return { write(c) { n += c.length; if (n > limit) throw new Error('File troppo grande nel pacchetto.'); parts.push(Buffer.from(c)); }, end() { done(Buffer.concat(parts)); } }; };

// Il manifest (primo file del pacchetto). Lancia se il file non è un backup di Atena.
export async function readManifest(zipPath) {
  let manifest = null; let first = true;
  await streamZip(zipPath, {
    open(name) {
      if (first && name !== 'manifest.json') throw new Error('Non è un pacchetto di backup di Atena (manca il manifest all\'inizio).');
      first = false;
      if (name !== 'manifest.json') throw new Stop();
      return memorySink(1_000_000, (b) => { manifest = JSON.parse(b.toString('utf8')); throw new Stop(); });
    },
  }).catch((e) => { if (!(e instanceof Stop) && !manifest) throw e; });
  if (!manifest || manifest.app !== 'atena-cms' || manifest.format !== FORMAT) throw new Error('Il pacchetto non è un backup di Atena, o viene da una versione di formato diversa.');
  return manifest;
}

// ---- ripristino ---------------------------------------------------------------------------------------------------------------------------------

function replaceDirContents(stage, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const e of fs.readdirSync(target)) fs.rmSync(path.join(target, e), { recursive: true, force: true });
  if (fs.existsSync(stage)) for (const e of fs.readdirSync(stage)) fs.cpSync(path.join(stage, e), path.join(target, e), { recursive: true });
}

function setEnvKey(key, value) {
  const file = envFile();
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  const next = re.test(cur) ? cur.replace(re, `${key}=${value}`) : `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${key}=${value}\n`;
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
  fs.writeFileSync(file, next, { mode: 0o600 });
  process.env[key] = value;
}

// Dopo il ripristino senza la chiave dei segreti, le password email salvate non si leggono più: si tolgono, così l'admin vede di doverle reinserire.
async function dropUnreadableSecrets() {
  const { query, one } = await import('./db.mjs');
  const row = await one("SELECT value FROM settings WHERE name = 'mail'");
  if (!row) return false;
  let v; try { v = JSON.parse(row.value); } catch { return false; }
  let changed = false;
  for (const k of ['passwordEnc', 'apiKeyEnc']) if (v[k] && decryptSecret(v[k]) === null) { v[k] = null; changed = true; }
  if (changed) await query("UPDATE settings SET value = ? WHERE name = 'mail'", [JSON.stringify(v)]);
  return changed;
}

// Ripristina il pacchetto. install = dalla procedura di installazione (il database è vuoto: niente backup di sicurezza).
// Restituisce { ok, manifest, safety, secretsReset } oppure lancia con un messaggio per l'utente.
export async function restoreBackup(zipPath, { userId = null, install = false } = {}) {
  const run = await withLock('cms-backup', () => restoreInner(zipPath, { userId, install }), 0);
  if (!run.ok) throw new Error('Un altro backup o ripristino è in corso: riprova tra un momento.');
  return run.value;
}

async function restoreInner(zipPath, { userId, install }) {
  loadEnv();
  const manifest = await readManifest(zipPath);
  const known = new Set(migrationNames());
  const unknown = (manifest.migrations ?? []).filter((m) => !known.has(m));
  if (unknown.length) throw new Error(`Il backup viene da una versione più recente di Atena (migrazioni sconosciute: ${unknown.slice(0, 3).join(', ')}): aggiorna prima il CMS.`);

  // 1. Estrazione in una cartella provvisoria: se il pacchetto è rotto o ostile non si è toccato nulla.
  const stage = fs.mkdtempSync(path.join(dataDir(), 'restore-tmp-'));
  try {
    let secrets = null; let activeTpl = null; let sawDb = false; let first = true;
    const sinkFile = (rel) => { const dest = path.join(stage, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); const ws = fs.createWriteStream(dest, { mode: 0o600 }); return { write: (c) => { ws.write(c); }, end: () => ws.end(), ws }; };
    const open = [];
    await streamZip(zipPath, {
      open(name) {
        if (first) { first = false; return null; }   // il manifest è già stato letto
        if (name === 'secrets.json') return memorySink(100_000, (b) => { secrets = JSON.parse(b.toString('utf8')); });
        if (name === 'config/active-template.json') return memorySink(10_000, (b) => { activeTpl = JSON.parse(b.toString('utf8')); });
        if (name === 'manifest.json') return null;
        if (name === 'database.jsonl') sawDb = true;
        const s = sinkFile(name); open.push(s.ws); return s;
      },
      async flush() { for (const ws of open) if (ws.writableNeedDrain) await once(ws, 'drain'); },
    });
    for (const ws of open) if (!ws.writableFinished) await once(ws, 'finish').catch(() => {});
    const dbFile = path.join(stage, 'database.jsonl');
    if (!sawDb || !fs.existsSync(dbFile)) throw new Error('Nel pacchetto manca il database.');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(dbFile)).digest('hex');
    if (sha !== manifest.database?.sha256) throw new Error('Il database nel pacchetto è danneggiato (l\'impronta non corrisponde): il file è stato caricato per intero?');

    // 2. Backup di sicurezza dello stato attuale (se c'è qualcosa da perdere).
    let safety = null;
    if (!install) safety = (await createInner({ includeSite: true, includeSecrets: true, tag: 'pre', userId })).name;

    // 3. Database: si sostituisce tutto, poi le migrazioni portano lo schema all'ultima versione.
    try { await importDatabase(dbFile); }
    catch (e) { throw new Error(`Ripristino del database non riuscito: ${String(e.message).slice(0, 200)}.${safety ? ` Il backup di sicurezza è ${safety}.` : ''}`); }
    const c = dbConf();
    await migrate(c);

    // 4. File: media, sito pubblicato, template (solo se mancano sul server).
    if (fs.existsSync(path.join(stage, 'media'))) replaceDirContents(path.join(stage, 'media'), mediaDir());
    if (manifest.includes?.site && fs.existsSync(path.join(stage, 'site'))) replaceDirContents(path.join(stage, 'site'), siteDir());
    const tplStage = path.join(stage, 'templates');
    if (fs.existsSync(tplStage)) for (const id of fs.readdirSync(tplStage)) { const to = path.join(templatesDir(), id); if (!fs.existsSync(to)) fs.cpSync(path.join(tplStage, id), to, { recursive: true }); }
    if (activeTpl?.id && /^[a-z][a-z0-9-]{1,40}$/.test(activeTpl.id) && fs.existsSync(path.join(templatesDir(), activeTpl.id))) {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(path.join(dataDir(), 'active-template.json'), JSON.stringify({ id: activeTpl.id }));
    }

    // 5. Segreti: con la chiave del backup le password email salvate restano leggibili; senza, vanno reinserite.
    let secretsReset = false;
    if (secrets?.SETTINGS_SECRET && typeof secrets.SETTINGS_SECRET === 'string' && secrets.SETTINGS_SECRET.length >= 16 && secrets.SETTINGS_SECRET !== process.env.SETTINGS_SECRET) setEnvKey('SETTINGS_SECRET', secrets.SETTINGS_SECRET);
    secretsReset = await dropUnreadableSecrets();

    if (install) { const { markInstalled } = await import('./install.mjs'); markInstalled({ restoredFrom: path.basename(zipPath) }); }
    await audit(userId, 'backup.restore', `${path.basename(zipPath)}${safety ? ` (sicurezza: ${safety})` : ''}`);
    return { ok: true, manifest, safety, secretsReset };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

// Riceve un pacchetto caricato dal browser (corpo della richiesta in streaming) e lo mette in data/restore. Lancia se è troppo grande o non è un backup di Atena.
export async function receivePackage(webStream, name, declaredBytes = 0) {
  if (!UPLOAD_NAME.test(String(name))) throw new Error('Nome del file non valido: usa lettere, numeri, trattini e punti, con estensione .zip.');
  if (declaredBytes > maxBytes()) throw new Error(`Il file supera il limite consentito (${Math.round(maxBytes() / 1048576)} MB, BACKUP_MAX_MB).`);
  fs.mkdirSync(restoreDir(), { recursive: true, mode: 0o700 });
  const dest = path.join(restoreDir(), name);
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  let n = 0;
  try {
    for await (const chunk of Readable.fromWeb(webStream)) {
      n += chunk.length;
      if (n > maxBytes()) throw new Error(`Il file supera il limite consentito (${Math.round(maxBytes() / 1048576)} MB, BACKUP_MAX_MB).`);
      if (!out.write(chunk)) await once(out, 'drain');
    }
    out.end(); await once(out, 'finish');
    if (!n) throw new Error('Il file è vuoto.');
    const manifest = await readManifest(tmp);
    fs.renameSync(tmp, dest);
    return { name, size: n, manifest };
  } catch (e) { out.destroy(); fs.rmSync(tmp, { force: true }); throw e; }
}
