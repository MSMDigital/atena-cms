// Pubblicazione da file: contenuti e token del template → dist/ (HTML statico, asset, sitemap, robots). La logica sta in render/build.mjs.
// Uso: node scripts/build-site.mjs [cartella-output (default: dist)] [--template id|percorso]
import path from 'node:path';
import { applyTemplateFlag } from '../lib/cli-template.mjs';
import { requireTemplate } from '../lib/template.mjs';
import { ROOT } from '../lib/env.mjs';
import { loadData } from '../render/context.mjs';
import { buildSite, BuildError } from '../render/build.mjs';

const args = applyTemplateFlag();
const out = path.resolve(args[0] ?? path.join(ROOT, 'dist'));
const tpl = requireTemplate();

try {
  const r = await buildSite(loadData(tpl.dir), { outDir: out, template: tpl });
  console.log(`${r.pages} pagine (template ${tpl.id}) → ${path.relative(process.cwd(), out) || '.'} | ${r.fontNote}`);
} catch (e) {
  if (!(e instanceof BuildError)) throw e;
  console.error(`${e.message}: build interrotta.\n - ${e.details.join('\n - ')}`);
  process.exit(1);
}
