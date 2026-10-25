// Database di prova isolato: si crea e si distrugge a ogni esecuzione, senza toccare quello di sviluppo.
// Serve DB_ROOT_PASSWORD (è nel .env di sviluppo). Senza, i test che usano il database vengono saltati.
import mysql from 'mysql2/promise';
import { loadEnv } from '../lib/env.mjs';
import { migrate } from '../lib/migrate.mjs';

loadEnv();
const { DB_HOST = '127.0.0.1', DB_PORT = '3307', DB_USER, DB_PASSWORD, DB_ROOT_PASSWORD } = process.env;
export const TEST_DB = 'atena_cms_test';
export const hasDb = !!(DB_ROOT_PASSWORD && DB_PASSWORD);

export async function setupTestDb() {
  const root = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: 'root', password: DB_ROOT_PASSWORD });
  await root.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await root.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`GRANT ALL ON \`${TEST_DB}\`.* TO ?@'%'`, [DB_USER]);
  await root.end();
  process.env.DB_NAME = TEST_DB;
  await migrate({ host: DB_HOST, port: +DB_PORT, database: TEST_DB, user: DB_USER, password: DB_PASSWORD });
}

export async function dropTestDb() {
  const root = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: 'root', password: DB_ROOT_PASSWORD });
  await root.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await root.end();
}
