// Impostazioni generali (fuso, formati, email dell'amministrazione), destinatari delle richieste, invio con Brevo (API) e avvisi all'amministrazione.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { formatDate, formatTime, formatStamp } from '../render/format.mjs';
import { cleanGeneral } from '../lib/general.mjs';
import { zurichNow } from '../schema/blog.mjs';

test('formati di data e ora: predefinito, scelte e fuso orario', () => {
  const d = new Date('2026-11-03T08:05:00Z');
  assert.equal(formatStamp(d, {}), '03.11.2026 09:05', 'senza impostazioni: come prima (fuso svizzero)');
  assert.equal(formatStamp(d, { timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY', timeFormat: '12h' }), '11/03/2026 3:05 AM');
  assert.equal(formatDate('2026-11-03', {}), '3 novembre 2026', 'senza scelta: la scrittura lunga di prima');
  assert.equal(formatDate('2026-11-03', { dateFormat: 'D MMMM YYYY' }, 'en'), '3 November 2026');
  assert.equal(formatDate('2026-11-03', { dateFormat: 'YYYY-MM-DD', timezone: 'Pacific/Auckland' }), '2026-11-03', 'un giorno di calendario non si sposta con il fuso');
  assert.equal(formatTime('2026-11-03', {}), '', 'una data senza ora non ha ora');
  assert.equal(formatTime(new Date('2026-11-03T23:30:00Z'), { timeFormat: '12h', timezone: 'UTC' }), '11:30 PM');
  assert.equal(formatDate('non è una data', {}), '');
  assert.equal(zurichNow(new Date('2026-07-01T10:00:00Z'), 'Asia/Tokyo'), '2026-07-01T19:00', 'la pianificazione usa il fuso del sito');
});

test('impostazioni generali: validazione', () => {
  const ok = cleanGeneral({ adminEmail: 'info@esempio.ch', timezone: 'Europe/Rome', dateFormat: '', timeFormat: '24h', weekStart: 1, cmsLanguage: 'en' });
  assert.deepEqual([ok.ok, ok.value.dateFormat, ok.value.cmsLanguage], [true, null, 'en']);
  const bad = cleanGeneral({ adminEmail: 'no', timezone: 'Marte/Olympus', dateFormat: 'YY-M', timeFormat: '99', weekStart: 3, cmsLanguage: 'fr' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['adminEmail', 'cmsLanguage', 'dateFormat', 'timeFormat', 'timezone', 'weekStart']);
  assert.equal(cleanGeneral({ timezone: 'UTC', adminEmail: '' }).ok, true, 'l\'email dell\'amministrazione è facoltativa');
});

test('destinatari, Brevo e avvisi', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, closeDb } = await import('../lib/db.mjs');
  const G = await import('../lib/general.mjs');
  const S = await import('../lib/settings.mjs');
  const M = await import('../lib/mail.mjs');
  const keep = { secret: process.env.SETTINGS_SECRET, url: process.env.BREVO_API_URL, host: process.env.SMTP_HOST, from: process.env.MAIL_FROM };
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({ url: req.url, key: req.headers['api-key'], body: JSON.parse(body || '{}') });
      if (req.headers['api-key'] === 'chiave-rifiutata-0000000000') { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'Key not found' })); return; }
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ messageId: '<x@brevo>' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.BREVO_API_URL = `http://127.0.0.1:${server.address().port}/v3/smtp/email`;
  process.env.SETTINGS_SECRET = 'chiave-di-prova-abbastanza-lunga-1234'; delete process.env.SMTP_HOST; delete process.env.MAIL_FROM;
  t.after(async () => { server.close(); await closeDb(); await dropTestDb(); for (const [k, v] of [['SETTINGS_SECRET', keep.secret], ['BREVO_API_URL', keep.url], ['SMTP_HOST', keep.host], ['MAIL_FROM', keep.from]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const adminId = Number((await query("INSERT INTO users (email, name, password_hash, role) VALUES ('anna@example.ch', 'Anna Rossi', 'x', 'admin')")).insertId);

  await t.test('impostazioni generali: predefiniti, salvataggio, parte pubblica senza email', async () => {
    assert.deepEqual(await G.getGeneral(), G.DEFAULTS);
    const r = await G.saveGeneral({ adminEmail: 'amm@esempio.ch', timezone: 'Europe/Rome', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', weekStart: 0, cmsLanguage: 'en' }, adminId);
    assert.equal(r.ok, true);
    const g = await G.getGeneral();
    assert.deepEqual([g.adminEmail, g.timezone, g.dateFormat, g.timeFormat, g.weekStart, g.cmsLanguage], ['amm@esempio.ch', 'Europe/Rome', 'DD/MM/YYYY', '12h', 0, 'en']);
    assert.equal('adminEmail' in G.publicGeneral(g), false, 'l\'email dell\'amministrazione non va ai template');
    assert.equal((await G.saveGeneral({ ...g, timezone: 'Marte/X' }, adminId)).ok, false);
  });

  await t.test('destinatari: prima il modulo, poi Impostazioni → Email, poi l\'email dell\'amministrazione', async () => {
    const block = { delivery: { recipients: ['modulo@esempio.ch'], subject: 'x' } };
    assert.deepEqual(await S.formRecipients(block), ['modulo@esempio.ch']);
    const noOwn = { delivery: { subject: 'x' } };
    assert.deepEqual(await S.formRecipients(noOwn), ['amm@esempio.ch'], 'in mancanza di altro, l\'email dell\'amministrazione');
    assert.equal((await S.saveMailRecipients('Info@Esempio.ch,\nvendite@esempio.ch  ; info@esempio.ch', adminId)).ok, true);
    assert.deepEqual(await S.formRecipients(noOwn), ['info@esempio.ch', 'vendite@esempio.ch']);
    assert.match((await S.saveMailRecipients('no-email', adminId)).error, /non è un indirizzo/);
    assert.match((await S.saveMailRecipients(Array.from({ length: 11 }, (_, i) => `a${i}@esempio.ch`), adminId)).error, /Al massimo 10/);
  });

  await t.test('Brevo: chiave cifrata, mai in chiaro; invio via API; errori leggibili senza la chiave', async () => {
    const miss = await S.saveMailSettings({ provider: 'brevo', domain: 'esempio.ch' }, adminId);
    assert.match(miss.errors.apiKey, /Incolla la chiave/);
    assert.ok((await S.saveMailSettings({ provider: 'brevo', domain: 'esempio.ch', apiKey: 'corta' }, adminId)).errors.apiKey);
    for (const domain of ['', 'http://esempio.ch', 'esempio', 'a b.ch', 'info@esempio.ch/x']) assert.ok((await S.saveMailSettings({ provider: 'brevo', domain, apiKey: 'xkeysib-0123456789abcdef0123456789' }, adminId)).errors?.domain, `dominio «${domain}»`);
    const saved = await S.saveMailSettings({ provider: 'brevo', domain: '@Esempio.ch', fromName: '', apiKey: 'xkeysib-0123456789abcdef0123456789' }, adminId);
    assert.equal(saved.ok, true);
    const raw = (await query("SELECT value FROM settings WHERE name = 'mail'"))[0].value;
    assert.equal(raw.includes('xkeysib-0123456789'), false, 'la chiave non sta in chiaro nel database');
    const view = await S.mailSettingsView();
    assert.deepEqual([view.settings.provider, view.settings.hasApiKey, view.settings.apiKeyReadable], ['brevo', true, true]);
    assert.equal(JSON.stringify(view).includes('xkeysib-'), false, 'la vista per il browser non contiene la chiave');
    // chiave vuota = si tiene quella salvata
    assert.equal((await S.saveMailSettings({ provider: 'brevo', domain: 'altro.ch', fromName: 'Sito', apiKey: '' }, adminId)).ok, true);
    assert.equal((await S.mailSettingsView()).settings.domain, 'altro.ch');

    const conf = await S.resolveMailConfig();
    assert.deepEqual([conf.source, conf.from.address, conf.from.name], ['brevo', 'no-reply@altro.ch', 'Sito']);
    const r = await M.sendTestMail('dest@esempio.ch');
    assert.deepEqual([r.ok, r.via], [true, 'brevo']);
    const c = calls.at(-1);
    assert.equal(c.key, 'xkeysib-0123456789abcdef0123456789');
    assert.deepEqual([c.body.sender, c.body.to, typeof c.body.textContent], [{ email: 'no-reply@altro.ch', name: 'Sito' }, [{ email: 'dest@esempio.ch' }], 'string']);

    // modulo senza destinatari propri → quelli di Impostazioni → Email
    const block = { id: 'f1', label: { it: 'Contatti' }, fields: [{ name: 'email', type: 'email', label: { it: 'Email' } }], delivery: { subject: 'Nuova richiesta' } };
    const sent = await M.sendSubmissionMail({ block, values: { email: 'cliente@esempio.ch' }, submission: { id: 1, page_key: 'contatti', created_at: new Date() } });
    assert.equal(sent.status, 'sent');
    assert.deepEqual(calls.at(-1).body.to.map((x) => x.email), ['info@esempio.ch', 'vendite@esempio.ch']);
    assert.deepEqual(calls.at(-1).body.replyTo, { email: 'cliente@esempio.ch' });

    // chiave rifiutata: errore chiaro, senza la chiave
    await S.saveMailSettings({ provider: 'brevo', domain: 'altro.ch', apiKey: 'chiave-rifiutata-0000000000' }, adminId);
    const bad = await M.sendTestMail('dest@esempio.ch');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Brevo ha rifiutato l'invio \(401\): Key not found/);
    assert.doesNotMatch(bad.error, /chiave-rifiutata/);
  });

  await t.test('senza destinatari né email dell\'amministrazione la richiesta non parte, con un motivo', async () => {
    await S.saveMailRecipients([], adminId);
    await G.saveGeneral({ ...(await G.getGeneral()), adminEmail: '' }, adminId);
    const block = { id: 'f2', label: { it: 'Contatti' }, fields: [], delivery: { subject: 'x' } };
    const r = await M.sendSubmissionMail({ block, values: {}, submission: { id: 2, page_key: 'p', created_at: new Date() } });
    assert.deepEqual([r.status, /Nessun destinatario/.test(r.error)], ['skipped', true]);
  });

  await t.test('avviso all\'amministrazione (per esempio pubblicazione pianificata non riuscita)', async () => {
    const sentMail = []; const transport = { sendMail: async (m) => { sentMail.push(m); } };
    assert.equal((await M.notifyAdmin('Ciao', 'testo', { transport })).ok, false, 'senza email dell\'amministrazione non si invia');
    await G.saveGeneral({ ...(await G.getGeneral()), adminEmail: 'amm@esempio.ch' }, adminId);
    const ok = await M.notifyAdmin('Pubblicazione non riuscita', 'dettagli', { transport });
    assert.equal(ok.ok, true);
    assert.deepEqual([sentMail[0].to, sentMail[0].subject], ['amm@esempio.ch', 'Pubblicazione non riuscita']);
  });
});
