import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { hasDb, setupTestDb, dropTestDb } from './helpers.mjs';
import { collectForms, validateSubmission, isAllowedOrigin, ipFrom, readBodyLimited } from '../lib/forms.mjs';
import { buildMessage } from '../lib/mail.mjs';
import { preventivo } from './fixtures/preventivo-page.mjs';   // starter ha solo un modulo semplice: qui ce n'è uno con ogni tipo di campo

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TPL = path.join(ROOT, 'templates/starter');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const FORM = preventivo.blocks.find((b) => b.type === 'form');
const good = () => ({ nome: 'Anna', cognome: 'Bianchi', telefono: '+41 79 123 45 67', email: 'anna@example.ch', citta: 'Lugano', servizio: 'Trasloco privato', data: '2026-11-03', messaggio: 'Appartamento al 4° piano.\nSenza ascensore.', privacy: true });

// ---- funzioni pure ---------------------------------------------------------------------------------------------------

test('collectForms: solo moduli di pagine pubblicate, anche se arrivano da un blocco condiviso', () => {
  const draft = { key: 'bozza', status: 'draft', blocks: [{ ...FORM, id: 'form-bozza' }] };
  const shared = { 'modulo-comune': { ...FORM, id: 'form-comune' } };
  const forms = collectForms({
    pages: [preventivo, draft, { key: 'contatti', status: 'published', blocks: [{ id: 'x', type: 'shared', ref: 'modulo-comune' }, { id: 'y', type: 'shared', ref: 'non-esiste' }] }],
    shared,
  });
  assert.deepEqual([...forms.keys()].sort(), ['form-comune', FORM.id].sort());
  assert.equal(forms.get(FORM.id).pageKey, 'preventivo');
  assert.equal(forms.get('form-comune').pageKey, 'contatti');
});

test('validazione: una richiesta corretta passa e tiene solo i campi previsti', () => {
  const r = validateSubmission(FORM, { ...good(), destinatario: 'ladro@example.com', subject: 'Oggetto rubato', _admin: true });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(Object.keys(r.values).sort(), Object.keys(good()).sort());
  assert.equal(r.consent, true);
  assert.equal(r.values.messaggio, 'Appartamento al 4° piano.\nSenza ascensore.', 'nel testo lungo gli a capo restano');
});

test('validazione: obbligatori, formati e scelte', () => {
  const bad = (patch) => validateSubmission(FORM, { ...good(), ...patch }).errors;
  assert.ok(bad({ nome: '' }).nome);
  assert.ok(bad({ nome: '   ' }).nome, 'solo spazi = vuoto');
  assert.ok(bad({ cognome: undefined }).cognome);
  assert.ok(bad({ email: 'non-una-email' }).email);
  assert.ok(bad({ email: 'a@b' }).email);
  assert.ok(bad({ email: 'a@b.ch\nBcc: vittima@example.com' }).email, 'niente intestazioni nascoste nell\'email');
  assert.ok(bad({ email: 'anna@example.ch, altra@example.ch' }).email, 'un solo indirizzo');
  assert.ok(bad({ telefono: '12' }).telefono);
  assert.ok(bad({ telefono: 'chiamami' }).telefono);
  assert.ok(bad({ data: '2026-02-30' }).data, 'data che non esiste');
  assert.ok(bad({ data: '03.11.2026' }).data);
  assert.ok(bad({ servizio: 'Un servizio inventato' }).servizio);
  assert.ok(bad({ nome: 'x'.repeat(201) }).nome);
  assert.ok(bad({ messaggio: 'x'.repeat(5001) }).messaggio);
  assert.ok(bad({ privacy: false }).privacy, 'senza consenso non si salva');
  assert.ok(bad({ privacy: undefined }).privacy);
  assert.ok(bad({ nome: { $ne: '' } }).nome, 'un oggetto al posto di un testo');
  assert.ok(bad({ nome: ['a'] }).nome);
  assert.ok(bad({ telefono: 123456789 }).telefono, 'un numero JSON non è un testo');
  assert.deepEqual(validateSubmission(FORM, null).ok, false);
  assert.deepEqual(validateSubmission(FORM, 'testo').ok, false);
  assert.deepEqual(validateSubmission(FORM, []).ok, false);
});

test('validazione: i facoltativi possono mancare; caratteri di controllo e a capo nei campi a riga singola vengono tolti', () => {
  const r = validateSubmission(FORM, { ...good(), servizio: '', data: '', messaggio: undefined, nome: 'Anna' + String.fromCharCode(0) + '\r\nMaria' + String.fromCharCode(7), citta: 'Lu\tgano' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal('servizio' in r.values, false);
  assert.equal(r.values.nome, 'Anna Maria');
  assert.equal(r.values.citta, 'Lu gano');
});

test('email: oggetto e destinatari vengono dal modulo, il mittente è quello configurato, chi scrive va in Reply-To', () => {
  const values = validateSubmission(FORM, good()).values;
  const m = buildMessage({ block: { ...FORM, delivery: { recipients: ['info@esempio.ch', 'ufficio@esempio.ch'], subject: 'Richiesta\r\nBcc: x@example.com' } }, values, submission: { id: 7, page_key: 'preventivo', created_at: new Date('2026-09-19T10:00:00Z') }, from: 'sito@esempio.ch', adminUrl: 'https://admin.example/admin/requests/7' });
  assert.deepEqual(m.to, ['info@esempio.ch', 'ufficio@esempio.ch']);
  assert.equal(m.from, 'sito@esempio.ch');
  assert.equal(m.replyTo, 'anna@example.ch');
  assert.doesNotMatch(m.subject, /[\r\n]/);
  assert.equal(m.subject, 'Richiesta Bcc: x@example.com');
  assert.match(m.text, /Nome: Anna/);
  assert.match(m.text, /Città di partenza: Lugano/);
  assert.match(m.text, /Messaggio:\nAppartamento al 4° piano\.\nSenza ascensore\./);
  assert.match(m.text, /Consenso: sì \(Ho letto l'informativa sulla privacy e acconsento/, 'l\'etichetta con il link diventa testo semplice');
  assert.match(m.text, /https:\/\/admin\.example\/admin\/requests\/7/);
  assert.doesNotMatch(m.text, /<a |href=/);
});

test('origine: stesso host, APP_ORIGIN e FORM_ALLOWED_ORIGINS sì; altri siti no', () => {
  const keep = { a: process.env.APP_ORIGIN, f: process.env.FORM_ALLOWED_ORIGINS };
  process.env.APP_ORIGIN = 'https://admin.esempio.example'; process.env.FORM_ALLOWED_ORIGINS = 'https://www.esempio.example, non-un-url';
  try {
    assert.equal(isAllowedOrigin(null, 'x'), true, 'senza Origin (non è un browser)');
    assert.equal(isAllowedOrigin('https://www.esempio.example', 'app.internal:3000'), true);
    assert.equal(isAllowedOrigin('https://admin.esempio.example', 'app.internal:3000'), true);
    assert.equal(isAllowedOrigin('https://sito.example:8443', 'sito.example:8443'), true, 'stesso host della richiesta (proxy)');
    assert.equal(isAllowedOrigin('https://evil.example', 'app.internal:3000'), false);
    assert.equal(isAllowedOrigin('https://www.esempio.example.evil.example', 'app.internal:3000'), false);
    assert.equal(isAllowedOrigin('null', 'app.internal:3000'), false);
    assert.equal(isAllowedOrigin('http://www.esempio.example', 'app.internal:3000'), false, 'anche lo schema conta');
  } finally { for (const [k, v] of [['APP_ORIGIN', keep.a], ['FORM_ALLOWED_ORIGINS', keep.f]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});

test('indirizzo IP: si legge X-Forwarded-For solo con TRUST_PROXY=1', () => {
  const keep = process.env.TRUST_PROXY;
  const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
  try {
    process.env.TRUST_PROXY = '0'; assert.equal(ipFrom(h), null);
    process.env.TRUST_PROXY = '1'; assert.equal(ipFrom(h), '10.0.0.1', 'vale l\'ultimo valore, quello scritto dal proxy: i precedenti li può inventare il client');
    assert.equal(ipFrom(new Headers({ 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
    assert.equal(ipFrom(new Headers({ 'x-forwarded-for': '<script>' })), null);
  } finally { if (keep === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = keep; }
});

test('corpo: si legge fino al limite e non oltre', async () => {
  const req = (body, headers = {}) => new Request('http://x/api', { method: 'POST', body, headers, duplex: 'half' });
  assert.equal(await readBodyLimited(req('{"a":1}'), 100), '{"a":1}');
  assert.equal(await readBodyLimited(req('x'.repeat(200)), 100), null);
  assert.equal(await readBodyLimited(req('x', { 'content-length': '999999' }), 100), null, 'dichiarato troppo grande: non si legge nemmeno');
});

// ---- con il database -------------------------------------------------------------------------------------------------------

test('moduli: ricezione, salvataggio, email, limiti e gestione', { skip: !hasDb && 'database di prova non disponibile' }, async (t) => {
  await setupTestDb();
  const { query, one, closeDb } = await import('../lib/db.mjs');
  const F = await import('../lib/forms.mjs');
  const R = await import('../lib/requests.mjs');
  t.after(async () => { await closeDb(); await dropTestDb(); });
  const saved = { proxy: process.env.TRUST_PROXY, smtp: process.env.SMTP_HOST, from: process.env.MAIL_FROM, app: process.env.APP_ORIGIN };
  t.after(() => { for (const [k, v] of [['TRUST_PROXY', saved.proxy], ['SMTP_HOST', saved.smtp], ['MAIL_FROM', saved.from], ['APP_ORIGIN', saved.app]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  delete process.env.SMTP_HOST; delete process.env.MAIL_FROM; process.env.TRUST_PROXY = '0'; process.env.APP_ORIGIN = 'http://localhost:3000'; process.env.IP_HASH_SECRET = 'sale-di-prova-per-i-test';

  const put = async (kind, key, data, published = true) => {
    const json = JSON.stringify(data);
    await query('INSERT INTO docs (kind, doc_key, draft, published) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE draft = VALUES(draft), published = VALUES(published)', [kind, key, json, published ? json : null]);
    F.resetFormsCache();
  };
  await put('site', 'main', readJson('templates/starter/content/site.json'));
  await put('page', 'preventivo', preventivo);

  const post = (body, { id = FORM.id, headers = {}, raw } = {}) => F.handleSubmission({
    id, notify: false,
    body: raw !== undefined ? raw : JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
  });
  const payload = (over = {}, extra = {}) => ({ fields: { ...good(), ...over }, website: '', _t: 5000, locale: 'it', ...extra });
  const count = async () => (await one('SELECT COUNT(*) AS n FROM form_submissions')).n;

  await t.test('richiesta valida: si salva con pagina, lingua, destinatari e consenso', async () => {
    const r = await post(payload({ nome: 'Prima' }));
    assert.deepEqual([r.status, r.json], [200, { ok: true }]);
    const row = await one('SELECT * FROM form_submissions ORDER BY id DESC LIMIT 1');
    assert.deepEqual([row.block_id, row.page_key, row.locale, row.consent, row.status, row.mail_status], [FORM.id, 'preventivo', 'it', 1, 'new', 'pending']);
    assert.equal(row.recipients, 'info@esempio.ch');
    assert.equal(JSON.parse(row.data).nome, 'Prima');
    assert.equal(row.ip_hash, null, 'senza proxy fidato non si registra nessun indirizzo');
    assert.equal(row.user_agent, null);
  });

  await t.test('campi non previsti e tentativi di cambiare destinatari o oggetto vengono ignorati', async () => {
    const r = await post({ ...payload({ nome: 'Seconda', destinatari: ['ladro@example.com'] }), recipients: ['ladro@example.com'], subject: 'rubato', block: { delivery: { recipients: ['ladro@example.com'] } } });
    assert.equal(r.status, 200);
    const row = await one('SELECT * FROM form_submissions ORDER BY id DESC LIMIT 1');
    assert.equal(row.recipients, 'info@esempio.ch');
    assert.equal(JSON.parse(row.data).destinatari, undefined);
    assert.doesNotMatch(row.data, /ladro/);
  });

  await t.test('richiesta non valida: 422 con i campi sbagliati, niente salvato', async () => {
    const before = await count();
    const r = await post(payload({ nome: 'Terza', email: 'sbagliata', privacy: false }));
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.errors).sort(), ['email', 'privacy']);
    assert.equal(await count(), before);
  });

  await t.test('modulo sconosciuto, in una pagina in bozza o mai pubblicato: 404', async () => {
    assert.equal((await post(payload({ nome: 'A' }), { id: 'non-esiste' })).status, 404);
    assert.equal((await post(payload(), { id: '../etc/passwd' })).status, 404);
    await put('page', 'preventivo', { ...preventivo, status: 'draft' });
    assert.equal((await post(payload({ nome: 'B' }))).status, 404, 'pagina in bozza');
    await put('page', 'preventivo', preventivo, false);
    assert.equal((await post(payload({ nome: 'C' }))).status, 404, 'pagina non pubblicata');
    await put('page', 'preventivo', preventivo);
    assert.equal((await post(payload({ nome: 'D' }))).status, 200, 'di nuovo raggiungibile');
  });

  await t.test('formato della richiesta: tipo di contenuto, JSON, dimensione', async () => {
    const before = await count();
    assert.equal((await F.handleSubmission({ id: FORM.id, body: '{}', headers: new Headers({ 'content-type': 'text/plain' }) })).status, 415);
    assert.equal((await post(null, { raw: '{non json' })).status, 400);
    assert.equal((await post(null, { raw: '[]' })).status, 400);
    assert.equal((await post(null, { raw: '"testo"' })).status, 400);
    assert.equal((await post(null, { raw: null })).status, 413, 'corpo oltre il limite');
    assert.equal(await count(), before);
  });

  await t.test('automatismi: esca compilata o invio troppo rapido finiscono in "ok" ma non si salva nulla; senza tempo è un errore', async () => {
    const before = await count();
    assert.deepEqual((await post(payload({ nome: 'Bot1' }, { website: 'http://spam.example' }))).json, { ok: true });
    assert.deepEqual((await post(payload({ nome: 'Bot2' }, { _t: 300 }))).json, { ok: true });
    assert.equal(await count(), before);
    assert.equal((await post({ fields: good(), website: '' })).status, 400, 'senza _t (non è il nostro script)');
    assert.equal((await post(payload({ nome: 'Bot3' }, { _t: 'tanto' }))).status, 400);
  });

  await t.test('invio doppio della stessa richiesta: una sola riga', async () => {
    const before = await count();
    await post(payload({ nome: 'Doppia' }));
    const again = await post(payload({ nome: 'Doppia' }));
    assert.equal(again.status, 200);
    assert.equal(await count(), before + 1);
  });

  await t.test('origine: un altro sito è respinto, l\'indirizzo pubblico e il proprio host sono accettati', async () => {
    const before = await count();
    assert.equal((await post(payload({ nome: 'X1' }), { headers: { origin: 'https://evil.example', host: 'localhost:3000' } })).status, 403);
    assert.equal((await post(payload({ nome: 'X2' }), { headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } })).status, 200);
    assert.equal((await post(payload({ nome: 'X3' }), { headers: { origin: 'http://localhost:4173', host: 'localhost:4173' } })).status, 200, 'sito statico dietro lo stesso proxy');
    assert.equal(await count(), before + 2);
  });

  await t.test('limite per indirizzo (dietro proxy fidato): il sesto in un\'ora riceve 429; l\'IP si salva solo come impronta', async () => {
    process.env.TRUST_PROXY = '1';
    try {
      const h = { 'x-forwarded-for': '198.51.100.23' };
      for (let i = 0; i < 5; i++) assert.equal((await post(payload({ nome: `Ip${i}` }), { headers: h })).status, 200, `richiesta ${i + 1}`);
      assert.equal((await post(payload({ nome: 'Ip5' }), { headers: h })).status, 429);
      assert.equal((await post(payload({ nome: 'Altro' }), { headers: { 'x-forwarded-for': '198.51.100.99' } })).status, 200, 'un altro indirizzo non è toccato');
      const row = await one('SELECT ip_hash FROM form_submissions WHERE ip_hash IS NOT NULL LIMIT 1');
      assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
      assert.equal((await query("SELECT COUNT(*) AS n FROM form_submissions WHERE ip_hash LIKE '%198.51%'"))[0].n, 0);
    } finally { process.env.TRUST_PROXY = '0'; }
  });

  await t.test('tetto per modulo: dopo 60 richieste in un\'ora anche senza indirizzo si risponde 429', async () => {
    const n = await count();
    for (let i = n; i < 60; i++) await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent) VALUES (?, 'preventivo', 'it', ?, 1)", [FORM.id, JSON.stringify({ nome: `riempi${i}` })]);
    assert.equal((await post(payload({ nome: 'Oltre' }))).status, 429);
  });

  await t.test('email: parte con mittente configurato, Reply-To di chi scrive e destinatari del modulo; l\'esito si registra', async () => {
    const id = Number((await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent, recipients) VALUES (?, 'preventivo', 'it', ?, 1, 'info@esempio.ch')", [FORM.id, JSON.stringify(validateSubmission(FORM, good()).values)])).insertId);
    process.env.MAIL_FROM = 'sito@esempio.ch';
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const r = await F.notifySubmission(id, transport);
    assert.deepEqual([r.ok, r.status], [true, 'sent']);
    const row = await one('SELECT mail_status, mail_error, mailed_at FROM form_submissions WHERE id = ?', [id]);
    assert.deepEqual([row.mail_status, row.mail_error], ['sent', null]);
    assert.ok(row.mailed_at);
  });

  await t.test('email: contenuto del messaggio inviato', async () => {
    const id = Number((await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent, recipients) VALUES (?, 'preventivo', 'it', ?, 1, 'info@esempio.ch')", [FORM.id, JSON.stringify(validateSubmission(FORM, good()).values)])).insertId);
    const captured = [];
    await F.notifySubmission(id, { sendMail: async (m) => { captured.push(m); } });
    assert.equal(captured.length, 1);
    assert.deepEqual([captured[0].to, captured[0].subject, captured[0].replyTo, captured[0].from], [['info@esempio.ch'], 'Richiesta di preventivo', 'anna@example.ch', 'sito@esempio.ch']);
  });

  await t.test('email: se il server rifiuta, la richiesta resta con l\'errore e si può rinviare', async () => {
    const id = Number((await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent) VALUES (?, 'preventivo', 'it', ?, 1)", [FORM.id, JSON.stringify(validateSubmission(FORM, good()).values)])).insertId);
    const r = await F.notifySubmission(id, { sendMail: async () => { throw new Error('535 Authentication failed'); } });
    assert.deepEqual([r.ok, r.status], [false, 'failed']);
    const row = await one('SELECT mail_status, mail_error FROM form_submissions WHERE id = ?', [id]);
    assert.equal(row.mail_status, 'failed');
    assert.match(row.mail_error, /Authentication failed/);
    assert.equal((await F.notifySubmission(id, { sendMail: async () => {} })).ok, true, 'rinvio riuscito');
  });

  await t.test('email: senza server configurato l\'esito è "non configurata", non un errore che perde la richiesta', async () => {
    delete process.env.MAIL_FROM;
    const id = Number((await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent) VALUES (?, 'preventivo', 'it', ?, 1)", [FORM.id, JSON.stringify(validateSubmission(FORM, good()).values)])).insertId);
    const r = await F.notifySubmission(id);
    assert.equal(r.status, 'skipped');
    assert.match(r.error, /Impostazioni email/);
    assert.equal((await one('SELECT status FROM form_submissions WHERE id = ?', [id])).status, 'new', 'la richiesta resta da leggere');
    assert.equal((await F.notifySubmission(999999)).ok, false);
  });

  await t.test('elenco per l\'admin: conteggi, filtro, etichette dei campi, stato, eliminazione', async () => {
    const counts = await R.submissionCounts();
    assert.ok(counts.new >= 5);
    const list = await R.listSubmissions({ status: 'new', limit: 3 });
    assert.equal(list.length, 3);
    assert.ok(list[0].id > list[1].id, 'le più recenti per prime');
    const id = list[0].id;
    const one1 = await R.getSubmission(id);
    assert.ok(one1.fields.length >= 4);
    assert.equal(one1.fields.find((f) => f.name === 'citta').label, 'Città di partenza');
    assert.equal(one1.fields.find((f) => f.name === 'privacy').label, 'Consenso');
    assert.equal(one1.formLabel, 'Richiesta di preventivo');
    assert.equal(await R.setSubmissionStatus(id, 'read'), true);
    assert.equal((await R.getSubmission(id)).status, 'read');
    await assert.rejects(R.setSubmissionStatus(id, 'inventato'), /Stato non valido/);
    assert.equal((await R.submissionCounts()).new, counts.new - 1);
    assert.equal(await R.deleteSubmission(id), true);
    assert.equal(await R.getSubmission(id), null);
    assert.equal(await R.deleteSubmission(id), false);
  });

  await t.test('un campo tolto dal modulo dopo l\'invio si vede comunque nella richiesta', async () => {
    const id = Number((await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent) VALUES (?, 'preventivo', 'it', ?, 1)", [FORM.id, JSON.stringify({ nome: 'Vecchio', campo_tolto: 'valore' })])).insertId);
    const r = await R.getSubmission(id);
    assert.ok(r.fields.some((f) => f.name === 'campo_tolto' && f.value === 'valore'));
  });
});
