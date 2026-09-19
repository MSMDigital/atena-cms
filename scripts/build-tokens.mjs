// tokens.json del template → assets/css/tokens.css + assets/css/fonts.css (+ assets/fonts/*.woff2) + tokens.meta.json.
// Involucro da riga di comando: la logica sta in render/tokens.mjs (pura) e render/fonts.mjs (scarica i font).
// L'admin modifica i token, mai il CSS. Uso: node scripts/build-tokens.mjs [tokens.json] [cartella-css-output] [--template id|percorso]
import fs from 'node:fs';
import path from 'node:path';
import { applyTemplateFlag } from '../lib/cli-template.mjs';
import { requireTemplate } from '../lib/template.mjs';
import { validateTokens, tokensToCss, htmlAttrs } from '../render/tokens.mjs';
import { ensureFonts } from '../render/fonts.mjs';

const args = applyTemplateFlag();
const tpl = requireTemplate();
const src = path.resolve(args[0] ?? tpl.tokensFile);
const outDir = path.resolve(args[1] ?? path.join(tpl.assetsDir, 'css'));
const t = JSON.parse(fs.readFileSync(src, 'utf8'));

const errors = validateTokens(t);
if (errors.length) { console.error('tokens.json non valido:\n - ' + errors.join('\n - ')); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
const css = tokensToCss(t);
fs.writeFileSync(path.join(outDir, 'tokens.css'), css);

const fonts = await ensureFonts(t, { fontsDir: path.resolve(outDir, '../fonts'), cssPath: path.join(outDir, 'fonts.css') })
  .catch((e) => { console.error(e.message); process.exit(1); });
fs.writeFileSync(path.join(outDir, 'tokens.meta.json'), JSON.stringify({ fontsCss: 'css/fonts.css', preload: fonts.preload, htmlAttrs: htmlAttrs(t) }, null, 2) + '\n');

console.log(`tokens.css scritto in ${path.relative(process.cwd(), outDir) || '.'} (${css.split('\n').length} righe)\n${fonts.note}\nbottoni: ${t.buttons.effect}`);
