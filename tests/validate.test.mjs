import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadData } from '../render/context.mjs';
import { validateData } from '../schema/validate.mjs';

const ROOT = fileURLToPath(new URL('../templates/starter', import.meta.url));
const load = () => structuredClone(loadData(ROOT));   // una copia: ogni prova la guasta a modo suo
const byKey = (d, k) => d.pages.find((p) => p.key === k);

test('contenuti reali: nessun errore', () => assert.deepEqual(validateData(load()).errors, []));

test('gli errori hanno percorso e messaggio in italiano', () => {
  const d = load();
  delete byKey(d, 'moduli-interni').blocks[1].image.alt;   // la copertina con immagine
  const { issues } = validateData(d);
  const i = issues.find((x) => x.path === '/blocks/1/image/alt');
  assert.ok(i, 'il percorso deve puntare al campo mancante');
  assert.deepEqual([i.doc, i.message, i.severity], ['page:moduli-interni', 'Campo obbligatorio', 'error']);
});

test('una pagina in bozza incompleta non blocca: i suoi problemi sono avvisi', () => {
  const d = load();
  d.pages.push({ key: 'nuova', status: 'draft', slug: { it: 'nuova' }, name: { it: 'Nuova' }, title: { it: '' }, description: { it: '' }, blocks: [{ id: 'nuova-1', type: 'hero', surface: 'dark', title: { it: '' }, buttons: [] }] });
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
  byKey(d, 'contatti').parent = 'moduli';
  byKey(d, 'moduli').parent = 'contatti';   // ciascuna è padre dell'altra
  const r = validateData(d);
  assert.ok(r.errors.some((e) => /ciclo/.test(e)));
});

test('due pagine pubblicate con lo stesso indirizzo: errore', () => {
  const d = load();
  byKey(d, 'contatti').slug.it = 'moduli';
  assert.ok(validateData(d).errors.some((e) => /già usato/.test(e)));
});

test('manca la home: errore; link a pagina in bozza: avviso', () => {
  const d = load();
  byKey(d, 'contatti').status = 'draft';
  const r = validateData(d);
  assert.ok(r.warnings.some((w) => /in bozza/.test(w)), 'la home ha un pulsante che punta a una pagina in bozza');
  d.pages = d.pages.filter((p) => p.key !== 'home');
  assert.ok(validateData(d).errors.some((e) => /home/.test(e)));
});

test('documenti malformati non fanno crashare la validazione', () => {
  const d = load();
  byKey(d, 'moduli').blocks = 'non un array';
  byKey(d, 'contatti').blocks = [null, 5, { id: 'x' }];
  assert.doesNotThrow(() => validateData(d));
});
