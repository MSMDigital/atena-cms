// Importa tokens.json e content/ nel database. Uso: node scripts/db-seed.mjs [--force]
// Senza --force non tocca i documenti già presenti.
import { loadEnv, assertLocalDatabase } from '../lib/env.mjs';
import { closeDb } from '../lib/db.mjs';
import { seedFromFiles } from '../lib/docs.mjs';

loadEnv();
const force = process.argv.includes('--force');
if (force) assertLocalDatabase('db:seed --force');   // sovrascrive i contenuti con i file: solo su un database locale
const r = await seedFromFiles({ force });
console.log(`documenti: ${r.inserted} nuovi, ${r.updated} aggiornati, ${r.skipped} già presenti${force ? '' : ' (usa --force per sovrascrivere)'}`);
await closeDb();
