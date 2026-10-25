// Lingue dei contenuti (Impostazioni → Lingue): quali sono online, quale è la predefinita e in quale sono scritti i contenuti di base.
// Aggiungere una lingua crea, per ogni pagina, la sua versione in bozza («Titolo - EN»); i testi delle pagine esistenti si assegnano alla
// lingua di base. Le lingue del CMS (interfaccia dell'admin) sono un'altra cosa: stanno in Impostazioni → Generale.
import { query, tx, withLock, parseJson, toJson } from './db.mjs';
import { getDoc, saveDraft, ensureTranslations } from './docs.mjs';
import { renameLocale } from '../render/translations.mjs';
import { LOCALES, DEFAULT_TAG, TAG_PATTERN } from '../render/locales.mjs';

// Assegna i contenuti esistenti alla lingua di base: sposta i testi dall'italiano (la lingua implicita di prima) alla lingua scelta e segna
// ogni pagina con la sua lingua. Bozza e pubblicato insieme, così lo
// stato dei documenti non cambia; la cronologia resta com'era.
async function reassignBase(from, to) {
  return tx(async (t) => {
    const rows = await t.query("SELECT id, kind, draft, published FROM docs WHERE kind <> 'tokens' FOR UPDATE");
    const mark = (r, doc) => ((r.kind === 'page' || r.kind === 'post') && !doc.translationOf && !doc.lang ? { ...doc, lang: to } : doc);   // ogni pagina e articolo dichiara la lingua dei suoi testi
    for (const r of rows) {
      const draft = toJson(mark(r, renameLocale(parseJson(r.draft), from, to)));
      const pub = r.published == null ? null : toJson(mark(r, renameLocale(parseJson(r.published), from, to)));
      await t.query('UPDATE docs SET draft = ?, published = ?, rev = rev + 1 WHERE id = ?', [draft, pub, r.id]);
    }
    return rows.length;
  });
}

// Togliere una lingua mette in bozza tutte le sue versioni (pagine e articoli): non escono più dal sito, non si perdono (se la lingua si
// riattiva le ritrovi com'erano, in bozza) e nell'elenco dei contenuti risultano «Lingua disattivata». Restituisce quante ne ha messe in bozza.
async function disableLanguages(removed, userId) {
  let n = 0;
  for (const kind of ['page', 'post']) {
    const rows = await query('SELECT doc_key, draft FROM docs WHERE kind = ? AND deleted_at IS NULL', [kind]);
    for (const r of rows) {
      const d = parseJson(r.draft);
      if (!d.translationOf || !removed.includes(d.lang) || d.status === 'draft') continue;
      await saveDraft(kind, r.doc_key, { ...d, status: 'draft' }, userId);
      n++;
    }
  }
  return n;
}

// enabled: lingue online; def: predefinita; tags: codici (it-CH…); baseLang: lingua dei contenuti esistenti (serve se non è ancora definita
// e si attiva una lingua in più).
export async function applyLocales({ enabled, def, tags, baseLang }, userId) {
  const run = await withLock('cms-languages', async () => {
    const on = Array.isArray(enabled) ? LOCALES.filter((l) => enabled.includes(l)) : [];
    if (!on.length) return { ok: false, error: 'Serve almeno una lingua attiva.' };
    if (!on.includes(def)) return { ok: false, error: 'La lingua predefinita deve essere tra quelle attive.' };
    const next = {};
    for (const l of on) {
      const code = String(tags?.[l] ?? DEFAULT_TAG[l]).trim();
      if (!new RegExp(TAG_PATTERN).test(code)) return { ok: false, error: `Il codice di «${l}» ha la forma it-CH (due lettere, trattino, due maiuscole) oppure è la sola lingua (it).`, code: l };
      next[l] = code;
    }
    const doc = await getDoc('site', 'main');
    if (!doc || doc.deleted_at) return { ok: false, error: 'I dati del sito non ci sono ancora.' };
    const old = doc.draft.locales ?? {};
    const oldEnabled = old.enabled ?? ['it'];
    const added = on.filter((l) => !oldEnabled.includes(l));

    let base = old.base ?? null;
    let assigned = false;
    if (!base && on.length > 1) {   // più lingue: serve sapere in quale sono scritti i contenuti di adesso
      if (!LOCALES.includes(baseLang)) return { ok: false, needBase: true, error: 'Indica in quale lingua sono scritti i contenuti attuali.' };
      base = baseLang;
      assigned = true;
    }
    if (base && !on.includes(base)) return { ok: false, error: 'La lingua dei contenuti di base deve restare attiva.' };

    if (assigned) await reassignBase('it', base);   // oggi i testi sono tutti in italiano
    const siteDoc = assigned ? await getDoc('site', 'main') : doc;
    const tagsAll = { ...(old.tags ?? {}), ...next };   // i codici delle lingue spente restano memorizzati
    const locales = { default: def, ...(base ? { base } : {}), enabled: on, tags: tagsAll };
    const r = await saveDraft('site', 'main', { ...siteDoc.draft, locales }, userId);
    if (r.conflict) return { ok: false, conflict: true };
    const pubRow = assigned ? (await query("SELECT published FROM docs WHERE kind = 'site' AND doc_key = 'main'"))[0] : null;
    if (pubRow?.published) {   // l'online sa già in che lingua sono scritti i testi
      const p = parseJson(pubRow.published);
      await query("UPDATE docs SET published = ? WHERE kind = 'site' AND doc_key = 'main'", [toJson({ ...p, locales: { ...(p.locales ?? {}), base } })]);
    }

    const disabled = await disableLanguages(LOCALES.filter((l) => !on.includes(l)), userId);   // tutte le lingue spente (anche quelle tolte in passato): idempotente

    // Le versioni in bozza delle pagine: per le lingue appena attive, e per tutte se la lingua di base è stata appena definita.
    let created = 0;
    if (base) {
      const only = assigned ? on.filter((l) => l !== base) : added.filter((l) => l !== base);
      if (only.length) {
        const site = { locales };
        for (const kind of ['page', 'post']) {
          const docs = (await query('SELECT draft FROM docs WHERE kind = ? AND deleted_at IS NULL', [kind])).map((p) => parseJson(p.draft)).filter((p) => !p.translationOf);
          for (const p of docs) created += (await ensureTranslations(p, site, userId, only, kind)).length;
        }
      }
    }
    return { ok: true, created, assigned, base, disabled };
  }, 0);
  return run.ok ? run.value : { ok: false, error: 'Un\'altra modifica alle lingue è in corso: riprova tra un momento.' };
}

// Crea (in bozza) la versione di una pagina in una lingua attiva che ancora non ne ha una.
export async function createTranslation(baseKey, lang, userId, kind = 'page') {
  const site = (await getDoc('site', 'main'))?.draft;
  const base = site?.locales?.base;
  if (!base) return { ok: false, error: 'Definisci prima la lingua dei contenuti in Impostazioni → Lingue.' };
  if (!(site.locales.enabled ?? []).includes(lang) || lang === base) return { ok: false, error: 'Questa lingua non è attiva.' };
  const page = await getDoc(kind, baseKey);
  if (!page || page.deleted_at || page.draft.translationOf) return { ok: false, error: kind === 'post' ? "L'articolo non esiste." : 'La pagina non esiste.' };
  const trash = await getDoc(kind, `${baseKey}--${lang}`);
  if (trash) return { ok: false, error: trash.deleted_at ? 'La versione è nel cestino: ripristinala.' : 'La versione esiste già.' };
  const made = await ensureTranslations(page.draft, site, userId, [lang], kind);
  return { ok: true, key: made[0] };
}
