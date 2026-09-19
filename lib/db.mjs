// Connessione a MySQL/MariaDB (pool). Le credenziali vengono solo dall'ambiente (.env), mai dal codice.
import mysql from 'mysql2/promise';
import { loadEnv } from './env.mjs';

let pool;

export function db() {
  if (pool) return pool;
  loadEnv();
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_PASSWORD) throw new Error('Database non configurato: manca DB_PASSWORD (esegui npm run env:init)');
  pool = mysql.createPool({
    host: DB_HOST ?? '127.0.0.1', port: +(DB_PORT ?? 3306), database: DB_NAME, user: DB_USER, password: DB_PASSWORD,
    waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4', timezone: 'Z', dateStrings: false,
  });
  return pool;
}

export const query = async (sql, params) => (await db().query(sql, params))[0];
export const one = async (sql, params) => (await query(sql, params))[0] ?? null;

// Transazione: rollback automatico se la funzione lancia.
export async function tx(fn) {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn({ query: async (sql, params) => (await conn.query(sql, params))[0] });
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Lock con nome (GET_LOCK): serializza sezioni critiche anche tra processi diversi (es. "conta e inserisci" senza superare un tetto).
// Restituisce { ok: false } se non lo ottiene entro il tempo indicato.
export async function withLock(name, fn, seconds = 5) {
  const conn = await db().getConnection();
  try {
    const [[r]] = await conn.query('SELECT GET_LOCK(?, ?) AS ok', [String(name).slice(0, 64), seconds]);
    if (!r.ok) return { ok: false };
    try { return { ok: true, value: await fn() }; } finally { await conn.query('SELECT RELEASE_LOCK(?)', [String(name).slice(0, 64)]).catch(() => {}); }
  } finally { conn.release(); }
}

export async function closeDb() { if (pool) { await pool.end(); pool = undefined; } }

// I JSON stanno in LONGTEXT: stesso comportamento su MySQL e MariaDB.
export const parseJson = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
export const toJson = (v) => JSON.stringify(v);
