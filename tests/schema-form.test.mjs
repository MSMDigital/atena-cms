import test from 'node:test';
import assert from 'node:assert/strict';
import { schemasFor, createValidators } from '../schema/index.mjs';
import { requireTemplate } from '../lib/template.mjs';

const { allSchemas, blocks, page, shared, site } = schemasFor(requireTemplate());
import { createModel, isVisible, summarize, newId, collectIds } from '../lib/schema-form.mjs';

const model = createModel(allSchemas);

// Visita tutto lo schema come farebbe il form: se c'è un costrutto non supportato, lancia.
function analyze(schema, where, seen = { n: 0 }) {
  const { kind, s } = model.kindOf(schema);
  seen.n++;
  if (kind === 'object') for (const [k, p] of Object.entries(s.properties)) analyze(p, `${where}.${k}`, seen);
  else if (kind === 'array') {
    // gli elementi di un elenco devono essere di un tipo che il form sa mostrare (riga semplice o scheda)
    const itemKind = model.kindOf(s.items).kind;
    assert.ok(['i18n', 'string', 'enum', 'number', 'boolean', 'object', 'union'].includes(itemKind), `${where}: elenco di elementi "${itemKind}" non gestito dal form`);
    analyze(s.items, `${where}[]`, seen);
  }
  else if (kind === 'map') analyze(s.additionalProperties, `${where}{}`, seen);
  else if (kind === 'union') for (const v of model.variantsOf(schema)) analyze(v.schema, `${where}<${v.value}>`, seen);
  return seen.n;
}

test('il form sa disegnare ogni nodo di pagina, dati del sito, blocchi condivisi e tutti i blocchi', () => {
  for (const [name, schema] of [['page', page], ['shared', shared], ['site', site], ...blocks.map((b) => [b.$id.split('/').pop(), b])]) {
    assert.ok(analyze(schema, name) > 3, name);
  }
});

test('ogni blocco ha una variante nell\'elenco dei blocchi e un titolo', () => {
  const variants = model.variantsOf(page.properties.blocks.items);
  const types = variants.map((v) => v.value);
  for (const b of blocks) assert.ok(types.includes(b.properties.type.const), `manca ${b.properties.type.const}`);
  assert.ok(types.includes('shared'));
  assert.ok(variants.every((v) => v.title || v.value === 'shared'), 'ogni blocco deve avere un titolo per il menu');
});

// Riempie i testi vuoti come farebbe chi compila il form.
const fill = (node, key = '') => {
  if (node === '') return key === 'recipients' || key === 'email' ? 'a@b.ch' : key === 'src' ? 'x.jpg' : key === 'url' ? 'https://x.example' : 'x';
  if (Array.isArray(node)) return node.map((n) => fill(n, key));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, k)]));
  return node;
};

test('il valore iniziale di ogni blocco è valido una volta compilati i testi obbligatori', () => {
  const v = createValidators(schemasFor(requireTemplate()));
  for (const variant of model.variantsOf(page.properties.blocks.items)) {
    if (variant.value === 'shared') continue;
    let n = 0;
    const value = model.defaultValue(variant.schema, () => `${variant.value}-${++n}`);
    assert.equal(value.type, variant.value);
    const filled = fill(value);
    const validate = v.block[variant.value];
    assert.ok(validate(filled), `${variant.value}: ${JSON.stringify(validate.errors?.slice(0, 2))} su ${JSON.stringify(filled).slice(0, 200)}`);
  }
});

test('x-when: il campo si mostra solo per gli aspetti pertinenti', () => {
  const columns = { 'x-when': { layout: ['points', 'cards'] } };
  assert.equal(isVisible(columns, [{ layout: 'points' }]), true);
  assert.equal(isVisible(columns, [{ layout: 'rows' }]), false);
  assert.equal(isVisible({}, []), true, 'senza condizioni si mostra sempre');
  // dentro un elemento di lista la condizione guarda l'oggetto più vicino che ha `layout`
  const item = { 'x-when': { layout: ['cards'] } };
  assert.equal(isVisible(item, [{ layout: 'cards', items: [] }, [], { title: 'x' }]), true);
  assert.equal(isVisible(item, [{ layout: 'steps', items: [] }, [], { title: 'x' }]), false);
  assert.equal(isVisible(item, [{ title: 'senza layout' }]), true, 'se non c\'è il campo di riferimento non si nasconde');
});

test('gli schemi usano x-when solo dove serve (items, zones, form)', () => {
  const items = blocks.find((b) => b.$id.endsWith('/items.json'));
  assert.deepEqual(items.properties.columns['x-when'].layout, ['points', 'cards']);
  assert.deepEqual(items.properties.items.items.properties.previewImage['x-when'].layout, ['rows']);
});

test('riassunto di un elemento: prende il primo testo significativo, senza tag', () => {
  assert.equal(summarize({ title: { it: 'Traslochi privati' } }), 'Traslochi privati');
  assert.equal(summarize({ header: { title: { it: 'Titolo' } } }), 'Titolo');
  assert.equal(summarize({ lead: { it: 'Un <strong>testo</strong> lungo' } }), 'Un testo lungo');
  assert.equal(summarize({ it: 'Nastro' }), 'Nastro');
  assert.equal(summarize({ x: 1 }), '');
  assert.equal(summarize({ title: { it: 'a'.repeat(100) } }).length, 70);
});

test('id dei blocchi: univoci e validi', () => {
  const taken = new Set();
  for (let i = 0; i < 200; i++) { const id = newId('page-intro', taken); assert.match(id, /^[a-z0-9][a-z0-9_-]{1,63}$/); assert.ok(!taken.has(id)); taken.add(id); }
  assert.deepEqual([...collectIds({ blocks: [{ id: 'a', type: 'x' }, { id: 'b', type: 'y', items: [{ id: 'nope' }] }] })].sort(), ['a', 'b']);
});
