// Header e footer scorporati: scelta per pagina, validazione, riferimenti inesistenti.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, loadData } from '../render/context.mjs';
import { validateData } from '../schema/validate.mjs';
import { loadTemplateFrom } from '../lib/template.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tpl = loadTemplateFrom(path.join(ROOT, 'templates/starter'));
const data = () => structuredClone(loadData(tpl.dir));

test('ctx.layout: «default» se la pagina non sceglie, quello scelto, null con «none», undefined se il sito non li scorpora', () => {
  const d = data();
  const ctx = createContext(d, 'it');
  const home = d.pages.find((p) => p.key === 'home');
  assert.equal(ctx.layout('header', home), d.headers.default);
  assert.equal(ctx.layout('header', { ...home, header: 'minimale' }), d.headers.minimale);
  assert.equal(ctx.layout('footer', { ...home, footer: 'none' }), null);
  assert.equal(ctx.layout('header', { ...home, header: 'inesistente' }), d.headers.default);   // fallback: la validazione lo segnala a parte
  delete d.headers.default;
  assert.equal(createContext(d, 'it').layout('header', home), d.headers.minimale, 'senza «default» vale il primo');
  const old = data(); delete old.headers; delete old.footers;
  assert.equal(createContext(old, 'it').layout('header', home), undefined);
});

test('validazione: una pagina non può scegliere un header o un footer che non esiste («none» sì)', () => {
  const d = data();
  const v = () => validateData(d, tpl);
  assert.deepEqual(v().errors, []);
  d.pages[0].header = 'nuovo'; d.pages[0].footer = 'none';
  assert.match(v().errors.join('\n'), /Il header "nuovo" non esiste/);
  d.headers.nuovo = { brandName: 'X', nav: [] };
  assert.deepEqual(v().errors, []);
});

test('validazione: header e footer seguono lo schema del template e i loro link si controllano', () => {
  const d = data();
  d.headers.rotto = { nav: [] };                                           // manca brandName
  d.footers.rotto = { text: { it: 'x' }, legal: [{ label: { it: 'Privacy' }, link: { type: 'page', page: 'non-esiste' } }] };
  const r = validateData(d, tpl);
  assert.ok(r.errors.some((e) => /headers\.json\/rotto\/brandName: Campo obbligatorio/.test(e)), r.errors.join('|'));
  assert.ok(r.warnings.some((w) => /footers\.json\/rotto\/legal\/0\/link.*non esiste/.test(w)), r.warnings.join('|'));
});

test('menu a hamburger: sotto una larghezza (con la sua @media), sempre, mai, e niente pulsante senza voci di menu', async () => {
  const { buildSite } = await import('../render/build.mjs');
  const { stopRenderers } = await import('../render/host.mjs');
  const fs = await import('node:fs'); const os = await import('node:os');
  const home = async (patch) => {
    const d = data(); patch(d.headers.default);
    assert.deepEqual(validateData(d, tpl).errors, []);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-burger-')), 'dist');
    await buildSite(d, { outDir: out, assetsDir: path.join(tpl.dir, 'assets'), template: tpl });
    return fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  };
  const bp = await home((h) => { h.mobileMenu = { mode: 'breakpoint', breakpoint: 1024 }; });
  assert.match(bp, /@media \(max-width: 1024px\) \{ \.sh-bp-1024 \.menu-toggle/);
  assert.match(bp, /class="site-header[^"]*sh-bp-1024/);
  const always = await home((h) => { h.mobileMenu = { mode: 'always' }; });
  assert.match(always, /class="site-header[^"]*is-burger/);
  assert.doesNotMatch(always, /@media \(max-width: \d+px\) \{ \.sh-bp/);
  const never = await home((h) => { h.mobileMenu = { mode: 'never' }; });
  assert.doesNotMatch(never, /menu-toggle"/);
  const empty = await home((h) => { h.nav = []; h.mobileMenu = { mode: 'always' }; });
  assert.doesNotMatch(empty, /menu-toggle"/, 'senza voci non serve l\'hamburger');
  const bad = data(); bad.headers.default.mobileMenu = { mode: 'breakpoint', breakpoint: 100 };
  assert.match(validateData(bad, tpl).errors.join('\n'), /mobileMenu\/breakpoint/);
  stopRenderers();
});
