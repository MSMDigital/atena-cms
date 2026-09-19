import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateData } from '../schema/validate.mjs';

const read = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const load = () => ({
  site: read('templates/mammano/content/site.json'),
  shared: read('templates/mammano/content/shared.json'),
  pages: fs.readdirSync(new URL('../templates/mammano/content/pages', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => read('templates/mammano/content/pages/' + f)),
});
const byKey = (d, k) => d.pages.find((p) => p.key === k);

test('contenuti reali: nessun errore', () => assert.deepEqual(validateData(load()).errors, []));

test('gli errori hanno percorso e messaggio in italiano', () => {
  const d = load();
  delete byKey(d, 'home').blocks[0].image.alt;
  const { issues } = validateData(d);
  const i = issues.find((x) => x.path === '/blocks/0/image/alt');
  assert.ok(i, 'il percorso deve puntare al campo mancante');
  assert.deepEqual([i.doc, i.message, i.severity], ['page:home', 'Campo obbligatorio', 'error']);
});

test('una pagina in bozza incompleta non blocca: i suoi problemi sono avvisi', () => {
  const d = load();
  d.pages.push({ key: 'nuova', status: 'draft', slug: { it: 'nuova' }, name: { it: 'Nuova' }, title: { it: '' }, description: { it: '' }, blocks: [{ id: 'nuova-1', type: 'cta', surface: 'dark', title: { it: '' }, buttons: [] }] });
  const r = validateData(d);
  assert.deepEqual(r.errors, []);
  assert.ok(r.issues.some((i) => i.doc === 'page:nuova' && i.severity === 'warning' && i.path === '/title/it'));
});

test('la stessa pagina, se pubblicata, produce errori', () => {
  const d = load();
  d.pages.push({ key: 'nuova', status: 'published', slug: { it: 'nuova' }, name: { it: 'Nuova' }, title: { it: '' }, description: { it: 'x' }, blocks: [] });
  assert.ok(validateData(d).errors.some((e) => e.startsWith('nuova.json/title/it')));
});

test('ciclo tra pagine padre: errore, senza bloccarsi', () => {
  const d = load();
  byKey(d, 'servizi').parent = 'traslochi-privati';   // privati ha già servizi come padre
  const r = validateData(d);
  assert.ok(r.errors.some((e) => /ciclo/.test(e)));
});

test('due pagine pubblicate con lo stesso indirizzo: errore', () => {
  const d = load();
  byKey(d, 'contatti').slug.it = 'chi-siamo';
  assert.ok(validateData(d).errors.some((e) => /già usato/.test(e)));
});

test('manca la home: errore; link a pagina in bozza: avviso', () => {
  const d = load();
  byKey(d, 'chi-siamo').status = 'draft';
  const r = validateData(d);
  assert.ok(r.warnings.some((w) => /in bozza/.test(w)), 'il menu punta a una pagina in bozza');
  d.pages = d.pages.filter((p) => p.key !== 'home');
  assert.ok(validateData(d).errors.some((e) => /home/.test(e)));
});

test('documenti malformati non fanno crashare la validazione', () => {
  const d = load();
  byKey(d, 'servizi').blocks = 'non un array';
  byKey(d, 'contatti').blocks = [null, 5, { id: 'x' }];
  assert.doesNotThrow(() => validateData(d));
});
