'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { newId, collectIds, createModel, setUi } from '@/lib/schema-form.mjs';
import { Field, FormProvider } from './SchemaForm';
import { saveDocAction, validateDocAction, previewDocAction, deletePageAction } from './actions';
import { publishAction } from '../actions';

const DEVICES = { desktop: 1440, mobile: 390 };
const PUB = { clean: 'Uguale alla versione online', modified: 'Modifiche non pubblicate', unpublished: 'Mai pubblicata' };

function Section({ title, children, open = false }) {
  return (
    <details className="sec" open={open}>
      <summary>{title}</summary>
      <div className="sec__body">{children}</div>
    </details>
  );
}

export default function DocEditor({ kind, docKey, title, initial, rev: initialRev, state, meta, canDelete, canPublish }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [rev, setRev] = useState(initialRev);
  const [pub, setPub] = useState(state);
  const [issues, setIssues] = useState([]);
  const [others, setOthers] = useState(0);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [busy, start] = useTransition();
  // Schemi e testi dell'editor del template attivo (dal server): si compongono una volta per template.
  const schemas = meta.schemas;
  const model = useMemo(() => createModel(schemas.allSchemas), [schemas]);
  setUi(meta.ui);
  const schema = schemas[kind];
  const pageSchema = schemas.page; const sharedSchema = schemas.shared; const siteSchema = schemas.site;
  const dirty = JSON.stringify(data) !== saved;

  // ---- contesto dei campi -----------------------------------------------------------------------------
  const [media, setMedia] = useState(meta.media);
  const addMedia = useCallback((item) => setMedia((cur) => [item, ...cur.filter((i) => i.path !== item.path)]), []);
  const dataRef = useRef(data);
  dataRef.current = data;
  const ctx = useMemo(() => ({
    model, locales: meta.locales, defaultLocale: meta.defaultLocale, pages: meta.pages, media, addMedia, maxUploadMb: meta.maxUploadMb, sharedKeys: meta.sharedKeys,
    issues,
    getRoot: () => dataRef.current,
    idFor: (type) => newId(String(type), collectIds(dataRef.current)),
  }), [meta, model, issues, media, addMedia]);

  // ---- controllo dei problemi (con un piccolo ritardo, scartando le risposte superate) ------------------------------
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const r = await validateDocAction({ kind, key: docKey, data });
        if (n === seq.current) { setIssues(r.issues); setOthers(r.othersBlocking); }
      } catch { /* dati troppo incompleti per il controllo: si riprova alla prossima modifica */ }
      if (n === seq.current) setChecking(false);
    }, n === 1 ? 50 : 450);
    return () => clearTimeout(t);
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
    const t = setTimeout(async () => {
      try {
        const r = await previewDocAction({ kind, key: docKey, data, path: previewPath });
        if (n !== pseq.current) return;
        if (r?.error) setPreviewError(r.error); else if (r?.html) { setPreviewError(null); setHtml(r.html); }
      } catch (e) { if (n === pseq.current) setPreviewError('Anteprima non disponibile.'); }
    }, n === 1 ? 50 : 500);
    return () => clearTimeout(t);
  }, [data, kind, docKey, previewPath]);

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
      if (kind === 'page') return;                                   // la pagina in modifica resta quella mostrata
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
      setMsg({ tone: 'ok', text: r.changed ? 'Bozza salvata.' : 'Nessuna modifica da salvare.' });
    } else if (r.conflict === 'rev') {
      setConflict({ by: r.by });
      setMsg(null);
    } else setMsg({ tone: 'bad', text: r.conflict === 'deleted' ? 'Questo documento è stato eliminato.' : (r.error ?? 'Non salvato.') });
  });
  const publish = () => start(async () => {
    const r = await publishAction();
    if (r.ok) { setPub('clean'); setMsg({ tone: 'ok', text: r.nothing ? 'Niente da pubblicare.' : `Pubblicato: ${r.pages} pagine.` }); }
    else setMsg({ tone: 'bad', text: `${r.error}. Il sito online non è cambiato. ${(r.details ?? []).slice(0, 3).join(' · ')}` });
  });
  const remove = () => start(async () => {
    if (!window.confirm('Eliminare questa pagina? Sparirà dal sito alla prossima pubblicazione.')) return;
    const r = await deletePageAction(docKey);
    if (r.ok) { setSaved(JSON.stringify(data)); router.push('/admin/pages'); router.refresh(); }
    else setMsg({ tone: 'bad', text: r.refs?.length ? `${r.error} Usata da: ${r.refs.slice(0, 4).map((x) => `${x.kind === 'page' ? 'pagina ' + x.key : x.kind === 'site' ? 'dati del sito' : x.kind} (${x.why})`).join(', ')}.` : r.error });
  });

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const isDraftPage = kind === 'page' && data.status !== 'published';

  const body = kind === 'page' ? (
    <>
      <Section title="Impostazioni della pagina" open={docKey === 'home' ? false : data.blocks?.length === 0}>
        <Field schema={pageSchema} value={data} onChange={setData} path="" bare omit={['blocks', 'key']} />
      </Section>
      <section className="blocks">
        <h2>Blocchi della pagina</h2>
        <Field schema={pageSchema.properties.blocks} value={data.blocks} onChange={(blocks) => setData({ ...data, blocks: blocks ?? [] })} path="/blocks" label="" />
      </section>
    </>
  ) : kind === 'site' ? (
    Object.entries(siteSchema.properties).map(([k, ps]) => (
      <Section key={k} title={ps.title ?? meta.ui?.siteSections?.[k] ?? k} open={false}>
        <Field schema={ps} value={data[k]} onChange={(v) => setData({ ...data, [k]: v })} path={`/${k}`} bare />
      </Section>
    ))
  ) : (
    <Field schema={sharedSchema} value={data} onChange={setData} path="" bare />
  );

  return (
    <FormProvider value={ctx}>
      <div className="editor">
        <div className="editor__panel">
          <div className="editor__scroll">
            <div className="editor__title">
              <h1>{title}</h1>
              {kind === 'page' && <span className={`tag tag--${data.status === 'published' ? 'ok' : 'warn'}`}>{data.status === 'published' ? 'Pubblicata' : 'Bozza'}</span>}
              {kind === 'page' && <span className="muted keytag" title="La chiave identifica la pagina nei link e non si cambia">chiave: {docKey}</span>}
              {canDelete && <button type="button" className="mini mini--danger" onClick={remove} disabled={busy}>Elimina pagina</button>}
            </div>
            {isDraftPage && <p className="hint">Questa pagina è una bozza: non sarà online finché lo stato non è &quot;Pubblicata&quot;. I problemi qui sotto non bloccano la pubblicazione del resto del sito.</p>}
            {kind === 'shared' && <p className="hint">Blocchi definiti una volta e usati in più pagine (per esempio il nastro). Una modifica vale ovunque.</p>}
            {kind === 'site' && <p className="hint">Dati usati da tutto il sito: azienda, menu, footer, testi fissi. Le modifiche valgono in tutte le pagine.</p>}
            {body}
          </div>

          <div className="editor__bar">
            {(errors.length > 0 || warnings.length > 0 || others > 0) && (
              <p className="summary" role="status">
                {errors.length > 0 && <span className="bad">{errors.length} da sistemare</span>}
                {warnings.length > 0 && <span className="warn">{warnings.length} avvisi</span>}
                {others > 0 && <span className="muted">{others} in altri documenti</span>}
                {errors.length > 0 && !isDraftPage && <span className="muted">— prima di pubblicare</span>}
              </p>
            )}
            {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
            {conflict && <p className="notice notice--bad" role="alert">{conflict.by ?? 'Un altro utente'} ha modificato questo documento nel frattempo, quindi il salvataggio è bloccato per non sovrascrivere il suo lavoro. <button type="button" className="link" onClick={() => window.location.reload()}>Ricarica</button> per vedere le sue modifiche (perderai le tue non salvate).</p>}
            <div className="editor__actions">
              <span className="muted">{dirty ? 'Modifiche non salvate' : PUB[pub]}{checking ? ' · controllo…' : ''}</span>
              <button className="btn" disabled={!dirty || busy} onClick={() => { setData(JSON.parse(saved)); setMsg(null); }}>Annulla</button>
              <button className="btn" disabled={!dirty || busy || !!conflict} onClick={save}>Salva bozza</button>
              {canPublish && <button className="btn btn--primary" disabled={dirty || busy || pub === 'clean'} onClick={publish} title={dirty ? 'Salva prima la bozza' : ''}>Pubblica</button>}
            </div>
          </div>
        </div>

        <div className="editor__preview">
          <div className="preview__bar">
            {kind !== 'page' && (
              <select value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} aria-label="Pagina in anteprima">
                {meta.previewPages.map((p) => <option key={p.key} value={p.path}>{p.name}</option>)}
              </select>
            )}
            {kind === 'page' && <span className="muted">Anteprima di questa pagina, con le modifiche non ancora salvate</span>}
            <div className="seg">{Object.keys(DEVICES).map((d) => <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{d === 'desktop' ? 'Desktop' : 'Mobile'}</button>)}</div>
            <span className="muted">{Math.round(scale * 100)}%</span>
          </div>
          {previewError && <p className="notice notice--bad preview__error" role="alert">{previewError}</p>}
          <div className="preview__stage" ref={stage}>
            {html == null && !previewError && <p className="preview__loading">Caricamento dell'anteprima…</p>}
            <div style={{ width: W * scale, height: box.h - 24, margin: '0 auto', position: 'relative' }}>
              <iframe ref={frame} title="Anteprima della pagina" sandbox="allow-scripts" style={{ width: W, height: (box.h - 24) / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
            </div>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}

