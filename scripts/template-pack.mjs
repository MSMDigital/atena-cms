// Crea il pacchetto zip di un template, pronto da caricare in Admin → Template.
// Uso: node scripts/template-pack.mjs <cartella-del-template> [file-zip-di-uscita]
import fs from 'node:fs';
import path from 'node:path';
import { packTemplate, validateTemplateDir } from '../lib/template-install.mjs';
import { stopRenderers } from '../render/host.mjs';
import { ensureKit } from '../lib/template-kit.mjs';

const dir = process.argv[2];
if (!dir) { console.error('uso: node scripts/template-pack.mjs <cartella-del-template> [file.zip]'); process.exit(1); }
ensureKit(path.resolve(dir));   // il template può stare fuori da templates/ (es. template-library/): serve il suo @cms/kit
const check = await validateTemplateDir(path.resolve(dir));
stopRenderers();
if (check.errors.length) { console.error(`Il template non è valido:\n - ${check.errors.join('\n - ')}`); process.exit(1); }
const { zip, files, skipped } = packTemplate(dir);
const out = path.resolve(process.argv[3] ?? path.join(process.cwd(), `${check.manifest.id}-${check.manifest.version}.zip`));
fs.writeFileSync(out, zip);
console.log(`${path.relative(process.cwd(), out)}: ${files} file, ${(zip.length / 1048576).toFixed(1)} MB (esclusi ${skipped.length}: strumenti di sviluppo e file nascosti)`);
if (check.warnings.length) console.log(`Avvisi (${check.warnings.length}):\n - ${check.warnings.slice(0, 10).join('\n - ')}`);
console.log(`Prova di esecuzione: ${check.smoke.pages} pagine rese in ${check.smoke.ms} ms nel processo isolato.`);
