// Controllo statico: nessuna azione server (le funzioni che il browser può chiamare) è raggiungibile senza accesso,
// e quelle riservate agli admin lo dichiarano. Un'azione dimenticata senza controllo sarebbe una porta aperta.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(f); } else if (e.name === 'actions.js') files.push(f); } };
walk(path.join(ROOT, 'app'));

// Estrae { nome: corpo } dalle funzioni esportate.
const actionsOf = (src) => {
  const parts = src.split(/^export async function /m).slice(1);
  return Object.fromEntries(parts.map((p) => [p.match(/^(\w+)/)[1], p]));
};

// Azioni che devono richiedere il ruolo admin (direttamente o tramite guard con kind 'site').
const ADMIN_ONLY = new Set(['publishAction', 'deletePageAction', 'saveTokensAction', 'deleteRequestAction', 'checkTemplateAction', 'activateTemplateAction', 'removeTemplateAction', 'saveMailSettingsAction', 'deleteMailSettingsAction', 'sendTestMailAction']);
// Il login e il logout sono le sole azioni pubbliche: l'una crea la sessione, l'altra la chiude.
const PUBLIC = new Set(['loginAction', 'logoutAction']);
// Le azioni dell'installazione sono pubbliche finché il CMS non è installato, ma chiedono la chiave di installazione e si spengono dopo.
const INSTALL = new Set(['checkRequirementsAction', 'saveDatabaseAction', 'finishInstallAction']);

test('ci sono azioni server da controllare', () => assert.ok(files.length >= 4, files.join(', ')));

test('ogni azione server richiede l\'accesso (requireUser o guard), tranne login e logout', () => {
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /^'use server';/m, `${f}: manca 'use server'`);
    for (const [name, body] of Object.entries(actionsOf(src))) {
      if (INSTALL.has(name)) { if (!/assertInstallToken\(/.test(body)) missing.push(`${path.relative(ROOT, f)}: ${name} (manca la chiave di installazione)`); continue; }
      if (PUBLIC.has(name)) continue;
      if (!/requireUser\(|guard\(/.test(body)) missing.push(`${path.relative(ROOT, f)}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], 'azioni senza controllo di accesso');
});

test('le azioni riservate richiedono il ruolo admin', () => {
  const found = new Set();
  for (const f of files) {
    for (const [name, body] of Object.entries(actionsOf(fs.readFileSync(f, 'utf8')))) {
      if (!ADMIN_ONLY.has(name)) continue;
      found.add(name);
      assert.match(body, /requireUser\('admin'\)/, `${name} deve richiedere requireUser('admin')`);
    }
  }
  assert.deepEqual([...found].sort(), [...ADMIN_ONLY].sort(), 'tutte le azioni riservate devono esistere');
});

test('i dati del sito sono modificabili solo da un admin (il controllo nel guard dell\'editor)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/admin/(shell)/_editor/actions.js'), 'utf8');
  assert.match(src, /requireUser\(kind === 'site' \? 'admin' : undefined\)/);
});

test('le pagine riservate dell\'admin chiedono il ruolo', () => {
  for (const [file, role] of [['app/admin/(shell)/site/page.jsx', "'admin'"], ['app/admin/(shell)/style/page.jsx', "'admin'"], ['app/admin/(shell)/email/page.jsx', "'admin'"], ['app/admin/(shell)/templates/page.jsx', "'admin'"]]) {
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), new RegExp(`requireUser\\(${role}\\)`), file);
  }
});
