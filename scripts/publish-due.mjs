// Pubblica gli articoli pianificati arrivati all'ora di uscita. Uso (da cron, una volta all'ora basta: 0 * * * *): node scripts/publish-due.mjs
// Non serve se l'admin è acceso: lo fa già da solo (instrumentation.js).
import { loadEnv } from '../lib/env.mjs';
import { closeDb } from '../lib/db.mjs';
import { publishDue } from '../lib/docs.mjs';

loadEnv();
const r = await publishDue();
console.log(r.nothing ? 'niente da pubblicare' : r.ok ? `sito rifatto (${r.pages} pagine)` : `non riuscito: ${r.error}`);
await closeDb();
process.exit(r.ok ? 0 : 1);
