// Riferimenti a una pagina: link nei blocchi, nei dati del sito e pagine figlie. Funzione pura.
// docs: [{ kind, key, data }]. Restituisce [{ kind, key, path, why }].
export function findPageRefs(docs, pageKey) {
  const found = [];
  const walk = (node, d, path) => {
    if (typeof node === 'string') { if (new RegExp(`href="page:${pageKey}(?:#[a-z][a-z0-9-]*)?"`).test(node)) found.push({ kind: d.kind, key: d.key, path, why: 'link nel testo' }); return; }
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, d, `${path}/${i}`));
    if (node && typeof node === 'object') {
      if (node.type === 'page' && node.page === pageKey) found.push({ kind: d.kind, key: d.key, path, why: 'link' });
      for (const [k, x] of Object.entries(node)) walk(x, d, `${path}/${k}`);
    }
  };
  for (const d of docs) {
    if (d.kind === 'page' && d.key === pageKey) continue;
    if (d.kind === 'page' && d.data?.parent === pageKey) found.push({ kind: d.kind, key: d.key, path: '/parent', why: 'pagina figlia' });
    walk(d.data, d, '');
  }
  return found;
}
