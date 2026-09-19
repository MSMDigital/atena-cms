// Pulizia periodica dei dati che crescono da soli (da lanciare, per esempio, ogni notte con cron):
//  - richieste dei moduli più vecchie di N mesi (dati personali: la durata va decisa con il titolare, vedi informativa privacy);
//  - sessioni scadute e tentativi di accesso vecchi;
//  - versioni intermedie dei documenti (si tengono le ultime 100 per documento).
// Uso: node scripts/purge-data.mjs [--submissions-months N] [--dry-run]
//      (N può venire anche da FORM_RETENTION_MONTHS; senza, le richieste non si toccano)
import { loadEnv } from '../lib/env.mjs';
import { closeDb, query, one } from '../lib/db.mjs';
import { purgeAuthTables } from '../lib/sessions.mjs';

loadEnv();
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const dry = process.argv.includes('--dry-run');
const months = Number(arg('submissions-months') ?? process.env.FORM_RETENTION_MONTHS ?? 0);
const KEEP_REVISIONS = 100;

const out = [];
if (months > 0) {
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
  const n = (await one('SELECT COUNT(*) AS n FROM form_submissions WHERE created_at < ?', [cutoff])).n;
  if (!dry) await query('DELETE FROM form_submissions WHERE created_at < ?', [cutoff]);
  out.push(`richieste dei moduli più vecchie di ${months} mesi: ${n}${dry ? ' (da eliminare)' : ' eliminate'}`);
} else out.push('richieste dei moduli: non toccate (indica --submissions-months o FORM_RETENTION_MONTHS)');

if (!dry) await purgeAuthTables(true);
out.push(`sessioni scadute e tentativi di accesso vecchi: ${dry ? 'da ripulire' : 'ripuliti'}`);

let revs = 0;
for (const { id } of await query('SELECT id FROM docs')) {
  const edge = (await query('SELECT id FROM doc_revisions WHERE doc_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?', [id, KEEP_REVISIONS - 1]))[0];
  if (!edge) continue;
  revs += (await one('SELECT COUNT(*) AS n FROM doc_revisions WHERE doc_id = ? AND id < ?', [id, edge.id])).n;
  if (!dry) await query('DELETE FROM doc_revisions WHERE doc_id = ? AND id < ?', [id, edge.id]);
}
out.push(`versioni intermedie oltre le ultime ${KEEP_REVISIONS} per documento: ${revs}${dry ? ' (da eliminare)' : ' eliminate'}`);

console.log(out.join('\n'));
await closeDb();
