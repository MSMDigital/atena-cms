// Applica le migrazioni non ancora eseguite. Uso: node scripts/db-migrate.mjs
import { loadEnv } from '../lib/env.mjs';
import { migrate } from '../lib/migrate.mjs';

loadEnv();
const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
const applied = await migrate({ host: DB_HOST ?? '127.0.0.1', port: +(DB_PORT ?? 3306), database: DB_NAME, user: DB_USER, password: DB_PASSWORD });
applied.forEach((f) => console.log('applicata', f));
console.log(applied.length ? `${applied.length} migrazioni applicate.` : 'Database già aggiornato.');
