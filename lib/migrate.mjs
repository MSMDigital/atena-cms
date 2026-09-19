// Applica le migrazioni in migrations/*.sql non ancora eseguite (tabella schema_migrations). Restituisce i nomi applicati.
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { ROOT } from './env.mjs';

export async function migrate(conf) {
  const conn = await mysql.createConnection({ ...conf, multipleStatements: true });
  try {
    await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    const done = new Set((await conn.query('SELECT name FROM schema_migrations'))[0].map((r) => r.name));
    const applied = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await conn.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
      applied.push(f);
    }
    return applied;
  } finally { await conn.end(); }
}
