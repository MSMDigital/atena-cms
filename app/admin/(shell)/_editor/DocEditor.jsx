'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { newId, collectIds, createModel, setUi, setLang, issueHref, SITE_GROUPS, siteGroupOf } from '@/lib/schema-form.mjs';
import { Field, FormProvider } from './SchemaForm';
import { saveDocAction, validateDocAction, previewDocAction, trashDocAction } from './actions';
import { publishAction } from '../actions';
import { SEO_FIELDS, GEO_FIELDS } from '@/schema/blog.mjs';
import { checkPost, checkPage } from '@/lib/post-seo.mjs';
import { useT, useLang } from '@/app/admin/_i18n/I18nProvider';
import { langName } from '@/render/locales.mjs';

const DEVICES = { desktop: 1440, mobile: 390 };
const PUB = { clean: 'Uguale alla versione online', modified: 'Modifiche non pubblicate', unpublished: 'Mai pubblicata' };

const POST_SEO = [...SEO_FIELDS, ...GEO_FIELDS];
// Campi della pagina nel blocco «SEO e GEO» (gli altri, compresi quelli del template, restano nelle impostazioni).
const PAGE_SEO_FIELDS = ['title', 'description', 'ogImage', 'focusKeyword', 'ogType', 'contentType', 'datePublished', 'noindex'];
const PAGE_GEO_FIELDS = ['geoSummary', 'facts', 'faq', 'dateModified', 'author', 'noai'];
const PAGE_SEO = [...PAGE_SEO_FIELDS, ...PAGE_GEO_FIELDS];
const LAMP = { green: 'a posto', amber: 'da migliorare', red: 'manca qualcosa di importante' };

// Semaforo SEO / GEO dell'articolo, in diretta mentre si scrive (anche a campi vuoti): ogni controllo con la sua lunghezza attuale.
function SeoMeter({ post, page = false, defaultOg = false, lang }) {
  const t = useT();
  const r = useMemo(() => (page ? checkPage(post, { defaultOg }) : checkPost(post, { locale: lang })), [post, page, defaultOg, lang]);
  return (
    <div className="seometer" aria-live="polite">
      {[['seo', 'SEO', 'motori di ricerca'], ['geo', 'GEO', 'AI']].map(([k, name, what]) => (
        <section key={k} className="seometer__col">
          <h3><span className={`light light--${r[k].level}`} role="img" aria-label={`${name}: ${t(LAMP[r[k].level])}`} /> {name} <span className="muted">· {t(LAMP[r[k].level])}</span></h3>
          <ul>{r[k].checks.map((c) => <li key={c.text} className={`chk chk--${c.level}`}><span className="chk__mark" aria-hidden="true">{c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕'}</span> {t(c.text)}</li>)}</ul>
          <p className="muted seometer__what">{t('Controlli di buon senso per {what}, non una misura del posizionamento.', { what: t(what) })}</p>
        </section>
      ))}
    </div>
  );
}

// I due pallini nel titolo del blocco, visibili anche a blocco chiuso.
function SeoDots({ post, page = false, defaultOg = false, lang }) {
  const t = useT();
  const r = useMemo(() => (page ? checkPage(post, { defaultOg }) : checkPost(post, { locale: lang })), [post, page, defaultOg, lang]);
  return <span className="seodots">{[['seo', 'SEO'], ['geo', 'GEO']].map(([k, n]) => <span key={k} className="seodots__i"><span className={`light light--${r[k].level}`} role="img" aria-label={`${n}: ${t(LAMP[r[k].level])}`} /> {n}</span>)}</span>;
}

// `force`: si apre da sola quando dentro ci sono problemi da sistemare (così i campi in rosso si vedono).
function Section({ title, children, open = false, force = false, aside = null }) {
  const t = useT();
  const [o, setO] = useState(open);
  useEffect(() => { if (force) setO(true); }, [force]);
  return (
    <details className={`sec${force ? ' sec--bad' : ''}`} open={o} onToggle={(e) => setO(e.currentTarget.open)}>
      <summary>{t(title)}{aside}{force && <span className="badge bad">{t('da sistemare')}</span>}</summary>
      <div className="sec__body">{children}</div>
    </details>
  );
}

export default function DocEditor({ kind, docKey, title, siteGroup = 'generale', initial, rev: initialRev, state, meta, canDelete, canPublish }) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [rev, setRev] = useState(initialRev);
  const [pub, setPub] = useState(state);
  const [issues, setIssues] = useState([]);
  const [others, setOthers] = useState(0);
  // Documenti con testi in più lingue (dati del sito, blocchi condivisi, articoli…): una scheda per lingua invece dei campi uno sotto l'altro.
  const langList = useMemo(() => [...new Set([meta.defaultLocale, ...meta.locales])], [meta.defaultLocale, meta.locales]);
  const tabbed = langList.length > 1 && ['site', 'shared', 'headers', 'footers', 'categories', 'tags', 'post'].includes(kind);
  const [activeLang, setActiveLang] = useState(meta.defaultLocale);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [busy, start] = useTransition();
  // Schemi e testi dell'editor del template attivo (dal server): si compongono una volta per template.
  const schemas = meta.schemas;
  const model = useMemo(() => createModel(schemas.allSchemas), [schemas]);
  setUi(meta.ui);
  setLang(meta.docLang ?? meta.baseLang ?? meta.defaultLocale);   // i nuovi testi per lingua partono dalla lingua che si sta scrivendo
  const schema = schemas[kind];
  const pageSchema = schemas.page; const sharedSchema = schemas.shared; const siteSchema = schemas.site;
  const dirty = JSON.stringify(data) !== saved;

  // ---- contesto dei campi -----------------------------------------------------------------------------
  const [media, setMedia] = useState(meta.media);
  const addMedia = useCallback((item) => setMedia((cur) => [item, ...cur.filter((i) => i.path !== item.path)]), []);
  const dataRef = useRef(data);
  dataRef.current = data;
  const ctx = useMemo(() => ({
    model, locales: meta.locales, categories: meta.categories, tags: meta.tags, authors: meta.authors, authorKeys: meta.authorKeys, headerKeys: meta.headerKeys, footerKeys: meta.footerKeys, defaultLocale: meta.defaultLocale, baseLang: meta.baseLang ?? 'it', activeLang: tabbed ? activeLang : null, pages: meta.pages, media, addMedia, maxUploadMb: meta.maxUploadMb, sharedKeys: meta.sharedKeys,
    issues,
    getRoot: () => dataRef.current,
    idFor: (type) => newId(String(type), collectIds(dataRef.current)),
  }), [meta, model, issues, media, addMedia, tabbed, activeLang]);

  // ---- controllo dei problemi (con un piccolo ritardo, scartando le risposte superate) ------------------------------
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const r = await validateDocAction({ kind, key: docKey, data });
        if (n === seq.current) { setIssues(r.issues); setOthers(r.othersBlocking); }
      } catch { /* dati troppo incompleti per il controllo: si riprova alla prossima modifica */ }
      if (n === seq.current) setChecking(false);
    }, n === 1 ? 50 : 450);
    return () => clearTimeout(timer);
  }, [data, kind, docKey]);

  // ---- anteprima ----------------------------------------------------------------------------------------------------
  const frame = useRef(null);
  const stage = useRef(null);
  const scrollY = useRef(0);
  const [html, setHtml] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewPath, setPreviewPath] = useState('/');
  const [device, setDevice] = useState('desktop');
  const [box, setBox] = useState({ w: 800, h: 600 });
  const pseq = useRef(0);

  useEffect(() => {
    const n = ++pseq.current;
    const timer = setTimeout(async () => {
      try {
        const r = await previewDocAction({ kind, key: docKey, data, path: previewPath });
        if (n !== pseq.current) return;
        if (r?.error) setPreviewError(t(r.error)); else if (r?.html) { setPreviewError(null); setHtml(r.html); }
      } catch (e) { if (n === pseq.current) setPreviewError(t('Anteprima non disponibile.')); }
    }, n === 1 ? 50 : 500);
    return () => clearTimeout(timer);
  }, [data, kind, docKey, previewPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aggiorna l'iframe mantenendo la posizione di scorrimento.
  useEffect(() => {
    const f = frame.current;
    if (!f || html == null) return;
    f.srcdoc = html;                              // la posizione di scorrimento la comunica l'anteprima stessa (cms-scroll) e si ripristina a caricamento (cms-ready)
  }, [html]);

  useEffect(() => {
    // L'anteprima ha un'origine opaca (sandbox): si riconosce chi scrive dalla finestra, non dall'origine.
    const onMsg = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'cms-scroll' && Number.isFinite(d.y)) { scrollY.current = d.y; return; }
      if (d.type === 'cms-ready') { frame.current.contentWindow.postMessage({ type: 'cms-restore', y: scrollY.current }, '*'); return; }
      if (d.type !== 'cms-navigate' || typeof d.href !== 'string') return;
      if (kind === 'page' || kind === 'post') return;                // la pagina (o l'articolo) in modifica resta quella mostrata
      const p = d.href.replace(/^\/admin\/preview/, '') || '/';
      setPreviewPath(p.endsWith('/') ? p : p + '/');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [kind]);

  useEffect(() => {
    if (!stage.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const W = DEVICES[device];
  const scale = Math.min(1, (box.w - 24) / W);

  // ---- azioni --------------------------------------------------------------------------------------------------------------
  const save = () => start(async () => {
    const r = await saveDocAction({ kind, key: docKey, data, rev });
    if (r.ok) {
      setSaved(JSON.stringify(data)); setRev(r.rev); setConflict(null);
      if (r.changed && pub === 'clean') setPub('modified');
      setMsg({ tone: 'ok', text: r.changed ? t('Bozza salvata.') : t('Nessuna modifica da salvare.') });
    } else if (r.conflict === 'rev') {
      setConflict({ by: r.by });
      setMsg(null);
    } else setMsg({ tone: 'bad', text: r.conflict === 'deleted' ? t('Questo documento è stato eliminato.') : t(r.error ?? 'Non salvato.') });
  });
  const publish = () => start(async () => {
    const r = await publishAction();
    if (r.ok) { setPub('clean'); setMsg({ tone: 'ok', text: r.nothing ? t('Niente da pubblicare.') : t('Pubblicato: {n} pagine.', { n: r.pages }) }); }
    else setMsg({ tone: 'bad', text: t('{error}. Il sito online non è cambiato.', { error: t(r.error) }), details: (r.details ?? []).slice(0, 6) });
  });
  const remove = () => start(async () => {
    if (!window.confirm(kind === 'post' ? t("Spostare l'articolo nel cestino? Se è online sparirà dal sito alla prossima pubblicazione; dal cestino si può ripristinare.") : t('Spostare la pagina nel cestino? Se è online sparirà dal sito alla prossima pubblicazione; dal cestino si può ripristinare.'))) return;
    const r = await trashDocAction(kind, docKey);
    if (r.ok) { setSaved(JSON.stringify(data)); router.push(kind === 'post' ? '/admin/posts' : '/admin/pages'); router.refresh(); }
    else setMsg({ tone: 'bad', text: r.refs?.length ? `${t(r.error)} ${t('Usata da: {list}.', { list: r.refs.slice(0, 4).map((x) => `${x.kind === 'page' ? t('pagina {key}', { key: x.key }) : x.kind === 'site' ? t('dati del sito') : x.kind} (${t(x.why)})`).join(', ') })}` : t(r.error) });
  });

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const isDraftPage = (kind === 'page' || kind === 'post') && data.status !== 'published' && data.status !== 'scheduled';

  const body = kind === 'post' ? (
    <>
      <Section title="Impostazioni dell'articolo" open force={issues.some((i) => i.severity === 'error' && !i.path.startsWith('/blocks') && !POST_SEO.includes(i.path.split('/')[1]))}>
        <Field schema={schemas.post} value={data} onChange={setData} path="" bare omit={['blocks', 'key', 'lang', 'translationOf', ...POST_SEO]} />
      </Section>
      <Section title="SEO e GEO" open={false} aside={<SeoDots post={data} lang={meta.baseLang ?? 'it'} />} force={issues.some((i) => i.severity === 'error' && POST_SEO.includes(i.path.split('/')[1]))}>
        <SeoMeter post={data} lang={meta.baseLang ?? 'it'} />
        <h3 className="subhead">{t('SEO · motori di ricerca')}</h3>
        <Field schema={schemas.post} value={data} onChange={setData} path="" bare pick={SEO_FIELDS} />
        <h3 className="subhead">{t('GEO · motori di ricerca con intelligenza artificiale')}</h3>
        <Field schema={schemas.post} value={data} onChange={setData} path="" bare pick={GEO_FIELDS} />
      </Section>
      <section className="blocks">
        <h2>{t('Contenuto')}</h2>
        <Field schema={schemas.post.properties.blocks} value={data.blocks} onChange={(blocks) => setData({ ...data, blocks: blocks ?? [] })} path="/blocks" label="" />
      </section>
    </>
  ) : kind === 'page' ? (
    <>
      <Section title="Impostazioni della pagina" open={docKey === 'home' ? false : data.blocks?.length === 0} force={issues.some((i) => i.severity === 'error' && !i.path.startsWith('/blocks') && !PAGE_SEO.includes(i.path.split('/')[1]))}>
        <Field schema={pageSchema} value={data} onChange={setData} path="" bare omit={['blocks', 'key', 'lang', 'translationOf', ...PAGE_SEO]} />
      </Section>
      <Section title="SEO e GEO" open={false} aside={<SeoDots post={data} page defaultOg={!!meta.defaultOg} />} force={issues.some((i) => i.severity === 'error' && PAGE_SEO.includes(i.path.split('/')[1]))}>
        <SeoMeter post={data} page defaultOg={!!meta.defaultOg} />
        <h3 className="subhead">{t('SEO · motori di ricerca')}</h3>
        <Field schema={pageSchema} value={data} onChange={setData} path="" bare pick={PAGE_SEO_FIELDS} />
        <h3 className="subhead">{t('GEO · motori di ricerca con intelligenza artificiale')}</h3>
        <Field schema={pageSchema} value={data} onChange={setData} path="" bare pick={PAGE_GEO_FIELDS} />
      </Section>
      <section className="blocks">
        <h2>{t('Blocchi della pagina')}</h2>
        <Field schema={pageSchema.properties.blocks} value={data.blocks} onChange={(blocks) => setData({ ...data, blocks: blocks ?? [] })} path="/blocks" label="" />
      </section>
    </>
  ) : kind === 'site' ? (
    Object.entries(siteSchema.properties).filter(([k]) => siteGroupOf(k) === siteGroup).map(([k, ps]) => (
      <Section key={k} title={ps.title ?? meta.ui?.siteSections?.[k] ?? k} open={false} force={issues.some((i) => i.severity === 'error' && (i.path === `/${k}` || i.path.startsWith(`/${k}/`)))}>
        <Field schema={ps} value={data[k]} onChange={(v) => setData({ ...data, [k]: v })} path={`/${k}`} bare />
      </Section>
    ))
  ) : kind === 'headers' || kind === 'footers' || kind === 'categories' || kind === 'tags' ? (
    <Field schema={schemas[kind]} value={data} onChange={setData} path="" bare />
  ) : (
    <Field schema={sharedSchema} value={data} onChange={setData} path="" bare />
  );

  return (
    <FormProvider value={ctx}>
      <div className="editor">
        <div className="editor__panel">
          <div className="editor__scroll">
            <div className="editor__title">
              <h1>{t(title)}</h1>
              {(kind === 'page' || kind === 'post') && <span className={`tag tag--${data.status === 'published' ? 'ok' : 'warn'}`}>{data.status === 'published' ? t('Pubblicata') : data.status === 'scheduled' ? t('Pianificato') : t('Bozza')}</span>}
              {(kind === 'page' || kind === 'post') && <span className="muted keytag" title={t('La chiave identifica la pagina nei link e non si cambia')}>{t('chiave: {key}', { key: docKey })}</span>}
              {canDelete && <button type="button" className="mini mini--danger" onClick={remove} disabled={busy}>{t('Sposta nel cestino')}</button>}
            </div>
            {isDraftPage && <p className="hint">{kind === 'post' ? t('Questo articolo è una bozza: non sarà online finché lo stato non è "Pubblicata". I problemi qui sotto non bloccano la pubblicazione del resto del sito.') : t('Questa pagina è una bozza: non sarà online finché lo stato non è "Pubblicata". I problemi qui sotto non bloccano la pubblicazione del resto del sito.')}</p>}
            {kind === 'post' && data.status === 'scheduled' && <p className="hint">{data.publishAt ? t("Pianificato per il {date} alle {time} (ora svizzera): esce alla prima verifica oraria dopo quell'ora.", { date: `${data.publishAt.slice(8, 10)}.${data.publishAt.slice(5, 7)}.${data.publishAt.slice(0, 4)}`, time: data.publishAt.slice(11, 16) }) : t('Scegli data e ora intera di pubblicazione.')} {t('Serve che le modifiche a questo articolo siano salvate.')}</p>}
            {kind === 'categories' && <p className="hint">{t("Le categorie degli articoli. Il nome è quello che si vede; la chiave (in minuscolo) entra nell'indirizzo della pagina della categoria. Una categoria compare sul sito solo se ha almeno un articolo pubblicato.")}</p>}
            {kind === 'tags' && <p className="hint">{t("I tag degli articoli: parole chiave più precise delle categorie. Il nome è quello che si vede; la chiave (in minuscolo) entra nell'indirizzo della pagina del tag. Un tag compare sul sito solo se ha almeno un articolo pubblicato.")}</p>}
            {kind === 'shared' && <p className="hint">{t("Blocchi definiti una volta e usati in più pagine (per esempio il nastro). Una modifica vale ovunque.")}</p>}
            {kind === 'headers' && <p className="hint">{t("Gli header del sito: ognuno ha un nome. «default» è quello usato dalle pagine che non ne scelgono uno; ogni pagina può sceglierne un altro (Impostazioni della pagina → Header).")}</p>}
            {kind === 'footers' && <p className="hint">{t("I footer del sito: ognuno ha un nome. «default» è quello usato dalle pagine che non ne scelgono uno; ogni pagina può sceglierne un altro (Impostazioni della pagina → Footer).")}</p>}
            {kind === 'site' && <p className="hint">{t(SITE_GROUPS[siteGroup].hint)}</p>}
            {tabbed && (
              <div className="langtabs" role="tablist" aria-label={t('Lingua dei testi')}>
                {langList.map((l) => <button key={l} type="button" role="tab" aria-selected={activeLang === l} className={`langtab${activeLang === l ? ' is-on' : ''}`} onClick={() => setActiveLang(l)}>{langName(l, lang)}</button>)}
              </div>
            )}
            {body}
          </div>

          <div className="editor__bar">
            {(errors.length > 0 || warnings.length > 0 || others > 0) && (
              <p className="summary" role="status">
                {errors.length > 0 && <span className="bad">{t('{n} da sistemare', { n: errors.length })}</span>}
                {warnings.length > 0 && <span className="warn">{warnings.length === 1 ? t('1 avviso') : t('{n} avvisi', { n: warnings.length })}</span>}
                {others > 0 && <span className="muted">{t('{n} in altri documenti', { n: others })}</span>}
                {errors.length > 0 && !isDraftPage && <span className="muted">{t('— prima di pubblicare')}</span>}
              </p>
            )}
            {msg && <div className={`notice notice--${msg.tone}`} role="status"><p>{t(msg.text)}</p>{msg.details?.length > 0 && <ul>{msg.details.map((d, i) => { const h = issueHref(d); return <li key={i}>{h ? <a href={h}>{t(d)}</a> : t(d)}</li>; })}</ul>}</div>}
            {conflict && <p className="notice notice--bad" role="alert">{t('{who} ha modificato questo documento nel frattempo, quindi il salvataggio è bloccato per non sovrascrivere il suo lavoro.', { who: conflict.by ?? t('Un altro utente') })} <button type="button" className="link" onClick={() => window.location.reload()}>{t('Ricarica')}</button> {t('per vedere le sue modifiche (perderai le tue non salvate).')}</p>}
            <div className="editor__actions">
              <span className="muted">{dirty ? t('Modifiche non salvate') : t(PUB[pub])}{checking ? ` · ${t('controllo…')}` : ''}</span>
              <button className="btn" disabled={!dirty || busy} onClick={() => { setData(JSON.parse(saved)); setMsg(null); }}>{t('Annulla')}</button>
              <button className="btn" disabled={!dirty || busy || !!conflict} onClick={save}>{t('Salva bozza')}</button>
              {canPublish && <button className="btn btn--primary" disabled={dirty || busy || pub === 'clean'} onClick={publish} title={dirty ? t('Salva prima la bozza') : ''}>{t('Pubblica')}</button>}
            </div>
          </div>
        </div>

        <div className="editor__preview">
          <div className="preview__bar">
            {kind !== 'page' && kind !== 'post' && (
              <select value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} aria-label={t('Pagina in anteprima')}>
                {meta.previewPages.map((p) => <option key={p.key} value={p.path}>{p.name}</option>)}
              </select>
            )}
            {(kind === 'page' || kind === 'post') && <span className="muted">{t('Anteprima di questa pagina, con le modifiche non ancora salvate')}</span>}
            <div className="seg">{Object.keys(DEVICES).map((d) => <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{d === 'desktop' ? t('Desktop') : t('Mobile')}</button>)}</div>
            <span className="muted">{Math.round(scale * 100)}%</span>
          </div>
          {previewError && <p className="notice notice--bad preview__error" role="alert">{previewError}</p>}
          <div className="preview__stage" ref={stage}>
            {html == null && !previewError && <p className="preview__loading">{t("Caricamento dell'anteprima…")}</p>}
            <div style={{ width: W * scale, height: box.h - 24, margin: '0 auto', position: 'relative' }}>
              <iframe ref={frame} title={t('Anteprima della pagina')} sandbox="allow-scripts" style={{ width: W, height: (box.h - 24) / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
            </div>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}

