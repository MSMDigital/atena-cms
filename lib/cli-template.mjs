// Per gli script da riga di comando: --template <id|percorso> sceglie il template (altrimenti quello attivo). Restituisce gli argomenti rimasti.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './env.mjs';
import { templatesDir } from './template.mjs';

export function applyTemplateFlag(argv = process.argv.slice(2)) {
  loadEnv();
  const i = argv.indexOf('--template');
  if (i < 0) return argv;
  const v = argv[i + 1];
  if (!v) { console.error('--template vuole un id o un percorso'); process.exit(1); }
  const asDir = path.resolve(v);
  if (fs.existsSync(path.join(asDir, 'template.json'))) process.env.CMS_TEMPLATE_DIR = asDir;
  else if (fs.existsSync(path.join(templatesDir(), v, 'template.json'))) process.env.CMS_TEMPLATE_DIR = path.join(templatesDir(), v);
  else { console.error(`Template "${v}" non trovato`); process.exit(1); }
  return [...argv.slice(0, i), ...argv.slice(i + 2)];
}
