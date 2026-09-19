import test from 'node:test';
import assert from 'node:assert/strict';
import { findPageRefs } from '../lib/refs.mjs';

const docs = [
  { kind: 'site', key: 'main', data: { nav: [{ link: { type: 'page', page: 'servizi' } }], footer: { legal: [{ link: { type: 'page', page: 'privacy' } }] } } },
  { kind: 'page', key: 'home', data: { key: 'home', blocks: [{ lead: { it: 'vedi <a href="page:servizi#noleggio">noleggio</a>' } }] } },
  { kind: 'page', key: 'privati', data: { key: 'privati', parent: 'servizi', blocks: [] } },
  { kind: 'page', key: 'servizi', data: { key: 'servizi', blocks: [{ link: { type: 'page', page: 'servizi' } }] } },
];

test('trova link nei dati, nei testi ricchi e le pagine figlie; ignora la pagina stessa', () => {
  const r = findPageRefs(docs, 'servizi');
  assert.deepEqual(r.map((x) => `${x.kind}:${x.key}:${x.why}`).sort(), ['page:home:link nel testo', 'page:privati:pagina figlia', 'site:main:link']);
});

test('una pagina non citata non ha riferimenti', () => assert.deepEqual(findPageRefs(docs, 'privati').filter((x) => x.kind !== 'page' || x.key !== 'privati'), []));
