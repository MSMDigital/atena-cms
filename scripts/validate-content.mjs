// Valida content/ contro gli schemi e controlla la coerenza tra i file (logica in schema/validate.mjs).
// Errori: exit 1. Avvisi: link a pagine che non esistono ancora.
// Uso: node scripts/validate-content.mjs [cartella-content] [--template id|percorso]
import fs from 'node:fs';
import path from 'node:path';
import { applyTemplateFlag } from '../lib/cli-template.mjs';
import { requireTemplate } from '../lib/template.mjs';
import { validateData } from '../schema/validate.mjs';

const args = applyTemplateFlag();
const tpl = requireTemplate();
const dir = path.resolve(args[0] ?? tpl.contentDir);
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const opt = (f) => (fs.existsSync(path.join(dir, f)) ? read(f) : undefined);   // header e footer: solo nei template che li scorporano

const files = fs.readdirSync(path.join(dir, 'pages')).filter((f) => f.endsWith('.json')).sort();
const pages = files.map((f) => read(`pages/${f}`));
const posts = fs.existsSync(path.join(dir, 'posts')) ? fs.readdirSync(path.join(dir, 'posts')).filter((f) => f.endsWith('.json')).sort().map((f) => read(`posts/${f}`)) : [];
const { errors, warnings, stats } = validateData({ site: read('site.json'), shared: read('shared.json'), pages, headers: opt('headers.json'), footers: opt('footers.json'), posts, categories: opt('categories.json'), tags: opt('tags.json') }, tpl);
files.forEach((f, i) => { if (`${pages[i].key}.json` !== f) errors.push(`${f}: la chiave "${pages[i].key}" non corrisponde al nome del file`); });

console.log(`pagine: ${stats.pages} | articoli: ${stats.posts} | blocchi: ${stats.blocks} | condivisi: ${stats.shared}`);
console.log(Object.entries(stats.count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' | '));
if (warnings.length) console.log('\nAvvisi:\n - ' + warnings.join('\n - '));
if (errors.length) { console.error(`\n${errors.length} errori:\n - ` + errors.join('\n - ')); process.exit(1); }
console.log('\nContenuti validi.');
