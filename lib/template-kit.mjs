// Rende importabile '@cms/kit' dai template: un piccolo pacchetto in templates/node_modules/@cms/kit che rimanda a render/kit.mjs del motore.
// (Node risolve i nomi "nudi" cercando node_modules risalendo dalle cartelle: dal template si arriva a templates/node_modules.)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './env.mjs';
import { templatesDir } from './template.mjs';

export const KIT_FILE = path.join(ROOT, 'render/kit.mjs');

// `templateDir`: cartella di un template. Se sta in templates/ (anche in .staging/) il kit va in templates/node_modules, come sempre;
// se sta altrove (es. template-library/) il kit va nella cartella che lo contiene.
export function ensureKit(templateDir) {
  const parent = templateDir ? path.dirname(path.resolve(templateDir)) : templatesDir();
  const root = templatesDir();
  const base = parent === root || parent.startsWith(root + path.sep) ? root : parent;
  const dir = path.join(base, 'node_modules/@cms/kit');
  const index = `export * from ${JSON.stringify(pathToFileURL(KIT_FILE).href)};\n`;
  const pkg = JSON.stringify({ name: '@cms/kit', version: '1.0.0', type: 'module', exports: './index.mjs', private: true }, null, 2) + '\n';
  fs.mkdirSync(dir, { recursive: true });
  const write = (f, content) => { const p = path.join(dir, f); if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) fs.writeFileSync(p, content); };
  write('index.mjs', index);
  write('package.json', pkg);
  return dir;
}
