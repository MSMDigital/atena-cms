// Prove di sicurezza sul codice (senza database): sanificazione, schemi, percorsi, controlli lato server, configurazione.
// Ogni prova nasce da un problema trovato nella revisione di sicurezza: se torna, il test lo dice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeRich, HREF_OK } from '../render/sanitize.mjs';
import { unsafeText, deliveryProblem } from '../lib/content-guard.mjs';
import { validateData } from '../schema/validate.mjs';
import { buildSite, BuildError } from '../render/build.mjs';
import { createContext, loadData } from '../render/context.mjs';
import { validateSubmission } from '../lib/forms.mjs';
import { toPreviewHtml } from '../lib/preview.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const TPL = path.join(ROOT, 'templates/mammano');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const base = () => structuredClone(loadData(TPL));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sec-'));
const ALLOWED_OUT = /<(?!\/?(?:strong|em|p|ul|ol|li|blockquote|h[2-6]|br|a)(?: href="[^"<>]*")?>)/;   // ogni "<" dell'uscita apre solo un tag ammesso

// ---- sanificazione dei testi ricchi -------------------------------------------------------------------------------------------

test('sanificazione: tag e indirizzi pericolosi spariscono, il testo resta', () => {
  const cases = [
    ['<script>alert(1)</script>', 'alert(1)'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<a href="javascript:alert(1)">x</a>', 'x'],
    ['<a href=javascript:alert(1)>x</a>', 'x'],
    ["<a href='javascript:alert(1)'>x</a>", 'x'],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', 'x'],
    ['<a href="jav&#x61;script:alert(1)">x</a>', 'x'],
    ['<a href="java&#115;cript:alert(1)">x</a>', 'x'],
    ['<a href="java&Tab;script:alert(1)">x</a>', 'x'],
    ['<a href="&#106;avascript:alert(1)">x</a>', 'x'],
    ['<a href="data:text/html,<script>alert(1)</script>">x</a>', 'x'],
    ['<a href="vbscript:msgbox(1)">x</a>', 'x'],
    ['<a href="//evil.example">x</a>', 'x'],
    ['<a href="">x</a>', 'x'],
    ['<a>x</a>', 'x'],
    ['<a href="page:privacy" onmouseover="alert(3)" class="x">x</a>', '<a href="page:privacy">x</a>'],
    ['<a href="https://ok.example/a?b=1&c=2">x</a>', '<a href="https://ok.example/a?b=1&amp;c=2">x</a>'],
    ['<a href="mailto:info@mammano.ch">m</a> <a href="tel:+41919225024">t</a> <a href="channel:email">c</a> <a href="#noleggio">n</a>', '<a href="mailto:info@mammano.ch">m</a> <a href="tel:+41919225024">t</a> <a href="channel:email">c</a> <a href="#noleggio">n</a>'],
    ['<a href="tel:+41 91 922 50 24">t</a>', 't'],
    ['<p style="x" class="y" id="z">a</p>', '<p>a</p>'],
    ['<iframe src="https://evil.example"></iframe><style>*{}</style><svg onload=alert(1)><math>', '*{}'],
    ['a < b e c > d', 'a &lt; b e c > d'],
    ['<<script>script>alert(1)<</script>/script>', '&lt;script>alert(1)&lt;/script>'],
    ['&lt;script&gt;alert(1)&lt;/script&gt;', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['<b onclick=alert(1)>x</b>', 'x'],
    ['<STRONG>x</STRONG><Em>y</Em>', '<strong>x</strong><em>y</em>'],
    ['riga<br>a<br/>capo<br />', 'riga<br>a<br>capo<br>'],
  ];
  for (const [input, expected] of cases) assert.equal(sanitizeRich(input), expected, input);
});

test('sanificazione: il caso trovato nella revisione (href che ingloba un altro tag) non produce markup', () => {
  const evil = 'href="<a href="<img src=x onerror=alert(1)>">click</a>';
  const out = sanitizeRich(evil);
  assert.doesNotMatch(out, ALLOWED_OUT, out);
  assert.doesNotMatch(out, /<img/i);
});

test('sanificazione (fuzz): mai un "<" fuori dai tag ammessi, mai javascript: in un href, ed è idempotente', () => {
  const parts = ['<', '>', '"', "'", '=', ' ', 'a', 'href', 'script', 'img', 'onerror', 'javascript:', '&#x', '&#106;', ';', '/', 'p', 'strong', '<a ', '</a>', '<p>', 'page:x', '\n', '\t', '`', 'style', 'svg', 'on', 'load', '&amp;'];
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 6000; i++) {
    let s = ''; const n = 1 + Math.floor(rnd() * 24);
    for (let k = 0; k < n; k++) s += parts[Math.floor(rnd() * parts.length)];
    const out = sanitizeRich(s);
    assert.doesNotMatch(out, ALLOWED_OUT, `${JSON.stringify(s)} -> ${JSON.stringify(out)}`);
    for (const m of out.matchAll(/<a href="([^"]*)">/g)) assert.match(m[1].replace(/&amp;/g, '&'), HREF_OK, `${JSON.stringify(s)} -> ${out}`);
    assert.equal(sanitizeRich(out), out, `non idempotente: ${JSON.stringify(s)}`);
  }
});

test('sanificazione: i contenuti veri del sito passano invariati (stesso DOM)', () => {
  const strings = [];
  const walk = (n) => { if (typeof n === 'string') { if (n.includes('<')) strings.push(n); } else if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') Object.values(n).forEach(walk); };
  const d = base(); walk(d.site); walk(d.shared); d.pages.forEach(walk);
  assert.ok(strings.length >= 8, `testi con markup: ${strings.length}`);
  const norm = (s) => s.replace(/<br ?\/?>/g, '<br>');
  for (const s of strings) assert.equal(sanitizeRich(s), norm(s), s.slice(0, 80));
});

test('sanificazione: tempi lineari su input ostili', () => {
  const t0 = Date.now();
  for (const s of ['<a '.repeat(50_000), '<a ' + 'a '.repeat(100_000), '<'.repeat(200_000), '<a href="' + 'x'.repeat(300_000), '<p ' + 'a=b '.repeat(50_000) + '>', ' '.repeat(300_000) + '<']) sanitizeRich(s);
  assert.ok(Date.now() - t0 < 2000, `troppo lento: ${Date.now() - t0} ms`);
});

// ---- schema e controlli sul server -----------------------------------------------------------------------------------------------

const withBlock = (block) => { const d = base(); d.pages.find((p) => p.key === 'privacy').blocks[1] = { id: 'privacy-2-rich-text', type: 'rich-text', surface: 'light', ...block }; return d; };
const errorsOf = (d) => validateData(d).errors;

test('schema: link javascript: e attributi extra nei testi ricchi sono errori', () => {
  assert.deepEqual(errorsOf(withBlock({ content: { it: '<p>ok <a href="page:cookie">c</a> <a href="https://x.example/">e</a></p>' } })), []);
  for (const bad of ['<a href="javascript:alert(1)">x</a>', '<a href="data:text/html,x">x</a>', '<a href="//evil.example">x</a>', '<a href="page:x" onclick="y">x</a>', '<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<a href="x"y">z</a>', '<a href="<b>">z</a>']) {
    assert.ok(errorsOf(withBlock({ content: { it: bad } })).length, bad);
  }
});

test('schema: indirizzi dei link, percorsi delle immagini e indirizzo del sito', () => {
  const linkPage = (url) => { const d = base(); d.pages[0].blocks.find((b) => b.type === 'cta' || b.buttons).buttons = [{ label: { it: 'x' }, link: { type: 'url', url }, style: 'primary' }]; return d; };
  const cta = base().pages.flatMap((p) => p.blocks).find((b) => b.type === 'cta');
  assert.ok(cta, 'serve un blocco con pulsanti per la prova');
  const withUrl = (url) => { const d = base(); const b = d.pages.flatMap((p) => p.blocks).find((x) => x.type === 'cta'); b.buttons = [{ label: { it: 'x' }, link: { type: 'url', url }, style: 'primary' }]; return d; };
  assert.deepEqual(errorsOf(withUrl('https://www.google.com/maps')), []);
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', '//evil.example', 'ftp://x.example', 'https://a b.example']) assert.ok(errorsOf(withUrl(bad)).length, bad);
  for (const bad of ['../../etc/passwd', '/etc/passwd', 'a/../../b.jpg', 'a//b.jpg', '.hidden', 'uploads/../../x.webp']) {
    const d = base(); d.pages[0].blocks.find((b) => b.image).image.src = bad;
    assert.ok(errorsOf(d).length, bad);
  }
  for (const bad of ['javascript:alert(1)', 'https://x.example/', 'https://x.example/"><script>', 'ftp://x.example', 'https://a b.example']) {
    const d = base(); d.site.siteUrl = bad; assert.ok(errorsOf(d).length, bad);
  }
  for (const key of ['logoImage', 'image']) { const d = base(); d.site.company[key] = '../../.env'; assert.ok(errorsOf(d).length, key); }
  const d = base(); d.site.seo.favicon = '../x.png'; assert.ok(errorsOf(d).length, 'favicon');
});

test('validazione: la ricerca dei segnaposto non è quadratica', () => {
  const d = base(); d.pages.find((p) => p.key === 'privacy').blocks[1].content.it = '[DA COMPLETARE '.repeat(12_000);
  const t0 = Date.now(); validateData(d);
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
});

test('controllo lato server: HTML non ammesso nei testi, anche annidato o in campi qualsiasi', () => {
  const ok = base().pages.find((p) => p.key === 'privacy');
  assert.equal(unsafeText(ok), null, 'i contenuti veri passano');
  for (const p of base().pages) assert.equal(unsafeText(p), null, p.key);
  assert.equal(unsafeText(base().site), null);
  assert.equal(unsafeText({ a: [{ b: { c: '<img src=x onerror=alert(1)>' } }] }), '/a/0/b/c');
  assert.equal(unsafeText({ t: 'a <script>x</script>' }), '/t');
  assert.equal(unsafeText({ t: '<a href="javascript:x">y</a>' }), '/t');
  assert.equal(unsafeText({ t: 'nessun tag, solo testo & entità &lt;' }), null);
  let deep = 'x'; for (let i = 0; i < 100; i++) deep = { d: deep };
  assert.ok(unsafeText(deep) !== null, 'un annidamento assurdo si rifiuta invece di consumare lo stack');
});

test('controllo lato server: destinatari e oggetto dei moduli solo da un admin', () => {
  const form = (delivery, id = 'f1') => ({ id, type: 'form', delivery });
  const old = { key: 'p', blocks: [form({ recipients: ['a@x.ch'], subject: 'S' })] };
  assert.equal(deliveryProblem('page', structuredClone(old), old), null, 'invariato');
  assert.match(deliveryProblem('page', { key: 'p', blocks: [form({ recipients: ['evil@x.ch'], subject: 'S' })] }, old), /destinatari/);
  assert.match(deliveryProblem('page', { key: 'p', blocks: [form({ recipients: ['a@x.ch'], subject: 'Altro' })] }, old), /destinatari/);
  assert.match(deliveryProblem('page', { key: 'p', blocks: [...old.blocks, form({ recipients: ['evil@x.ch'], subject: 'S' }, 'f2')] }, old), /aggiungere un modulo/);
  assert.equal(deliveryProblem('page', { key: 'p', blocks: [] }, old), null, 'togliere un modulo non espone dati');
  const shared = { m: form({ recipients: ['a@x.ch'], subject: 'S' }) };
  assert.match(deliveryProblem('shared', { m: form({ recipients: ['evil@x.ch'], subject: 'S' }) }, shared), /destinatari/);
  assert.match(deliveryProblem('page', { key: 'p', blocks: [form({ recipients: ['a@x.ch'], subject: 'S' })] }, undefined), /aggiungere un modulo/);
});

// ---- percorsi, riferimenti e uscita ---------------------------------------------------------------------------------------------------

test('build: nessuno slug o percorso può far scrivere fuori dalla cartella del sito', async () => {
  const root = tmp(); const out = path.join(root, 'dist');
  const d = base();
  d.pages.push({ key: 'genitore', status: 'draft', slug: { it: '../../../../evil' }, name: { it: 'G' }, title: { it: 'G' }, description: { it: 'G' }, blocks: [] });
  d.pages.find((p) => p.key === 'privacy').parent = 'genitore';
  d.pages.find((p) => p.key === 'cookie').slug = { it: '..' };
  const ctx = createContext({ ...d, root: ROOT, meta: null }, 'it');
  for (const p of d.pages) assert.doesNotMatch(ctx.pathOf(p.key), /\.\./, `${p.key}: ${ctx.pathOf(p.key)}`);
  try { await buildSite(d, { outDir: out, assetsDir: path.join(TPL, 'assets') }); } catch (e) { assert.ok(e instanceof BuildError, e.message); }
  const escaped = fs.readdirSync(root).filter((n) => n !== 'dist');
  assert.deepEqual(escaped, [], 'nulla scritto accanto a dist/');
});

test('build: un riferimento a un blocco condiviso inesistente (o "constructor") è un errore, non un crollo', async () => {
  for (const ref of ['constructor', '__proto__', 'toString', 'non-esiste']) {
    const d = base(); d.pages.find((p) => p.key === 'privacy').blocks.push({ id: 'x-shared', type: 'shared', ref });
    await assert.rejects(buildSite(d, { outDir: path.join(tmp(), 'dist'), assetsDir: path.join(TPL, 'assets') }), (e) => e instanceof BuildError, ref);
  }
});

test('render: canale sconosciuto o link javascript: non fanno crollare la pagina né producono indirizzi pericolosi', async () => {
  const d = base();
  d.pages.find((p) => p.key === 'privacy').blocks[1].content.it = '<p><a href="channel:sconosciuto">x</a> <a href="page:non-esiste">y</a></p>';
  const out = path.join(tmp(), 'dist');
  await buildSite(d, { outDir: out, assetsDir: path.join(TPL, 'assets') });
  const html = fs.readFileSync(path.join(out, 'privacy/index.html'), 'utf8');
  assert.doesNotMatch(html, /javascript:/i);
  const ctx = createContext({ ...base(), root: ROOT, meta: null }, 'it');
  assert.equal(ctx.link({ type: 'url', url: 'javascript:alert(1)' }), '#');
  assert.equal(ctx.link({ type: 'url', url: 'https://ok.example/' }), 'https://ok.example/');
  assert.equal(ctx.rich({ it: '<img src=x onerror=alert(1)><script>alert(2)</script>' }).toString(), 'alert(2)');
});

test('sitemap: gli indirizzi sono escapati per XML', async () => {
  const d = base(); d.site.siteUrl = 'https://www.mammano.ch/?a=1&b=2';
  const out = path.join(tmp(), 'dist');
  await buildSite(d, { outDir: out, assetsDir: path.join(TPL, 'assets') });
  const xml = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(xml, /a=1&amp;b=2/);
  assert.doesNotMatch(xml, /a=1&b=2/);
});

test('modulo: un textarea di soli spazi (o di spazi e a capo) non blocca il server', () => {
  const block = { fields: [{ name: 'messaggio', type: 'textarea', label: { it: 'M' }, required: false }, { name: 'nome', type: 'text', label: { it: 'N' }, required: true }] };
  const t0 = Date.now();
  for (const raw of [' '.repeat(32_000), ' \n'.repeat(16_000), '\t'.repeat(32_000), ('a' + ' '.repeat(50) + '\n').repeat(500)]) validateSubmission(block, { nome: 'x', messaggio: raw });
  assert.ok(Date.now() - t0 < 300, `${Date.now() - t0} ms`);
  assert.ok(validateSubmission(block, { nome: 'x', messaggio: 'a'.repeat(25_000) }).errors.messaggio, 'oltre il limite: rifiutato prima di elaborarlo');
});

// ---- anteprima, script del sito, configurazione ------------------------------------------------------------------------------------------

test('anteprima: nessuno script inline (la CSP dell\'admin li vieta), il codice sta in un file esterno', () => {
  const html = toPreviewHtml('<!doctype html><html><head><link rel="stylesheet" href="/assets/css/tokens.css"><link rel="stylesheet" href="/assets/css/fonts.css"></head><body><p>x</p></body></html>', loadData(TPL).tokens, { intercept: true });
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => !/type="application\/ld\+json"/.test(m[0]));
  assert.deepEqual(inline.map((m) => m[0].slice(0, 60)), []);
  assert.match(html, /<script src="\/cms-preview\.js" data-intercept><\/script>/);
  const js = read('public/cms-preview.js');
  assert.match(js, /e\.source !== window\.parent/, 'i messaggi si accettano solo dalla finestra che contiene l\'anteprima');
  // l'anteprima ha origine opaca: l'editor riconosce chi scrive dalla finestra
  for (const f of ['app/admin/(shell)/_editor/DocEditor.jsx', 'app/admin/(shell)/style/StyleEditor.jsx']) {
    const src = read(f);
    assert.match(src, /sandbox="allow-scripts"/, `${f}: l'iframe dell'anteprima ha il sandbox`);
    assert.doesNotMatch(src, /allow-same-origin/, `${f}: niente allow-same-origin`);
  }
  assert.match(read('app/admin/(shell)/_editor/DocEditor.jsx'), /e\.source !== frame\.current\.contentWindow/);
});

test('sito pubblico: fx.js non trasforma testo del contenuto in markup (innerHTML con dati)', () => {
  const js = read('templates/mammano/assets/js/fx.js');
  const dynamic = [...js.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1]).filter((v) => /\$\{|\+/.test(v));
  assert.deepEqual(dynamic, [], 'innerHTML con valori interpolati');
});

test('CSP dell\'admin: nonce per richiesta, niente unsafe-eval né unsafe-inline negli script, niente frame di altri siti', () => {
  const src = read('middleware.js');
  assert.match(src, /const DEV = process\.env\.NODE_ENV === 'development'/, 'l\'eccezione per lo sviluppo si attiva solo con NODE_ENV=development');
  const script = src.match(/`script-src ([^`]+)`/)[1].replace(/\$\{DEV \? " 'unsafe-eval'" : ''\}/, '');   // 'unsafe-eval' solo con `next dev` (refresh automatico)
  assert.match(script, /'nonce-\$\{nonce\}'/);
  assert.doesNotMatch(script, /unsafe-eval|unsafe-inline|\*|https?:/);
  for (const need of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "default-src 'self'"]) assert.ok(src.includes(need), need);
  assert.match(src, /crypto\.randomUUID\(\)/);
});

test('intestazioni: admin e API ne hanno di sicurezza; HSTS solo se l\'app è in https', () => {
  const src = read('next.config.mjs');
  for (const k of ['X-Content-Type-Options', 'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'Referrer-Policy']) assert.ok(src.includes(k), k);
  assert.match(src, /source: '\/api\/:path\*'/);
  assert.match(src, /https \? \[/);
});

test('dipendenze e repository: ajv serve a runtime, le varianti di .env non si versionano, gli script distruttivi controllano il database', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const d of ['ajv', 'ajv-formats', 'mysql2', 'next', 'sharp', 'nodemailer']) assert.ok(pkg.dependencies[d], `${d} in dependencies`);
  assert.equal(pkg.devDependencies.ajv, undefined);
  const ignore = read('.gitignore');
  assert.match(ignore, /^\.env$/m); assert.match(ignore, /^\.env\.\*$/m); assert.match(ignore, /^!\.env\.example$/m);
  for (const f of ['e2e-admin', 'e2e-editor', 'e2e-media', 'e2e-forms', 'probe-security']) assert.match(read(`scripts/${f}.mjs`), /assertLocalDatabase/, f);
  assert.match(read('scripts/db-seed.mjs'), /if \(force\) assertLocalDatabase/);
});

test('server locale: non serve file fuori dalla cartella del sito', () => {
  const src = read('scripts/serve.mjs');
  assert.match(src, /startsWith\(base \+ path\.sep\)/);
  assert.match(src, /listen\(port, '127\.0\.0\.1'/);
});

test('anteprima isolata: il documento ha il sandbox anche se aperto da solo, i file del template sono pubblici e le immagini caricate hanno un token', () => {
  const mw = read('middleware.js');
  assert.match(mw, /sandbox allow-scripts/);
  assert.match(mw, /pathname\.startsWith\('\/admin\/preview-assets\/'\)\) return withPolicy/);
  assert.match(mw, /ADMIN_HOSTS/);
  const route = read('app/admin/preview-assets/[...path]/route.js');
  assert.match(route, /verifyPreviewToken/);
  assert.match(route, /if \(parts\[0\] === 'img'\)/);
});
