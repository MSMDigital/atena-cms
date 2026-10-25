// Indirizzo di accesso personalizzato, da riga di comando (serve se lo si perde o per impostarlo prima del primo accesso).
// Uso: node scripts/admin-path.mjs --show | --set <indirizzo> | --random | --reset
import { adminSlug, checkSlug, saveSlug, clearSlug, randomSlug } from '../lib/admin-path.mjs';

const a = process.argv.slice(2);
const slug = adminSlug();
if (a.includes('--reset')) { clearSlug(); console.log('Indirizzo personalizzato rimosso: l\'accesso è /admin/login.'); }
else if (a.includes('--set') || a.includes('--random')) {
  const want = a.includes('--random') ? randomSlug() : a[a.indexOf('--set') + 1];
  const err = checkSlug(want);
  if (err) { console.error(err); process.exit(1); }
  saveSlug(want);
  console.log(`Indirizzo di accesso: /${want}/login`);
} else console.log(slug ? `Indirizzo di accesso: /${slug}/login` : 'Nessun indirizzo personalizzato: l\'accesso è /admin/login.');
