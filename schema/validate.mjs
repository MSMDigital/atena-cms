// Validazione dei contenuti: schemi + coerenza tra i documenti. Funzione pura (niente fs): la usano la riga di comando, la build,
// la pubblicazione e l'editor dell'admin.
//
// Ogni problema è un `issue`: { doc, path, message, severity }.
//  - doc: 'site' | 'shared' | 'page:<chiave>'; path: puntatore JSON dentro il documento (come in Ajv, es. /blocks/0/image/alt).
//  - severity 'error' blocca la pubblicazione; 'warning' no. I problemi di una pagina in bozza sono sempre avvisi:
//    una pagina incompleta non deve impedire di pubblicare il resto del sito.
import { validatorsFor } from './index.mjs';
import { INLINE, BLOCK } from './common.mjs';

// Messaggio in italiano per un errore di Ajv.
export function messageFor(e) {
  const p = e.params ?? {};
  switch (e.keyword) {
    case 'required': return 'Campo obbligatorio';
    case 'minLength': return p.limit === 1 ? 'Non può essere vuoto' : `Servono almeno ${p.limit} caratteri`;
    case 'maxLength': return `Al massimo ${p.limit} caratteri`;
    case 'pattern': return p.pattern === INLINE || p.pattern === BLOCK ? 'Contiene formattazione non ammessa' : 'Formato non valido';
    case 'enum': case 'const': return 'Valore non ammesso';
    case 'type': return 'Tipo di valore non valido';
    case 'minItems': return `Servono almeno ${p.limit} elementi`;
    case 'maxItems': return `Al massimo ${p.limit} elementi`;
    case 'additionalProperties': return 'Campo non previsto';
    case 'minimum': case 'maximum': return `Valore non valido (${e.message})`;
    case 'format': return 'Formato non valido';
    case 'uniqueItems': return 'Elementi duplicati';
    default: return e.message;
  }
}

const pathOfError = (e) => e.instancePath + (e.params?.missingProperty ? '/' + e.params.missingProperty : '') + (e.params?.additionalProperty ? '/' + e.params.additionalProperty : '');

// Indirizzo di ogni pagina (senza prefisso lingua), per trovare doppioni. Si ferma ai cicli.
function pathsOf(pages, locale, def) {
  const byKey = Object.assign(Object.create(null), Object.fromEntries(pages.map((p) => [p.key, p])));
  return Object.fromEntries(pages.map((p) => {
    const segs = [];
    let n = 0;   // limite: un ciclo tra pagine padre non deve bloccare il controllo
    for (let q = p; q && n++ < 12; q = q.parent ? byKey[q.parent] : null) { const s = q.slug?.[locale] ?? q.slug?.[def] ?? ''; if (s) segs.unshift(s); }
    return [p.key, '/' + segs.map((s) => s + '/').join('')];
  }));
}

export function validateData({ site, shared, pages }, tpl) {
  const v = validatorsFor(tpl);
  const issues = [];
  const add = (doc, path, message, severity = 'error') => issues.push({ doc, path, message, severity });
  const isDraft = (key) => pages.find((p) => p.key === key)?.status !== 'published';
  const sev = (doc) => (doc.startsWith('page:') && isDraft(doc.slice(5)) ? 'warning' : 'error');

  const check = (validate, data, doc) => {
    if (validate(data)) return;
    const seen = new Set();
    for (const e of validate.errors) {
      if (['if', 'oneOf', 'anyOf'].includes(e.keyword)) continue;   // rumore dei rami non scelti
      const path = pathOfError(e);
      const message = messageFor(e);
      const id = path + message;
      if (!seen.has(id)) { seen.add(id); add(doc, path, message, sev(doc)); }
    }
  };

  check(v.site, site, 'site');
  check(v.shared, shared, 'shared');
  for (const p of pages) check(v.page, p, `page:${p.key}`);

  // ---- coerenza tra i documenti ----
  // Le bozze possono essere incomplete o malformate: qui si tollera, lo schema le ha già segnalate.
  const blocksOf = (p) => (Array.isArray(p.blocks) ? p.blocks : []);
  const isBlock = (b) => b && typeof b === 'object';
  const keys = new Set(pages.map((p) => p.key));
  const byKey = Object.assign(Object.create(null), Object.fromEntries(pages.map((p) => [p.key, p])));
  const anchors = Object.fromEntries(pages.map((p) => [p.key, new Set(blocksOf(p).filter(isBlock).map((b) => b.anchor).filter(Boolean))]));
  const ids = new Map();

  const noteRef = (doc, path, page, anchor) => {
    if (!keys.has(page)) { add(doc, path, `Il link punta alla pagina "${page}", che non esiste ancora`, 'warning'); return; }
    if (byKey[page].status !== 'published') add(doc, path, `Il link punta a "${page}", che è in bozza e non sarà online`, 'warning');
    if (anchor && !anchors[page].has(anchor)) add(doc, path, `Il link punta a ${page}#${anchor} ma la pagina non ha quell'ancora`, sev(doc));
  };
  const walk = (node, doc, path) => {
    if (typeof node === 'string') {
      // Stringhe enormi non si scandiscono (costo per battuta sull'editor) e il segnaposto ha una lunghezza massima nella regex.
      if (node.length <= 100_000) for (const todo of node.matchAll(/\[DA (?:COMPLETARE|CONFERMARE|VERIFICARE)[^\]]{0,90}\]/g)) add(doc, path, `Segnaposto ancora da risolvere: ${todo[0]}`, 'warning');   // avviso, non blocca: serve a non pubblicare testi legali incompleti per dimenticanza
      for (const m of node.matchAll(/href="page:([a-z0-9-]+)(?:#([a-z][a-z0-9-]*))?"/g)) noteRef(doc, path, m[1], m[2]); return; }
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, doc, `${path}/${i}`));
    if (node && typeof node === 'object') {
      if (node.type === 'page' && typeof node.page === 'string') noteRef(doc, path, node.page, node.anchor);
      for (const [k, x] of Object.entries(node)) walk(x, doc, `${path}/${k}`);
    }
  };
  walk(site, 'site', '');
  walk(shared, 'shared', '');
  for (const [k, b] of Object.entries(shared ?? {})) if (isBlock(b) && b.id !== k) add('shared', `/${k}/id`, `L'id "${b.id}" deve coincidere con la chiave "${k}"`);

  if (!keys.has('home')) add('site', '', 'Manca la pagina "home"');
  const defLocale = site?.locales?.default ?? 'it';

  for (const p of pages) {
    const doc = `page:${p.key}`;
    walk(p, doc, '');
    if (p.parent && !keys.has(p.parent)) add(doc, '/parent', `La pagina padre "${p.parent}" non esiste`, sev(doc));
    // ciclo tra pagine padre
    const seen = new Set();
    for (let q = p; q; q = q.parent ? byKey[q.parent] : null) { if (seen.has(q.key)) { add(doc, '/parent', 'La catena delle pagine padre forma un ciclo', 'error'); break; } seen.add(q.key); }
    blocksOf(p).forEach((b, i) => {
      if (!isBlock(b)) return;
      if (ids.has(b.id)) add(doc, `/blocks/${i}/id`, `Id blocco duplicato "${b.id}" (già in ${ids.get(b.id)})`, sev(doc)); else ids.set(b.id, doc);
      if (b.type === 'shared' && !(shared && Object.hasOwn(shared, b.ref))) add(doc, `/blocks/${i}/ref`, `Il blocco condiviso "${b.ref}" non esiste`, sev(doc));
    });
  }

  // due pagine online non possono avere lo stesso indirizzo
  for (const locale of site?.locales?.enabled ?? [defLocale]) {
    const paths = pathsOf(pages, locale, defLocale);
    const owner = new Map();
    for (const p of pages.filter((q) => q.status === 'published')) {
      if (locale !== defLocale && !p.title?.[locale]) continue;
      const at = paths[p.key];
      if (owner.has(at)) add(`page:${p.key}`, '/slug', `Lo stesso indirizzo ${at} è già usato dalla pagina "${owner.get(at)}"`, 'error');
      else owner.set(at, p.key);
    }
  }

  const count = {};
  for (const p of pages) for (const b of blocksOf(p)) { if (!isBlock(b)) continue; const t = b.type === 'shared' ? `shared:${shared?.[b.ref]?.type}` : b.type === 'items' ? `items:${b.layout}` : b.type; count[t] = (count[t] ?? 0) + 1; }

  const label = (i) => (i.doc.startsWith('page:') ? `${i.doc.slice(5)}.json` : `${i.doc}.json`) + i.path;
  const text = (i) => `${label(i)}: ${i.message}`;
  return {
    issues,
    errors: issues.filter((i) => i.severity === 'error').map(text),
    warnings: issues.filter((i) => i.severity === 'warning').map(text),
    stats: { pages: pages.length, blocks: pages.reduce((n, p) => n + blocksOf(p).length, 0), shared: Object.keys(shared ?? {}).length, count },
  };
}
