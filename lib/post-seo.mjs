// Semaforo SEO / GEO di un articolo, per l'elenco dell'admin. Sono controlli di buon senso sul contenuto (non una misura di posizionamento):
// ogni controllo ha un esito «ok», «warn» (si può migliorare) o «bad» (manca qualcosa di importante). Il semaforo somma i punti dei problemi
// (bad = 2, warn = 1): verde = nessun problema, giallo = fino a 2 punti, rosso = di più. Così ogni campo compilato bene si vede subito.
// `checks` elenca TUTTI i controlli (anche quelli superati, con le lunghezze attuali: li usa l'editor, anche a campi vuoti); `issues` solo i problemi.
//   SEO: titolo e descrizione di lunghezza giusta, immagine di condivisione, indirizzo, contenuto abbastanza lungo.
//   GEO (motori di ricerca con intelligenza artificiale): autore e riassunto chiari, argomento (categoria o tag), contenuto abbastanza lungo,
//   data di aggiornamento.
const plain = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// Parole del contenuto: tutte le stringhe dei blocchi, tranne identificativi, tipi, percorsi e indirizzi.
const SKIP = new Set(['id', 'type', 'ref', 'anchor', 'surface', 'layout', 'image', 'src', 'path', 'url', 'link', 'icon', 'cssClass']);
function words(v, key = '') {
  if (typeof v === 'string') return SKIP.has(key) ? 0 : (plain(v).match(/\S+/g) ?? []).length;
  if (Array.isArray(v)) return v.reduce((n, x) => n + words(x, key), 0);
  if (v && typeof v === 'object') return Object.entries(v).reduce((n, [k, x]) => n + words(x, k), 0);
  return 0;
}

const POINTS = { ok: 0, warn: 1, bad: 2 };
const lamp = (checks) => { const pts = checks.reduce((n, c) => n + POINTS[c.level], 0); return pts === 0 ? 'green' : pts <= 2 ? 'amber' : 'red'; };
const pack = (checks) => ({ level: lamp(checks), checks, issues: checks.filter((c) => c.level !== 'ok') });
// Un controllo di lunghezza: vuoto = bad; fuori dall'intervallo ideale = warn.
const span = (label, n, lo, hi, empty) => (n === 0 ? { level: 'bad', text: empty }
  : n < lo || n > hi ? { level: 'warn', text: `${label}: ${n} caratteri (meglio tra ${lo} e ${hi})` }
  : { level: 'ok', text: `${label}: ${n} caratteri (ideale ${lo}–${hi})` });

export function checkPost(post, { locale = post.lang ?? 'it' } = {}) {
  const t = (v) => plain(v?.[locale] ?? v?.it ?? '');
  const title = t(post.seoTitle) || t(post.title);
  const description = t(post.seoDescription) || t(post.excerpt);
  const summary = t(post.geoSummary) || t(post.excerpt);
  const n = words(post.blocks);
  const kw = String(post.focusKeyword ?? '').trim();
  const key = kw.toLowerCase();
  const slug = String(post.slug?.[locale] ?? post.slug?.it ?? '');
  const has = (text) => text.toLowerCase().includes(key) || text.toLowerCase().includes(key.replace(/\s+/g, '-'));
  const yes = (cond, okText, badText, level = 'warn') => (cond ? { level: 'ok', text: okText } : { level, text: badText });

  const seo = [
    span('Titolo SEO', title.length, 20, 65, 'Manca il titolo'),
    span('Descrizione SEO', description.length, 70, 170, 'Manca la descrizione SEO (o il riassunto)'),
    yes(post.ogImage || post.image, 'Immagine di condivisione presente', 'Manca l\'immagine di condivisione (anteprima nei social)'),
    n < 100 ? { level: 'bad', text: `Contenuto cortissimo: ${n} parole` } : n < 300 ? { level: 'warn', text: `Contenuto breve: ${n} parole (meglio da 300)` } : { level: 'ok', text: `Contenuto: ${n} parole` },
  ];
  if (key) {
    seo.push(yes(has(title), `La parola chiave «${kw}» è nel titolo`, `La parola chiave «${kw}» non compare nel titolo`));
    seo.push(yes(has(description), `La parola chiave «${kw}» è nella descrizione`, `La parola chiave «${kw}» non compare nella descrizione`));
    seo.push(yes(has(slug), `La parola chiave «${kw}» è nell'indirizzo`, `La parola chiave «${kw}» non compare nell'indirizzo${slug ? ` (${slug})` : ', che è vuoto'}`));
  } else seo.push({ level: 'warn', text: 'Nessuna parola chiave principale: non si può controllare la coerenza con titolo e descrizione' });
  if (title && description && title.toLowerCase() === description.toLowerCase()) seo.push({ level: 'warn', text: 'Titolo e descrizione sono identici: la descrizione dovrebbe aggiungere informazioni' });
  if (slug.length > 75) seo.push({ level: 'warn', text: `Indirizzo lungo (${slug.length} caratteri): meglio sotto i 75` });
  if (post.noindex) seo.push({ level: 'warn', text: 'L\'articolo è escluso dai motori di ricerca (noindex)' });

  const geo = [
    yes(String(post.author ?? '').trim(), `Autore: ${post.author}`, 'Manca l\'autore', 'bad'),
    summary ? span('Riassunto per le AI', summary.length, 50, 400, '') : { level: 'bad', text: 'Manca il riassunto che un\'AI può citare' },
    yes(post.categories?.length || post.tags?.length, 'Argomento chiaro (categoria o tag)', 'Nessuna categoria o tag: l\'argomento non è chiaro'),
    n >= 300 ? { level: 'ok', text: `Abbastanza testo per un\'AI (${n} parole)` } : { level: 'warn', text: `Poco testo da cui un\'AI possa attingere: ${n} parole (meglio da 300)` },
    yes(post.dateModified, 'Data di ultima modifica indicata', 'Manca la data di ultima modifica sostanziale'),
    yes(post.facts?.length || post.faq?.length, 'Fatti chiave o domande frequenti presenti', 'Nessun fatto chiave né domanda frequente (aiutano le AI a citare)'),
  ];
  if (post.noai) geo.push({ level: 'warn', text: 'L\'articolo è escluso dai motori di intelligenza artificiale' });

  return { words: n, seo: pack(seo), geo: pack(geo) };
}

// Lo stesso semaforo per una pagina. Differenze: il contenuto è meno severo (una pagina di contatti è breve per natura), l'autore serve solo per
// le pagine di tipo «articolo», l'immagine di condivisione può essere quella predefinita del sito (`defaultOg`) e la home ha indirizzo vuoto.
export function checkPage(page, { locale = page.lang ?? 'it', defaultOg = false } = {}) {
  const t = (v) => plain(v?.[locale] ?? v?.it ?? '');
  const title = t(page.title);
  const description = t(page.description);
  const summary = t(page.geoSummary) || description;
  const n = words(page.blocks);
  const kw = String(page.focusKeyword ?? '').trim();
  const key = kw.toLowerCase();
  const slug = String(page.slug?.[locale] ?? page.slug?.it ?? '');
  const has = (text) => text.toLowerCase().includes(key) || text.toLowerCase().includes(key.replace(/\s+/g, '-'));
  const yes = (cond, okText, badText, level = 'warn') => (cond ? { level: 'ok', text: okText } : { level, text: badText });

  const seo = [
    span('Titolo SEO', title.length, 20, 65, 'Manca il titolo SEO'),
    span('Descrizione SEO', description.length, 70, 170, 'Manca la descrizione SEO'),
    yes(page.ogImage || defaultOg, 'Immagine di condivisione presente', 'Manca l\'immagine di condivisione (anteprima nei social)'),
    n < 50 ? { level: 'bad', text: `Contenuto cortissimo: ${n} parole` } : n < 150 ? { level: 'warn', text: `Contenuto breve: ${n} parole (meglio da 150)` } : { level: 'ok', text: `Contenuto: ${n} parole` },
  ];
  if (key) {
    seo.push(yes(has(title), `La parola chiave «${kw}» è nel titolo`, `La parola chiave «${kw}» non compare nel titolo`));
    seo.push(yes(has(description), `La parola chiave «${kw}» è nella descrizione`, `La parola chiave «${kw}» non compare nella descrizione`));
    if (slug) seo.push(yes(has(slug), `La parola chiave «${kw}» è nell'indirizzo`, `La parola chiave «${kw}» non compare nell'indirizzo (${slug})`));
  } else seo.push({ level: 'warn', text: 'Nessuna parola chiave principale: non si può controllare la coerenza con titolo e descrizione' });
  if (title && description && title.toLowerCase() === description.toLowerCase()) seo.push({ level: 'warn', text: 'Titolo e descrizione sono identici: la descrizione dovrebbe aggiungere informazioni' });
  if (slug.length > 75) seo.push({ level: 'warn', text: `Indirizzo lungo (${slug.length} caratteri): meglio sotto i 75` });
  if (page.noindex) seo.push({ level: 'warn', text: 'La pagina è esclusa dai motori di ricerca (noindex)' });
  if (page.protected) seo.push({ level: 'warn', text: 'La pagina è protetta da password: i motori di ricerca non ne vedono il contenuto' });

  const geo = [
    summary ? span('Riassunto per le AI', summary.length, 50, 400, '') : { level: 'bad', text: 'Manca il riassunto (o la descrizione) che un\'AI può citare' },
    yes(page.facts?.length || page.faq?.length, 'Fatti chiave o domande frequenti presenti', 'Nessun fatto chiave né domanda frequente (aiutano le AI a citare)'),
    yes(page.dateModified, 'Data di ultima modifica indicata', 'Manca la data di ultima modifica sostanziale'),
  ];
  if (page.contentType === 'article') geo.push(yes(String(page.author ?? '').trim(), `Autore: ${page.author}`, 'Manca l\'autore (pagina di tipo articolo)', 'bad'));
  if (page.noai) geo.push({ level: 'warn', text: 'La pagina è esclusa dai motori di intelligenza artificiale' });

  return { words: n, seo: pack(seo), geo: pack(geo) };
}
