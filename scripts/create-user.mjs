// Crea un utente dell'admin, o ne reimposta la password. La password viene generata e mostrata una sola volta.
// Uso: node scripts/create-user.mjs --email a@b.ch --name "Nome" [--role admin|editor] [--reset]
import { loadEnv } from '../lib/env.mjs';
import { closeDb, query, one } from '../lib/db.mjs';
import { hashPassword, generatePassword } from '../lib/password.mjs';
import { normalizeEmail, destroyUserSessions } from '../lib/sessions.mjs';

loadEnv();
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const email = normalizeEmail(arg('email'));
const name = arg('name');
const requestedRole = arg('role');
const reset = process.argv.includes('--reset');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || (requestedRole && !['admin', 'editor'].includes(requestedRole))) {
  console.error('uso: node scripts/create-user.mjs --email a@b.ch --name "Nome" [--role admin|editor] [--reset]'); process.exit(1);
}
const existing = await one('SELECT id, role FROM users WHERE email = ?', [email]);
// Reimpostare la password non cambia il ruolo (un editor non deve diventare admin per una dimenticanza): serve --role esplicito.
const role = requestedRole ?? existing?.role ?? 'admin';
if (existing && !reset) { console.error(`${email} esiste già (usa --reset per reimpostare la password).`); process.exit(1); }
const password = generatePassword();
const hash = await hashPassword(password);
if (existing) { await query('UPDATE users SET password_hash = ?, name = ?, role = ?, active = 1 WHERE id = ?', [hash, name, role, existing.id]); await destroyUserSessions(existing.id); }
else await query('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', [email, name, hash, role]);
console.log(`${existing ? 'Password reimpostata' : 'Utente creato'}: ${email} (${role})\nPassword (mostrata una sola volta, cambiala appena possibile): ${password}`);
await closeDb();
