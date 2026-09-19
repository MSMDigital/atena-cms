// Installazione guidata del CMS (pagina /install): requisiti, database, primo admin, template. Senza dipendenze da Next.
//
// Sicurezza: finché il CMS non è installato /install è raggiungibile da chiunque conosca l'indirizzo, quindi ogni operazione chiede la
// CHIAVE DI INSTALLAZIONE: INSTALL_TOKEN dall'ambiente, oppure un file (data/install-token, permessi 600) creato al primo avvio e scritto
// anche nel log del server. Chi la legge ha accesso al server: è la stessa persona che deve installare. Dopo l'installazione tutto si spegne
// (data/installed.json) e la chiave non serve più. I tentativi sbagliati sono limitati.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { ROOT, loadEnv, envFile } from './env.mjs';
import { dataDir, templatesDir, listTemplates, uploadEnabled } from './template.mjs';
import { MIN_PASSWORD } from './password.mjs';

const installedFile = () => path.join(dataDir(), 'installed.json');
const tokenFile = () => path.join(dataDir(), 'install-token');

// ---- stato -----------------------------------------------------------------------------------------------------------------

// Installato = c'è data/installed.json. Un sito già in funzione senza quel file (installazioni precedenti alla procedura guidata)
// si riconosce dal database con almeno un utente e dei contenuti, e il file si scrive da solo.
export async function isInstalled() {
  if (fs.existsSync(installedFile())) return true;
  loadEnv();
  if (!process.env.DB_PASSWORD) return false;
  try {
    const { one } = await import('./db.mjs');
    // Utenti E contenuti: un'installazione interrotta a metà (utente creato, contenuti no) non va scambiata per un sito finito.
    const r = await one('SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM docs) AS d');
    if (Number(r.u) > 0 && Number(r.d) > 0) { markInstalled({ adopted: true }); return true; }
  } catch { /* database non raggiungibile o senza tabelle: non installato */ }
  return false;
}

export function markInstalled(extra = {}) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(installedFile(), JSON.stringify({ at: new Date().toISOString(), ...extra }, null, 2), { mode: 0o600 });
  fs.rmSync(tokenFile(), { force: true });          // a installazione finita la chiave non serve più: non resta su disco
  try { const dir = path.dirname(envFile()); const baks = fs.readdirSync(dir).filter((n) => n.startsWith(`${path.basename(envFile())}.bak-`)).sort(); for (const old of baks.slice(0, -3)) fs.rmSync(path.join(dir, old), { force: true }); } catch { /* pulizia facoltativa */ }
}

// ---- chiave di installazione ---------------------------------------------------------------------------------------------------

export function installToken() {
  loadEnv();
  if (process.env.INSTALL_TOKEN && process.env.INSTALL_TOKEN.length >= 16) return process.env.INSTALL_TOKEN;
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(tokenFile())) {
    fs.writeFileSync(tokenFile(), crypto.randomBytes(24).toString('base64url'), { mode: 0o600 });
    console.log(`\n[installazione] Chiave di installazione (serve alla pagina /install): ${fs.readFileSync(tokenFile(), 'utf8')}\n[installazione] È salvata anche in ${tokenFile()}\n`);
  }
  return fs.readFileSync(tokenFile(), 'utf8').trim();
}

let failures = []; // istanti dei tentativi sbagliati
export function checkInstallToken(given) {
  const now = Date.now();
  failures = failures.filter((t) => now - t < 15 * 60_000);
  if (failures.length >= 10) return { ok: false, error: 'Troppi tentativi con la chiave sbagliata. Riprova tra 15 minuti.' };
  const a = Buffer.from(String(given ?? '')); const b = Buffer.from(installToken());
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  failures.push(now);
  return { ok: false, error: 'Chiave di installazione non corretta.' };
}

// ---- requisiti -----------------------------------------------------------------------------------------------------------------------

export async function checkRequirements() {
  const items = [];
  const add = (name, ok, detail = '') => items.push({ name, ok, detail });
  const [maj, min] = process.versions.node.split('.').map(Number);
  add('Node.js 22 o più recente (serve al modello di permessi che isola i template)', maj > 22 || (maj === 22 && min >= 12), `in uso: ${process.versions.node}`);
  try { await import('sharp'); add('Elaborazione delle immagini (sharp)', true); } catch (e) { add('Elaborazione delle immagini (sharp)', false, String(e.message).split('\n')[0]); }
  add('Modello di permessi di Node (per isolare i template)', (process.allowedNodeEnvironmentFlags?.has('--experimental-permission') ?? false) || (process.allowedNodeEnvironmentFlags?.has('--permission') ?? false), 'manca il flag --permission: aggiorna Node');
  for (const [label, dir] of [['cartella dei dati', dataDir()], ['cartella dei template', templatesDir()], ['cartella delle immagini caricate', path.resolve(process.env.MEDIA_DIR ?? path.join(ROOT, 'media'))], ['cartella del sito pubblicato', path.resolve(process.env.SITE_OUT_DIR ?? path.join(ROOT, 'dist'))]]) {
    let ok = false; let detail = dir;
    try { fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, `.scrittura-${process.pid}`); fs.writeFileSync(f, 'x'); fs.rmSync(f); ok = true; } catch (e) { detail = `${dir}: ${e.code ?? e.message}`; }
    add(`Scrittura nella ${label}`, ok, detail);
  }
  try { const probe = `${envFile()}.scrittura`; fs.writeFileSync(probe, 'x'); fs.rmSync(probe); add('Scrittura del file .env', true); } catch (e) { add('Scrittura del file .env', false, `${path.dirname(envFile())}: ${e.code ?? e.message}`); }
  return { ok: items.every((i) => i.ok), items };
}

// ---- database e configurazione ---------------------------------------------------------------------------------------------------------

const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
const DBNAME = /^[A-Za-z0-9_$-]{1,64}$/;

export function validateDb(db) {
  const errors = {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const host = s(db?.host); const name = s(db?.name); const user = s(db?.user);
  if (!/^[A-Za-z0-9_.@%+-]{1,80}$/.test(user)) errors.user = 'L\'utente può contenere solo lettere, numeri e . _ @ % + -';
  const port = Number(db?.port);
  if (!HOST.test(host)) errors.host = 'Indirizzo del server non valido (solo il nome, es. localhost).';
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Porta non valida.';
  if (!DBNAME.test(name)) errors.name = 'Nome del database non valido (lettere, numeri, _ e -).';
  if (!user) errors.user = 'Indica l\'utente del database.';
  const password = typeof db?.password === 'string' ? db.password : '';
  if (!password || password.length > 500) errors.password = 'Indica la password del database.';
  // Il file .env lo leggono anche altri programmi (Next espande $VAR e non capisce ogni apice): meglio una password senza questi caratteri.
  else if (/[$'"\\`#\r\n]/.test(password) || password !== password.trim()) errors.password = 'La password non può contenere $ \' " \\ ` # né spazi ai bordi (il file .env non li conserva in modo affidabile): creane una senza questi caratteri.';
  return { errors, value: { host, port, name, user, password } };
}

// Prova la connessione e applica le migrazioni. Restituisce { ok, applied } oppure { ok: false, error }.
export async function testAndMigrateDb(v) {
  const { migrate } = await import('./migrate.mjs');
  let conn;
  try {
    conn = await mysql.createConnection({ host: v.host, port: v.port, user: v.user, password: v.password, database: v.name, connectTimeout: 8000 });
    await conn.query('SELECT 1');
  } catch (e) {
    const code = e.code ?? '';
    const why = code === 'ER_ACCESS_DENIED_ERROR' ? 'utente o password non corretti'
      : code === 'ER_BAD_DB_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR' ? `il database "${v.name}" non esiste o l'utente non ha i permessi per usarlo (il database va creato dal pannello del fornitore)`
      : code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' ? `il server non risponde (${code})` : String(e.message).slice(0, 160);
    return { ok: false, error: `Connessione al database non riuscita: ${why}.` };
  } finally { await conn?.end().catch(() => {}); }
  try { return { ok: true, applied: await migrate({ host: v.host, port: v.port, database: v.name, user: v.user, password: v.password }) }; }
  catch (e) { return { ok: false, error: `Creazione delle tabelle non riuscita: ${String(e.message).slice(0, 200)}. Il database deve essere vuoto e l'utente deve poter creare tabelle.` }; }
}

const q = (v) => (/^[A-Za-z0-9_@%+=:,./-]*$/.test(v) ? v : `'${v}'`);   // valori con caratteri strani tra apici singoli (letterali)

// Scrive .env (permessi 600) con la configurazione e le chiavi generate. Un .env esistente si conserva in una copia. Aggiorna anche process.env.
export function writeEnv({ db, appOrigin, trustProxy }) {
  const file = envFile();
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
  const old = {};
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) old[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  const secret = () => crypto.randomBytes(24).toString('base64url');
  const vars = {
    DB_HOST: db.host, DB_PORT: String(db.port), DB_NAME: db.name, DB_USER: db.user, DB_PASSWORD: db.password,
    APP_ORIGIN: appOrigin, TRUST_PROXY: trustProxy ? '1' : '0',
    SETTINGS_SECRET: old.SETTINGS_SECRET && old.SETTINGS_SECRET.length >= 16 ? old.SETTINGS_SECRET : secret(),   // se c'è già non si cambia: le password cifrate non si leggerebbero più
    IP_HASH_SECRET: old.IP_HASH_SECRET || secret(),
  };
  const keep = Object.entries(old).filter(([k]) => !(k in vars)).map(([k, v]) => `${k}=${q(v)}`);
  for (const [k, v] of Object.entries(vars)) if (/[\r\n\u0000]/.test(String(v))) throw new Error(`Valore non ammesso per ${k}`);   // un valore non può aggiungere righe al file
  const text = ['# Generato dall\'installazione guidata. Non va mai in git: contiene password e chiavi.', ...Object.entries(vars).map(([k, v]) => `${k}=${q(v)}`), ...keep, ''].join('\n');
  fs.writeFileSync(`${file}.tmp`, text, { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
  Object.assign(process.env, vars);
  return Object.keys(vars);
}

// ---- controlli sugli altri campi ---------------------------------------------------------------------------------------------------------------

export function validateAdmin(a) {
  const errors = {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  if (!/^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]{2,}$/.test(s(a?.email)) || s(a?.email).length > 190) errors.email = 'Indirizzo email non valido.';
  if (!s(a?.name) || s(a.name).length > 120) errors.name = 'Indica il nome.';
  const pw = typeof a?.password === 'string' ? a.password : '';
  if (pw.length < MIN_PASSWORD) errors.password = `La password deve avere almeno ${MIN_PASSWORD} caratteri.`;
  else if (pw.length > 200) errors.password = 'Password troppo lunga.';
  else if (pw.toLowerCase() === s(a?.email).toLowerCase()) errors.password = 'La password non può essere uguale all\'email.';
  if (pw !== a?.again) errors.again = 'Le due password non coincidono.';
  return { errors, value: { email: s(a?.email).toLowerCase(), name: s(a?.name), password: pw } };
}

export function validateOrigin(v, label) {
  try { const u = new URL(String(v)); if (!/^https?:$/.test(u.protocol) || u.pathname !== '/' || u.search || u.hash || u.username) throw new Error(); return u.origin; }
  catch { return { error: `${label}: scrivi solo l'indirizzo, per esempio https://www.esempio.ch (senza percorso).` }; }
}

export { uploadEnabled };
export const bundledTemplates = () => listTemplates().filter((t) => !t.broken).map(({ dir, ...t }) => t);
