// Crea .env con password casuali (non sovrascrive un .env esistente). Uso: node scripts/init-env.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, '.env');
if (fs.existsSync(target)) { console.log('.env esiste già: non lo tocco.'); process.exit(0); }
const secret = () => crypto.randomBytes(24).toString('base64url');
const out = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')
  .replace(/^DB_PASSWORD=$/m, `DB_PASSWORD=${secret()}`)
  .replace(/^DB_ROOT_PASSWORD=$/m, `DB_ROOT_PASSWORD=${secret()}`)
  .replace(/^IP_HASH_SECRET=$/m, `IP_HASH_SECRET=${secret()}`)
  .replace(/^SETTINGS_SECRET=$/m, `SETTINGS_SECRET=${secret()}`);
fs.writeFileSync(target, out, { mode: 0o600 });
console.log('.env creato (permessi 600) con password casuali.');
