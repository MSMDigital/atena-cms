// Schemi del template attivo + validatori (Ajv). Le definizioni pure stanno in definitions.mjs; qui si compongono con il template.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { buildSchemas } from './definitions.mjs';
import { requireTemplate } from '../lib/template.mjs';

export * from './definitions.mjs';

const schemasCache = new WeakMap();
const validatorsCache = new WeakMap();

// Schemi composti (motore + template). Con la cache: cambiano solo se cambia il template.
export function schemasFor(tpl = requireTemplate()) {
  if (!schemasCache.has(tpl)) schemasCache.set(tpl, buildSchemas(tpl));
  return schemasCache.get(tpl);
}

export function createValidators(schemas) {
  const { allSchemas, blocks, page, shared, site, headers, footers, post, categories, tags } = schemas;
  const ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: true, strictTypes: false, strictRequired: false });
  addFormats(ajv);
  ajv.addVocabulary(['x-widget', 'x-when', 'x-item']);
  for (const s of allSchemas) ajv.addSchema(s);
  const get = (s) => ajv.getSchema(s.$id);
  return { ajv, page: get(page), shared: get(shared), site: get(site), post: post && get(post), categories: categories && get(categories), tags: tags && get(tags), headers: headers && get(headers), footers: footers && get(footers), block: Object.fromEntries(blocks.map((b) => [b.$id.split('/').pop().replace('.json', ''), get(b)])) };
}

export function validatorsFor(tpl = requireTemplate()) {
  if (!validatorsCache.has(tpl)) validatorsCache.set(tpl, createValidators(schemasFor(tpl)));
  return validatorsCache.get(tpl);
}
