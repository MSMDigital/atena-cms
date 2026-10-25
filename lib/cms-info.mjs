// Informazioni sul CMS per la Panoramica: versione, ambiente, template, database. Solo letture, niente segreti.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import { one } from './db.mjs';
import { activeTemplate } from './template.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export async function cmsInfo() {
  const pkg = readJson(path.join(ROOT, 'package.json')) ?? {};
  const next = readJson(path.join(ROOT, 'node_modules/next/package.json'))?.version ?? null;
  const tpl = activeTemplate();
  let db = null;
  try { db = (await one('SELECT VERSION() AS v'))?.v ?? null; } catch { /* database non raggiungibile: la Panoramica non deve rompersi */ }
  const flavor = db && /mariadb/i.test(db) ? 'MariaDB' : 'MySQL';
  return {
    name: 'Atena CMS',
    version: pkg.version ?? null,
    node: process.versions.node,
    next,
    db: db ? `${flavor} ${db.split('-')[0]}` : null,
    env: process.env.NODE_ENV === 'production' ? 'produzione' : 'sviluppo',
    template: tpl ? { name: tpl.manifest.name, version: tpl.manifest.version } : null,
  };
}
