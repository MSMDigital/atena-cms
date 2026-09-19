'use server';

import { checkInstallToken, checkRequirements, isInstalled, validateDb, testAndMigrateDb, writeEnv, validateAdmin, validateOrigin, markInstalled } from '@/lib/install.mjs';
import { loadEnv } from '@/lib/env.mjs';
import { readManifest, setActiveTemplate, templatesDir, loadTemplateFrom, TEMPLATE_ID } from '@/lib/template.mjs';
import path from 'node:path';

// Ogni azione dell'installazione: solo se il CMS NON è ancora installato e solo con la chiave di installazione.
async function assertInstallToken(token) {
  if (await isInstalled()) throw new Error('Il CMS è già installato.');
  const t = checkInstallToken(token);
  if (!t.ok) return t;
  return null;
}

export async function checkRequirementsAction(token) {
  const bad = await assertInstallToken(token);
  if (bad) return bad;
  loadEnv();
  let dbReady = false;
  if (process.env.DB_PASSWORD) {
    try { const { one, closeDb } = await import('@/lib/db.mjs'); dbReady = !!(await one("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'")).n; void closeDb; } catch { dbReady = false; }
  }
  const { bundledTemplates } = await import('@/lib/install.mjs');
  const { uploadEnabled } = await import('@/lib/install.mjs');
  return { ok: true, requirements: await checkRequirements(), dbReady, appOrigin: process.env.APP_ORIGIN ?? '', templates: bundledTemplates(), uploadEnabled: uploadEnabled() };
}

export async function saveDatabaseAction(token, db, config) {
  const bad = await assertInstallToken(token);
  if (bad) return bad;
  const { errors, value } = validateDb(db);
  const origin = validateOrigin(config?.appOrigin, 'Indirizzo dell\'admin');
  if (typeof origin !== 'string') errors.appOrigin = origin.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  const r = await testAndMigrateDb(value);
  if (!r.ok) return { ok: false, error: r.error };
  writeEnv({ db: value, appOrigin: origin, trustProxy: !!config?.trustProxy });
  const { closeDb } = await import('@/lib/db.mjs');
  await closeDb();                      // il pool si riapre con la configurazione nuova
  return { ok: true, applied: r.applied.length };
}

// Ultimo passo: primo admin, template, contenuti di esempio, pubblicazione.
export async function finishInstallAction(token, { admin, templateId, siteUrl }) {
  const bad = await assertInstallToken(token);
  if (bad) return bad;
  const a = validateAdmin(admin);
  const errors = { ...a.errors };
  const url = validateOrigin(siteUrl, 'Indirizzo pubblico del sito');
  if (typeof url !== 'string') errors.siteUrl = url.error;
  if (typeof templateId !== 'string' || !TEMPLATE_ID.test(templateId)) errors.template = 'Scegli un template.';
  let tpl = null;
  if (!errors.template) { try { readManifest(path.join(templatesDir(), templateId)); tpl = loadTemplateFrom(path.join(templatesDir(), templateId)); } catch (e) { errors.template = `Template non utilizzabile: ${e.message}`; } }
  if (Object.keys(errors).length) return { ok: false, errors };

  const { query, one } = await import('@/lib/db.mjs');
  const { hashPassword } = await import('@/lib/password.mjs');
  const existing = await one('SELECT id, email FROM users LIMIT 1');
  if (existing && existing.email !== a.value.email) return { ok: false, error: 'Il database contiene già altri utenti: un\'installazione nuova richiede un database vuoto.' };
  const hash = await hashPassword(a.value.password);
  let userId;
  if (existing) { await query('UPDATE users SET name = ?, password_hash = ?, role = ?, active = 1 WHERE id = ?', [a.value.name, hash, 'admin', existing.id]); userId = existing.id; }   // ripresa di un tentativo interrotto
  else userId = Number((await query('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', [a.value.email, a.value.name, hash, 'admin'])).insertId);

  setActiveTemplate(templateId);
  const { seedFromFiles, publishAll } = await import('@/lib/docs.mjs');
  const { audit } = await import('@/lib/audit.mjs');
  await seedFromFiles({ userId, force: true, template: tpl, siteUrl: url });
  const pub = await publishAll(userId, { force: true });
  markInstalled({ template: `${tpl.id}@${tpl.manifest.version}`, admin: a.value.email });
  await audit(userId, 'install', `template ${tpl.id}@${tpl.manifest.version}`);
  return { ok: true, published: pub.ok, publishError: pub.ok ? null : `${pub.error}: ${(pub.details ?? []).slice(0, 3).join('; ')}` };
}
