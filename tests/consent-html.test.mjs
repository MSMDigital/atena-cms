import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeInlineHtml } from '../render/sanitize.mjs';

test('HTML libero del consenso: classi, title, target sui link', () => {
  const out = sanitizeInlineHtml('Accetto la <a href="page:privacy" class="privacy link" title="Informativa" target="_blank">privacy</a> <span class="req" title="Obbligatorio">*</span>');
  assert.equal(out, 'Accetto la <a href="page:privacy" class="privacy link" title="Informativa" target="_blank" rel="noopener noreferrer">privacy</a> <span class="req" title="Obbligatorio">*</span>');
});

test('HTML libero del consenso: niente script, handler, style, javascript:', () => {
  const out = sanitizeInlineHtml('<script>x</script><a href="javascript:alert(1)" onclick="x()" class="a">t</a><span style="color:red" onmouseover="x()" id="i">s</span><img src=x onerror=y>');
  assert.equal(out, 'xt<span>s</span>');   // il testo dentro <script> resta testo innocuo, come in sanitizeRich
});

test('HTML libero del consenso: chiude i tag lasciati aperti', () => {
  assert.equal(sanitizeInlineHtml('<strong>a<em>b'), '<strong>a<em>b</em></strong>');
});

import { unsafeText, allowedCode } from '../lib/content-guard.mjs';

test('guard: l\'HTML libero del consenso passa solo nel campo html dei campi del modulo', () => {
  const doc = { blocks: [{ type: 'form', fields: [{ type: 'consent', label: { it: 'x' }, html: { it: 'Letto l\'<a href="https://x.it" class="iubenda-white iubenda-embed">privacy</a>' } }] }] };
  assert.equal(unsafeText(doc, allowedCode('page')), null);
  doc.blocks[0].fields[0].label = { it: '<span onclick="x()">p</span>' };
  assert.equal(unsafeText(doc, allowedCode('page')), '/blocks/0/fields/0/label/it');
});
