// Elenca le frasi italiane che l'editor mostra e che vengono dagli SCHEMI (titoli, descrizioni, scelte), dai file ui.json dei template e dai messaggi di
// validazione: servono a scrivere il dizionario inglese. Uso: node scripts/i18n-extract.mjs [engine|templates|ui|all]   (scrive un JSON con le frasi su stdout)
import fs from 'node:fs';
import path from 'node:path';
import { loadTemplateFrom } from '../lib/template.mjs';
import { schemasFor } from '../schema/index.mjs';

const what = process.argv[2] ?? 'all';
const ROOT = process.cwd();
const out = { engine: new Set(), templates: {}, ui: {} };
const SKIP_KEYS = new Set(['$id', '$ref', 'pattern', 'format', 'type', 'x-widget', 'x-when', 'x-item', 'default', 'const', 'enum', 'required', 'discriminator']);
const collect = (node, into) => {
  if (Array.isArray(node)) { node.forEach((n) => collect(n, into)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if ((k === 'title' || k === 'description') && typeof v === 'string' && /[A-Za-zÀ-ÿ]{3,}/.test(v)) into.add(v);
    else if (!SKIP_KEYS.has(k) || (v && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')))) collect(v, into);   // «type» come nome di CAMPO (valore oggetto) si visita
  }
};
const tdir = path.join(ROOT, 'templates');
for (const id of fs.readdirSync(tdir)) {
  const dir = path.join(tdir, id);
  if (!fs.existsSync(path.join(dir, 'template.json'))) continue;
  const tpl = loadTemplateFrom(dir);
  const all = new Set(); collect(schemasFor(tpl).allSchemas, all);
  const own = new Set(); collect(tpl.schema, own);   // schemi portati dal template
  out.templates[id] = [...own].filter((s) => !out.engine.has(s));
  for (const s of all) if (!own.has(s)) out.engine.add(s);
  const ui = tpl.ui ?? {};
  out.ui[id] = [...new Set([...Object.values(ui.enumLabels ?? {}), ...Object.values(ui.keyLabels ?? {}), ...Object.values(ui.blockHints ?? {}), ...Object.values(ui.siteSections ?? {})].filter((s) => typeof s === 'string' && /[A-Za-zÀ-ÿ]{3,}/.test(s)))];
}
const res = { engine: [...out.engine].sort(), templates: out.templates, ui: out.ui };
console.log(JSON.stringify(what === 'all' ? res : what === 'engine' ? res.engine : what === 'templates' ? res.templates : res.ui, null, 1));
