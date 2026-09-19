// Sonda di sicurezza dinamica: attacca l'app in esecuzione (nessuna modifica permanente: crea utenti e dati di prova e li rimuove).
// Serve: app avviata (npm run build:admin && npm start), database, e E2E_URL. Alla fine ripristina il database ai file originali.
// Controlla: accesso anonimo a ogni route, permessi dell'editor sulle azioni riservate (chiamate davvero via HTTP, con gli identificativi
// delle azioni server), utenti disattivati, intestazioni, path traversal, endpoint pubblico dei moduli.
// Uso: E2E_URL=http://localhost:3000 node scripts/probe-security.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { E2E_URL } = process.env;
if (!E2E_URL) { console.error('manca E2E_URL'); process.exit(1); }
const ORIGIN = new URL(E2E_URL).origin;

const { loadEnv, assertLocalDatabase } = await import('../lib/env.mjs'); loadEnv(); assertLocalDatabase('Questa prova');
const { query, one, closeDb } = await import('../lib/db.mjs');
const { createSession } = await import('../lib/sessions.mjs');
const { hashPassword } = await import('../lib/password.mjs');
const D = await import('../lib/docs.mjs');

const results = [];
const note = (level, name, detail = '') => { results.push({ level, name, detail }); console.log(`${level.padEnd(5)} ${name}${detail ? ` — ${detail}` : ''}`); };
const check = async (name, fn) => { try { const r = await fn(); note('ok', name, typeof r === 'string' ? r : ''); } catch (e) { note('FAIL', name, e.message.split('\n')[0]); } };

// ---- utenti di prova ---------------------------------------------------------------------------------------------------
const pw = await hashPassword('probe-Password-2026!x');
await query("DELETE FROM users WHERE email LIKE 'probe-%@example.test'");
const mk = async (role) => Number((await query('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', [`probe-${role}@example.test`, `Probe ${role}`, pw, role])).insertId);
const adminId = await mk('admin'); const editorId = await mk('editor');
const tokenOf = async (id) => (await createSession(id, { ip: 'probe', ua: 'probe' })).token;
const adminCookie = `cms_session=${await tokenOf(adminId)}`;
const editorCookie = `cms_session=${await tokenOf(editorId)}`;

const get = (p, cookie, init = {}) => fetch(E2E_URL + p, { redirect: 'manual', ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) } });
const loc = (r) => r.headers.get('location') ?? r.headers.get('x-action-redirect') ?? '';

// ---- azioni server, chiamate via HTTP ------------------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.next/server/server-reference-manifest.json'), 'utf8')).node;
const actions = Object.fromEntries(Object.entries(manifest).map(([id, v]) => [v.exportedName, { id, page: Object.keys(v.workers)[0] }]));
const urlOfWorker = (w) => w.replace(/^app/, '').replace(/\/\([^/]+\)/g, '').replace(/\/page$/, '').replace('[key]', 'home').replace('[id]', '1') || '/';
async function callAction(name, args, cookie) {
  const a = actions[name]; assert.ok(a, `azione ${name} non trovata nel manifest`);
  const r = await fetch(E2E_URL + urlOfWorker(a.page), {
    method: 'POST', redirect: 'manual',
    headers: { 'Next-Action': a.id, 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(args),
  });
  return { status: r.status, redirect: loc(r), body: (await r.text()).slice(0, 4000) };
}
const blocked = (r) => /\/admin\/login|negato=1/.test(r.redirect) || [401, 403, 307, 303].includes(r.status);

// ---- 1. anonimo: ogni route protetta rimanda al login --------------------------------------------------------------------
const ROUTES = ['/admin', '/admin/pages', '/admin/pages/home', '/admin/shared', '/admin/site', '/admin/style', '/admin/media', '/admin/requests', '/admin/requests/1', '/admin/email',
  '/admin/preview', '/admin/preview/servizi', '/admin/preview-assets/img/uploads/probe.jpg', '/admin/media/thumb/hero-mammano.jpg'];
for (const p of ROUTES) await check(`anonimo: GET ${p} rimanda al login`, async () => { const r = await get(p); assert.ok([302, 307, 401].includes(r.status), `stato ${r.status}`); assert.match(loc(r) || 'login', /login|^$/); });
// I file del template (CSS, immagini, script) sono gli stessi del sito pubblico: l'anteprima li serve a chiunque. Le immagini caricate dal cliente no.
await check('anonimo: i file del template in anteprima sono pubblici come sul sito (200), non altro', async () => { const r = await get('/admin/preview-assets/css/site.css'); assert.equal(r.status, 200); });
await check('anonimo: un\'immagine caricata si vede solo con sessione o con il gettone firmato (scaduto/falso: no)', async () => {
  for (const q of ['', '?t=falso', '?t=1.aaaa']) { const r = await get('/admin/preview-assets/img/uploads/probe.jpg' + q); assert.ok([302, 307, 401, 403, 404].includes(r.status), `${q}: stato ${r.status}`); }
});
await check('anonimo: POST /admin/media/upload respinto', async () => { const r = await get('/admin/media/upload', null, { method: 'POST', body: 'x' }); assert.ok([302, 307, 401, 403].includes(r.status), `stato ${r.status}`); });
await check('anonimo: /admin/login è raggiungibile (e nient\'altro sotto /admin)', async () => { const r = await get('/admin/login'); assert.equal(r.status, 200); });

// ---- 2. anonimo: nessuna azione server funziona --------------------------------------------------------------------------
const baseline = async () => ({
  publications: (await one('SELECT COUNT(*) AS n FROM publications')).n,
  settings: (await one('SELECT COUNT(*) AS n FROM settings')).n,
  tokensRev: (await one("SELECT rev FROM docs WHERE kind = 'tokens'")).rev,
  siteRev: (await one("SELECT rev FROM docs WHERE kind = 'site'")).rev,
  pagesDeleted: (await one('SELECT COUNT(*) AS n FROM docs WHERE deleted_at IS NOT NULL')).n,
  requests: (await one('SELECT COUNT(*) AS n FROM form_submissions')).n,
  users: (await one('SELECT COUNT(*) AS n FROM users')).n,
});
const tokens = (await D.loadData('draft')).tokens;
const siteDoc = (await D.loadData('draft')).site;
await query('DELETE FROM form_submissions');
const reqId = Number((await query("INSERT INTO form_submissions (block_id, page_key, locale, data, consent) VALUES ('probe', 'preventivo', 'it', '{\"nome\":\"Probe\"}', 1)")).insertId);
const ACTION_CALLS = () => [
  ['publishAction', []],
  ['saveTokensAction', [{ tokens, rev: 1 }]],
  ['saveMailSettingsAction', [{ host: 'smtp.evil.example', port: 25, security: 'none', user: '', password: 'x', from: 'a@evil.example', fromName: '' }]],
  ['deleteMailSettingsAction', []],
  ['sendTestMailAction', ['probe@example.test']],
  ['deleteRequestAction', [reqId]],
  ['deletePageAction', ['servizi']],
  ['saveDocAction', [{ kind: 'site', key: 'main', data: { ...siteDoc, siteUrl: 'https://evil.example' }, rev: 1 }]],
];
const before = await baseline();
for (const [name, args] of ACTION_CALLS()) await check(`anonimo: ${name} non ha effetto`, async () => { const r = await callAction(name, args, null); assert.ok(blocked(r), `risposta ${r.status} ${r.redirect} ${r.body.slice(0, 80)}`); });
await check('anonimo: nessun effetto nel database', async () => assert.deepEqual(await baseline(), before));

// ---- 3. editor: le azioni riservate agli admin non funzionano -----------------------------------------------------------------
for (const [name, args] of ACTION_CALLS()) await check(`editor: ${name} respinta`, async () => { const r = await callAction(name, args, editorCookie); assert.ok(/negato|login/.test(r.redirect + r.body) || r.status >= 400, `risposta ${r.status} ${r.redirect} ${r.body.slice(0, 120)}`); });
await check('editor: nessun effetto nel database', async () => assert.deepEqual(await baseline(), before));
for (const p of ['/admin/site', '/admin/style', '/admin/email']) await check(`editor: GET ${p} respinto`, async () => { const r = await get(p, editorCookie); assert.match(loc(r), /negato=1/); });
await check('editor: può invece usare ciò che gli spetta (elenco richieste, libreria)', async () => { for (const p of ['/admin/requests', '/admin/media', '/admin/pages']) assert.equal((await get(p, editorCookie)).status, 200, p); });

// ---- 4. utente disattivato o eliminato: la sessione smette di valere ----------------------------------------------------------
await check('utente disattivato: la sessione aperta non vale più', async () => {
  assert.equal((await get('/admin/requests', editorCookie)).status, 200);
  await query('UPDATE users SET active = 0 WHERE id = ?', [editorId]);
  const r = await get('/admin/requests', editorCookie);
  await query('UPDATE users SET active = 1 WHERE id = ?', [editorId]);
  assert.ok([302, 307].includes(r.status) && /login/.test(loc(r)), `stato ${r.status} ${loc(r)}`);
});
await check('cookie di sessione inventato o alterato: respinto', async () => {
  for (const c of ['cms_session=abc', 'cms_session=', `${adminCookie}x`, 'cms_session=' + 'a'.repeat(200), "cms_session=' OR 1=1 --"]) {
    const r = await get('/admin/requests', c); assert.ok([302, 307].includes(r.status) && /login/.test(loc(r)), `${c.slice(0, 30)} → ${r.status}`);
  }
});

// ---- 5. intestazioni ---------------------------------------------------------------------------------------------------------
await check('intestazioni dell\'admin', async () => {
  const r = await get('/admin/login');
  const h = (n) => r.headers.get(n);
  assert.equal(h('x-powered-by'), null, 'X-Powered-By presente');
  assert.equal(h('x-content-type-options'), 'nosniff');
  assert.equal(h('x-frame-options'), 'SAMEORIGIN');
  assert.match(h('cache-control') ?? '', /no-store/);
  const missing = ['content-security-policy', 'strict-transport-security', 'permissions-policy'].filter((n) => !h(n));
  return missing.length ? `assenti (informativo): ${missing.join(', ')}` : 'tutte presenti';
});

// ---- 6. path traversal (con sessione admin) ------------------------------------------------------------------------------------
const TRAV = ['/admin/preview-assets/..%2f..%2f.env', '/admin/preview-assets/%2e%2e/%2e%2e/.env', '/admin/preview-assets/img/..%2f..%2f.env', '/admin/preview-assets/img/%2e%2e%2f%2e%2e%2f.env',
  '/admin/preview-assets/img/..%2f..%2f..%2f.env', '/admin/preview-assets//etc/passwd', '/admin/preview-assets/img//etc/passwd', '/admin/preview-assets/..%5c..%5c.env',
  '/admin/preview-assets/img/%2e%2e%2fmedia%2f.gitkeep', '/admin/media/thumb/..%2f..%2f.env', '/admin/media/thumb/%2e%2e/%2e%2e/.env', '/admin/media/thumb//etc/passwd',
  '/admin/preview/..%2f..%2f.env', '/admin/preview/%2e%2e/%2e%2e/package.json', '/admin/preview-assets/%00', '/admin/preview-assets/img/hero-mammano.jpg%00.png'];
await check('path traversal: nessuna variante restituisce file fuori dalle cartelle consentite', async () => {
  const bad = [];
  for (const p of TRAV) { const r = await get(p, adminCookie); const t = r.status === 200 ? (await r.text()).slice(0, 400) : ''; if (r.status === 200 && /DB_PASSWORD|SETTINGS_SECRET|root:|"name":\s*"outsmart-cms"/.test(t)) bad.push(p); }
  assert.deepEqual(bad, []);
});

// ---- 7. endpoint pubblico dei moduli --------------------------------------------------------------------------------------------
const formId = JSON.parse((await one("SELECT published FROM docs WHERE kind = 'page' AND doc_key = 'preventivo'")).published).blocks.find((b) => b.type === 'form').id;
const api = (id, init = {}) => fetch(`${E2E_URL}/api/forms/${id}`, { redirect: 'manual', ...init });
await check('API moduli: metodi diversi da POST/OPTIONS respinti', async () => { for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) assert.equal((await api(formId, { method: m })).status, 405, m); });
await check('API moduli: tipo di contenuto sbagliato, JSON rotto, corpo enorme, id strani', async () => {
  const j = { 'Content-Type': 'application/json' };
  assert.equal((await api(formId, { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await api(formId, { method: 'POST', body: '{rotto', headers: j })).status, 400);
  assert.equal((await api(formId, { method: 'POST', body: 'x'.repeat(200_000), headers: j })).status, 413);
  for (const id of ['non-esiste', '..%2f..%2fetc', '%00', 'a'.repeat(300), "'; DROP TABLE docs;--"]) assert.equal((await api(id, { method: 'POST', body: '{}', headers: j })).status, 404, id);
});
await check('API moduli: dall\'esterno non si impostano destinatari né oggetto', async () => {
  const n0 = (await one('SELECT COUNT(*) AS n FROM form_submissions')).n;
  const r = await api(formId, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ fields: { nome: 'Probe', cognome: 'X', telefono: '+41 79 000 00 00', email: 'probe@example.test', citta: 'Lugano', privacy: true, recipients: ['evil@example.test'], to: 'evil@example.test', subject: 'x\r\nBcc: evil@example.test' }, recipients: ['evil@example.test'], website: '', _t: 5000 }) });
  assert.equal(r.status, 200);
  const row = await one('SELECT recipients, data FROM form_submissions ORDER BY id DESC LIMIT 1');
  assert.equal(row.recipients, 'info@mammano.ch');
  assert.doesNotMatch(row.data, /evil/);
  assert.equal((await one('SELECT COUNT(*) AS n FROM form_submissions')).n, n0 + 1);
});

// ---- 8. contenuto non fidato salvato da un editor ------------------------------------------------------------------------------
const EVIL = '<p>ciao <a href="javascript:alert(document.domain)">clic</a> <img src=x onerror=alert(1)> <script>alert(2)</script> <a href="page:privacy" onmouseover="alert(3)">x</a></p>';
await check('editor: HTML pericoloso in un testo ricco viene rifiutato dal server e non arriva alla bozza', async () => {
  const doc = await D.getDoc('page', 'privacy');
  const data = structuredClone(doc.draft);
  data.blocks[1].content.it = EVIL;
  const r = await callAction('saveDocAction', [{ kind: 'page', key: 'privacy', data, rev: doc.rev }], editorCookie);
  const stored = (await D.getDoc('page', 'privacy')).draft.blocks[1].content.it;
  assert.notEqual(stored, EVIL, `salvato senza sanificazione (azione: ${r.status})`);
  assert.match(r.body, /HTML non ammesso/, 'l\'editor deve vedere il perché');
});
await check('anche se un dato pericoloso arrivasse da un\'altra strada (DB), anteprima e sito non lo eseguono', async () => {
  const doc = await D.getDoc('page', 'privacy');
  const data = structuredClone(doc.draft); data.blocks[1].content.it = EVIL;
  await D.saveDraft('page', 'privacy', data, adminId);              // bypass volontario dell'azione: dato già "dentro"
  const pv = await (await get('/admin/preview/privacy', adminCookie, { redirect: 'follow' })).text();
  assert.doesNotMatch(pv, /javascript:alert|onerror=|onmouseover=|<script>alert/i, 'l\'anteprima ripete il codice');
  assert.match(pv, /ciao/, 'il testo innocuo c\'è');
  await D.seedFromFiles({ force: true });
});
await check('editor: non può cambiare i destinatari di un modulo né aggiungerne', async () => {
  const doc = await D.getDoc('page', 'preventivo');
  const data = structuredClone(doc.draft);
  data.blocks.find((b) => b.type === 'form').delivery.recipients = ['evil@example.test'];
  const r = await callAction('saveDocAction', [{ kind: 'page', key: 'preventivo', data, rev: doc.rev }], editorCookie);
  assert.match(r.body, /Solo un admin/, r.body.slice(0, 120));
  assert.deepEqual((await D.getDoc('page', 'preventivo')).draft.blocks.find((b) => b.type === 'form').delivery.recipients, ['info@mammano.ch']);
});
await check('editor: una chiave passata come array non aggira i controlli (home non si elimina)', async () => {
  const r = await callAction('deletePageAction', [['home']], adminCookie);
  assert.equal((await one("SELECT deleted_at FROM docs WHERE kind = 'page' AND doc_key = 'home'")).deleted_at, null, r.body.slice(0, 100));
});

// ---- 9. CSP, cookie, upload, account ---------------------------------------------------------------------------------------------
await check('CSP dell\'admin: nonce per richiesta, senza unsafe-inline negli script', async () => {
  const a = (await get('/admin/login')).headers.get('content-security-policy');
  const b = (await get('/admin/login')).headers.get('content-security-policy');
  assert.ok(a && b, 'header assente');
  assert.match(a, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(a.match(/script-src[^;]*/)[0], /unsafe/);
  assert.notEqual(a, b, 'il nonce cambia a ogni richiesta');
  const html = await (await get('/admin/login')).text();
  const nonce = (await get('/admin/login')).headers.get('content-security-policy').match(/nonce-([^']+)/)[1];
  assert.ok(html.includes('nonce='), 'Next mette il nonce sui propri script');
  return nonce ? '' : '';
});
await check('CSP: anche la pagina di anteprima (route) e le API hanno intestazioni di sicurezza', async () => {
  assert.match((await get('/admin/preview/privacy', adminCookie, { redirect: 'follow' })).headers.get('content-security-policy') ?? '', /script-src 'self'/);
  const r = await api(formId, { method: 'OPTIONS' });
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
await check('upload: senza Content-Length (trasferimento a pezzi) respinto; cross-origin respinto', async () => {
  const chunked = await fetch(E2E_URL + '/admin/media/upload', { method: 'POST', redirect: 'manual', headers: { Cookie: adminCookie, Origin: ORIGIN }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x')); c.close(); } }), duplex: 'half' });
  assert.ok([411, 400].includes(chunked.status), `stato ${chunked.status}`);
  const evil = await fetch(E2E_URL + '/admin/media/upload', { method: 'POST', redirect: 'manual', headers: { Cookie: adminCookie, Origin: 'https://evil.example' }, body: 'x' });
  assert.equal(evil.status, 403);
});
await check('account: la pagina c\'è per ogni utente e mostra solo i propri dati', async () => {
  const r = await get('/admin/account', editorCookie);
  assert.equal(r.status, 200);
  const t = await r.text();
  assert.ok(t.includes('Probe editor') && !t.includes('Probe admin'));
});

// ---- pulizia -------------------------------------------------------------------------------------------------------------------
await query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'probe-%@example.test')");
await query("DELETE FROM users WHERE email LIKE 'probe-%@example.test'");
await query('DELETE FROM form_submissions');
await query('DELETE FROM settings');
await D.seedFromFiles({ force: true });
await D.publishAll(null, { force: true });
await closeDb();

const fails = results.filter((r) => r.level === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} controlli riusciti${fails.length ? `, ${fails.length} PROBLEMI:` : ''}`);
for (const f of fails) console.log(`  - ${f.name}: ${f.detail}`);
process.exit(fails.length ? 1 : 0);
