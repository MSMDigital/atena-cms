'use server';

import { checkInstallToken, checkRequirements, isInstalled, validateDb, testAndMigrateDb, writeEnv, validateAdmin, validateOrigin, markInstalled } from '@/lib/install.mjs';
import { loadEnv } from '@/lib/env.mjs';
import { readManifest, setActiveTemplate, templatesDir, loadTemplateFrom, TEMPLATE_ID } from '@/lib/template.mjs';
import path from 'node:path';
import { makeT, localize } from '@/lib/i18n.mjs';
import { EN } from '@/lib/i18n/en.mjs';

// Lingua dell'installazione: il database può non esserci ancora, quindi la sceglie il visitatore nel wizard e arriva come argomento.
const trOf = (lang) => makeT(lang, EN);

// Ogni azione dell'installazione: solo se il CMS NON è ancora installato e solo con la chiave di installazione.
async function assertInstallToken(token, t) {
  if (await isInstalled()) throw new Error(t('Il CMS è già installato.'));
  const c = checkInstallToken(token);
  if (!c.ok) return localize(c, t);
  return null;
}

export async function checkRequirementsAction(token, lang) {
  const t = trOf(lang);
  const bad = await assertInstallToken(token, t);
  if (bad) return bad;
  loadEnv();
  let dbReady = false;
  if (process.env.DB_PASSWORD) {
    try { const { one, closeDb } = await import('@/lib/db.mjs'); dbReady = !!(await one("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'")).n; void closeDb; } catch { dbReady = false; }
  }
  const { bundledTemplates } = await import('@/lib/install.mjs');
  const { uploadEnabled } = await import('@/lib/install.mjs');
  const { listRestoreFiles } = await import('@/lib/backup.mjs');
  return { ok: true, requirements: await checkRequirements(), dbReady, appOrigin: process.env.APP_ORIGIN ?? '', templates: bundledTemplates(), uploadEnabled: uploadEnabled(), restoreFiles: await listRestoreFiles().catch(() => []) };
}

export async function saveDatabaseAction(token, db, config, lang) {
  const t = trOf(lang);
  const bad = await assertInstallToken(token, t);
  if (bad) return bad;
  const { errors, value } = validateDb(db);
  const origin = validateOrigin(config?.appOrigin, 'Indirizzo dell\'admin');
  if (typeof origin !== 'string') errors.appOrigin = origin.error;
  if (Object.keys(errors).length) return localize({ ok: false, errors }, t);
  const r = await testAndMigrateDb(value);
  if (!r.ok) return localize({ ok: false, error: r.error }, t);
  writeEnv({ db: value, appOrigin: origin, trustProxy: !!config?.trustProxy });
  const { closeDb } = await import('@/lib/db.mjs');
  await closeDb();                      // il pool si riapre con la configurazione nuova
  return { ok: true, applied: r.applied.length };
}

// Ultimo passo: primo admin, template, contenuti di esempio, pubblicazione.
export async function finishInstallAction(token, { admin, templateId, siteUrl, settings }, lang) {
  const t = trOf(lang);
  const bad = await assertInstallToken(token, t);
  if (bad) return bad;
  const a = validateAdmin(admin);
  const errors = { ...a.errors };
  const url = validateOrigin(siteUrl, 'Indirizzo pubblico del sito');
  if (typeof url !== 'string') errors.siteUrl = url.error;
  if (typeof templateId !== 'string' || !TEMPLATE_ID.test(templateId)) errors.template = 'Scegli un template.';
  const { cleanGeneral } = await import('@/lib/general.mjs');
  const { LOCALES, DEFAULT_TAG } = await import('@/schema/common.mjs');
  const prefs = cleanGeneral({ timezone: 'Europe/Zurich', ...settings, adminEmail: settings?.adminEmail || a.value?.email });
  if (!prefs.ok) Object.assign(errors, prefs.errors);
  const siteLanguage = LOCALES.includes(settings?.siteLanguage) ? settings.siteLanguage : 'it';
  if (settings?.siteLanguage && !LOCALES.includes(settings.siteLanguage)) errors.siteLanguage = 'Lingua non valida.';
  let tpl = null;
  if (!errors.template) { try { readManifest(path.join(templatesDir(), templateId)); tpl = loadTemplateFrom(path.join(templatesDir(), templateId)); } catch (e) { errors.template = t('Template non utilizzabile: {msg}', { msg: e.message }); } }
  if (Object.keys(errors).length) return localize({ ok: false, errors }, t);

  const { query, one } = await import('@/lib/db.mjs');
  const { hashPassword } = await import('@/lib/password.mjs');
  const existing = await one('SELECT id, email FROM users LIMIT 1');
  if (existing && existing.email !== a.value.email) return { ok: false, error: t('Il database contiene già altri utenti: un\'installazione nuova richiede un database vuoto.') };
  const hash = await hashPassword(a.value.password);
  let userId;
  if (existing) { await query('UPDATE users SET name = ?, password_hash = ?, role = ?, active = 1 WHERE id = ?', [a.value.name, hash, 'admin', existing.id]); userId = existing.id; }   // ripresa di un tentativo interrotto
  else {
    const [first, ...rest] = a.value.name.split(' ');
    userId = Number((await query('INSERT INTO users (username, email, name, first_name, last_name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)', [a.value.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40).padEnd(3, '0'), a.value.email, a.value.name, first, rest.join(' ') || null, hash, 'admin'])).insertId);
  }

  setActiveTemplate(templateId);
  const { seedFromFiles, publishAll } = await import('@/lib/docs.mjs');
  const { audit } = await import('@/lib/audit.mjs');
  await seedFromFiles({ userId, force: true, template: tpl, siteUrl: url });
  // Impostazioni scelte durante l'installazione: generali e lingua del sito.
  const { saveGeneral } = await import('@/lib/general.mjs');
  await saveGeneral(prefs.value, userId);
  const { getDoc, saveDraft } = await import('@/lib/docs.mjs');
  const siteDoc = await getDoc('site', 'main');
  if (siteDoc && siteLanguage !== (siteDoc.draft.locales?.default ?? 'it')) {
    const old = siteDoc.draft.locales ?? {};
    const next = { ...siteDoc.draft, locales: { default: siteLanguage, enabled: [siteLanguage], tags: { ...(old.tags ?? {}), [siteLanguage]: old.tags?.[siteLanguage] ?? DEFAULT_TAG[siteLanguage] } } };
    await saveDraft('site', 'main', next, userId);
    const { query: q } = await import('@/lib/db.mjs');
    await q("UPDATE docs SET published = draft WHERE kind = 'site'");   // installazione: il sito nasce già con la lingua scelta
  }
  const pub = await publishAll(userId, { force: true });
  markInstalled({ template: `${tpl.id}@${tpl.manifest.version}`, admin: a.value.email });
  await audit(userId, 'install', `template ${tpl.id}@${tpl.manifest.version}`);
  return { ok: true, published: pub.ok, publishError: pub.ok ? null : `${t(pub.error)}: ${(pub.details ?? []).slice(0, 3).map((d) => t(d)).join('; ')}` };
}

// Ripristino da un pacchetto di backup al posto dell'installazione di un sito nuovo: serve la chiave di installazione e il database già configurato
// (passo «Database»). Sostituisce tutto con il contenuto del pacchetto, che era stato caricato in data/restore (da qui o via FTP).
export async function restoreInstallAction(token, name, lang) {
  const t = trOf(lang);
  const bad = await assertInstallToken(token, t);
  if (bad) return bad;
  const { restoreBackup, restoreFilePath } = await import('@/lib/backup.mjs');
  const fs = await import('node:fs');
  const file = restoreFilePath(String(name ?? ''));
  if (!file || !fs.existsSync(file)) return { ok: false, error: t('Il pacchetto non esiste: caricalo qui o copialo in data/restore/.') };
  loadEnv();
  if (!process.env.DB_PASSWORD) return { ok: false, error: t('Configura prima il database (passo «Database»).') };
  try {
    const r = await restoreBackup(file, { install: true });
    fs.rmSync(file, { force: true });   // sul server resta il database ripristinato: il pacchetto, con i dati personali, non serve più
    return { ok: true, created: r.manifest.createdAt, secretsReset: r.secretsReset };
  } catch (e) { return localize({ ok: false, error: String(e.message).slice(0, 400) }, t); }
}
