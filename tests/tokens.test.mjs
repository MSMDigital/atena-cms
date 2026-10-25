import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tokensToCss, validateTokens, fluid, fontSpec } from '../render/tokens.mjs';

const tokens = JSON.parse(fs.readFileSync(new URL('../templates/starter/tokens.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(tokens);

test('il CSS generato riflette i token del template, sempre uguale a sé stesso', () => {
  const css = tokensToCss(tokens);
  assert.equal(css, tokensToCss(structuredClone(tokens)), 'stessi token, stesso CSS');
  assert.match(css, /^\/\* GENERATO .*\*\/\n\n:root \{/);
  assert.ok(css.includes(`--c-brand: ${tokens.colors.brand};`));
  assert.ok(css.includes(`--c-brand-tint: ${tokens.colors.brandTint};`));
  for (const h of ['h1', 'h2', 'h3', 'h4']) assert.ok(css.includes(`--fs-${h}: clamp(`), `manca la dimensione di ${h}`);
});

test('i token del sito sono validi', () => assert.deepEqual(validateTokens(tokens), []));

test('errori leggibili su token rotti', () => {
  const t = clone();
  t.colors.brand = 'blu';
  t.buttons.effect = 'bounce';
  t.typography.scale.h1.size = [50, 20];
  t.typography.scale.h2.max = 5;
  const e = validateTokens(t);
  assert.ok(e.some((x) => x.startsWith('colors.brand')));
  assert.ok(e.some((x) => x.startsWith('buttons.effect')));
  assert.ok(e.some((x) => x.startsWith('typography.scale.h2')), 'il tetto deve essere >= delle dimensioni');
});

test('dimensione fluida: mobile e desktop agli estremi, tetto oltre 1440', () => {
  const range = { from: 390, to: 1440 };
  const css = fluid({ size: [20, 40], max: 50 }, range);
  assert.match(css, /^clamp\(1\.25rem, [\d.]+rem \+ [\d.]+vw, 3\.125rem\)$/);
  assert.equal(fluid({ size: [17, 17] }, range), '1.0625rem');
});

test('font: famiglie, pesi e sottoinsiemi', () => {
  const s = fontSpec(tokens);
  assert.deepEqual(s.families, ['Raleway']);
  assert.equal(s.wMin, 300);
  assert.equal(s.wMax, 700);
});

test('nessuna iniezione CSS: i valori con caratteri pericolosi vengono rifiutati', () => {
  const attempts = [
    (t) => { t.buttons.radius = '0; } body { display: none } .x {'; },
    (t) => { t.layout.gutter = '1rem; } * { display:none'; },
    (t) => { t.layout.section = 'url(https://evil.example/x)'; },
    (t) => { t.typography.fonts.body = 'Raleway"; } body { color: red'; },
    (t) => { t.typography.fonts.fallback = 'sans-serif; } a{'; },
    (t) => { t.typography.scale.h1.tracking = '0em; color: red'; },
    (t) => { t.colors.brand = 'red; } body { display:none'; },
    (t) => { t.surfaces.light.bg = '@altro'; },
  ];
  for (const attempt of attempts) {
    const t = clone(); attempt(t);
    assert.ok(validateTokens(t).length > 0, 'deve essere rifiutato: ' + JSON.stringify(attempt.toString()));
  }
});
