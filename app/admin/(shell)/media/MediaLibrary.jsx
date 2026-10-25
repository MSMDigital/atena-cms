'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Uploader from './Uploader';
import ImageEditor from './ImageEditor';
import { uploadFile } from './upload';
import { useT, useLang } from '@/app/admin/_i18n/I18nProvider';
import { langName } from '@/render/locales.mjs';
import { updateMetaAction, editImageAction, renameMediaAction, deleteMediaAction, usageAction } from './actions';

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const DOC_LABEL = { page: 'Pagina', shared: 'Blocchi condivisi', post: 'Articolo', categories: 'Categorie', tags: 'Tag', headers: 'Header', footers: 'Footer', site: 'Dati del sito' };
const docHref = (u) => (u.kind === 'page' ? `/admin/pages/${u.key}` : u.kind === 'shared' ? '/admin/shared' : u.kind === 'post' ? `/admin/posts/${u.key}` : u.kind === 'headers' ? '/admin/headers' : u.kind === 'footers' ? '/admin/footers' : '/admin/site');

const thumb = (i, w) => `/admin/media/thumb/${i.path}?v=${i.mtime ?? 0}${w ? `&w=${w}` : ''}`;

// Finestra modale (come il selettore delle immagini): tutto ciò che riguarda un'immagine sta qui, non in una colonna a lato.
function Modal({ title, onClose, children }) {
  const t = useT();
  // Si apre alla creazione dell'elemento e NON si ascolta l'evento «close»: in sviluppo React monta, smonta e rimonta ogni componente, e il
  // «close» di una chiusura intermedia arrivava dopo la riapertura e richiudeva subito la finestra. Esc e clic fuori chiamano onClose a mano.
  const open = (d) => { if (d && !d.open) d.showModal(); };
  return (
    <dialog ref={open} className="picker picker--edit picker--media" aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="picker__box">
        <div className="picker__head"><h2>{title}</h2><button type="button" className="mini" onClick={onClose}>{t('Chiudi')}</button></div>
        {children}
      </div>
    </dialog>
  );
}

export default function MediaLibrary({ initial, maxMb, siteUrl = '', userId = null, isAdmin = false, langs = ['it'], baseLang = 'it' }) {
  const t = useT();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const shown = useMemo(() => items.filter((i) => !q || `${i.path} ${i.name} ${i.alt} ${i.title} ${i.caption} ${i.description}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const current = items.find((i) => i.path === sel) ?? null;

  const add = (item) => { setItems((cur) => [item, ...cur.filter((i) => i.path !== item.path)]); setSel(item.path); };
  const patch = (path, part) => setItems((cur) => cur.map((i) => (i.path === path ? { ...i, ...part } : i)));
  const renamed = (item, oldPath) => { setItems((cur) => cur.map((i) => (i.path === oldPath ? item : i))); setSel(item.path); };
  const remove = (path) => { setItems((cur) => cur.filter((i) => i.path !== path)); setSel(null); };

  return (
    <div className="mlib">
      <section className="card">
        <Uploader onItem={add} maxMb={maxMb} />
      </section>
      <section className="card mlib__list">
        <div className="mlib__bar">
          <input type="search" placeholder={t('Cerca per nome, titolo o testo alternativo')} aria-label={t('Cerca immagini')} value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{shown.length === 1 ? t('1 immagine') : t('{n} immagini', { n: shown.length })}</span>
        </div>
        {shown.length === 0 && <p className="muted">{t('Nessuna immagine trovata.')}</p>}
        <ul className="mgrid mgrid--lib">
          {shown.map((i) => (
            <li key={i.path}>
              <button type="button" className={`mcell${sel === i.path ? ' mcell--sel' : ''}`} onClick={() => setSel(i.path)} aria-haspopup="dialog" data-path={i.path} title={t('Apri i dettagli')}>
                {i.missing ? <span className="mcell__missing">{t('File mancante')}</span> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb(i)} alt="" loading="lazy" />}
                <span className="mcell__name">{i.title || i.name}</span>
                {i.source === 'upload' && <span className="tag">{t('Caricata')}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {current && (
        <Modal title={current.title || current.name} onClose={() => setSel(null)}>
          <Detail key={current.path} item={current} canEdit={isAdmin || (current.source === 'upload' && current.uploadedBy === userId)} siteUrl={siteUrl} maxMb={maxMb} langs={langs} baseLang={baseLang} onPatch={(part) => patch(current.path, part)} onNew={add} onRenamed={(item) => renamed(item, current.path)} onRemoved={() => remove(current.path)} />
        </Modal>
      )}
    </div>
  );
}

const FIELDS = ['title', 'alt', 'caption', 'description'];

// I dettagli di una lingua: la lingua di base sta nelle colonne dell'immagine, le altre in item.i18n.
const metaOf = (item, lang, baseLang) => Object.fromEntries(FIELDS.map((k) => [k, (lang === baseLang ? item[k] : item.i18n?.[lang]?.[k]) ?? '']));

function Detail({ item, canEdit, siteUrl, maxMb, langs, baseLang, onPatch, onNew, onRenamed, onRemoved }) {
  const t = useT();
  const cmsLang = useLang();
  const usedIn = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));
  const [lang, setLang] = useState(baseLang);   // la scheda della lingua aperta
  const [fs, setFs] = useState(() => Object.fromEntries(langs.map((l) => [l, metaOf(item, l, baseLang)])));
  const f = fs[lang];
  const [usage, setUsage] = useState(null);
  const [msg, setMsg] = useState(null);
  const [asked, setAsked] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const ext = item.path.slice(item.path.lastIndexOf('.'));
  const [fname, setFname] = useState(item.path.slice(item.path.lastIndexOf('/') + 1, item.path.lastIndexOf('.')));
  const [view, setView] = useState('details');   // 'details' | 'edit'
  const [busy, setBusy] = useState(false);
  const upload = item.source === 'upload' && canEdit;   // chi non l'ha caricata (e non è admin) può solo usarla; di una copia modificata invece sì
  const svg = item.path.toLowerCase().endsWith('.svg');
  const dirty = langs.some((l) => FIELDS.some((k) => fs[l][k].trim() !== metaOf(item, l, baseLang)[k]));
  const rel = `/assets/img/${item.path}`;
  const full = `${siteUrl.replace(/\/$/, '')}${rel}`;

  useEffect(() => {
    let live = true;
    usageAction(item.path).then((u) => { if (live) setUsage(u); }).catch(() => { if (live) setUsage([]); });
    return () => { live = false; };
  }, [item.path]);

  async function save() {
    const clean = Object.fromEntries(langs.map((l) => [l, Object.fromEntries(FIELDS.map((k) => [k, fs[l][k].trim()]))]));
    const i18n = Object.fromEntries(langs.filter((l) => l !== baseLang).map((l) => [l, clean[l]]));
    const r = await updateMetaAction(item.path, { ...clean[baseLang], i18n });
    const patch = { ...clean[baseLang], i18n: Object.fromEntries(Object.entries(i18n).map(([l, m]) => [l, Object.fromEntries(Object.entries(m).filter(([, v]) => v))]).filter(([, m]) => Object.keys(m).length)) };
    if (r.ok) { setFs(Object.fromEntries(langs.map((l) => [l, metaOf({ ...item, ...patch }, l, baseLang)]))); onPatch(patch); setMsg({ ok: true, text: t('Dettagli salvati.') }); } else setMsg({ ok: false, text: t('Non è stato possibile salvarli.') });
  }
  async function del() {
    const r = await deleteMediaAction(item.path);
    if (r.ok) onRemoved(); else { setAsked(false); setMsg({ ok: false, text: r.error }); if (r.usage) setUsage(r.usage); }
  }
  async function rename() {
    const used = usage?.length ? ` ${usedIn(usage.length, 'Viene usata in 1 punto: si aggiornano da soli.', 'Viene usata in {n} punti: si aggiornano da soli.')}` : '';
    if (!window.confirm(`${t('Rinominare il file in «{name}»?', { name: `${fname}${ext}` })}${used} ${t('Il sito già online usa il nome vecchio fino alla prossima pubblicazione.')}`)) return;
    setBusy(true); setMsg(null);
    const r = await renameMediaAction(item.path, fname);
    setBusy(false);
    if (r.ok) onRenamed(r.item); else setMsg({ ok: false, text: r.error });
  }
  async function replaceWith(file) {
    if (!file) return;
    const used = usage?.length ? ` ${usedIn(usage.length, 'Viene usata in 1 punto: cambierà ovunque.', 'Viene usata in {n} punti: cambierà ovunque.')}` : '';
    if (!window.confirm(`${t('Sostituire «{from}» con «{to}»?', { from: item.name, to: file.name })} ${t('L\'indirizzo resta lo stesso.')}${used}`)) return;
    setBusy(true); setMsg(null);
    const r = await uploadFile(file, { replace: item.path, t });
    setBusy(false);
    if (r.ok) { onPatch(r.item); setMsg({ ok: true, text: t('Immagine sostituita.') }); } else setMsg({ ok: false, text: r.error });
  }
  async function apply(params, mode) {
    if (mode === 'replace' && !window.confirm(`${t('Cambiare questa immagine?')} ${usage?.length ? usedIn(usage.length, 'Viene usata in 1 punto e cambierà ovunque.', 'Viene usata in {n} punti e cambierà ovunque.') : t('Non è usata in nessuna pagina.')}`)) return false;
    setBusy(true); setMsg(null);
    const r = await editImageAction(item.path, { ...params, mode });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return false; }
    setView('details');
    if (mode === 'replace') { onPatch(r.item); setMsg({ ok: true, text: t('Immagine modificata.') }); } else { onNew(r.item); }
    return true;
  }
  const copy = (text) => { try { navigator.clipboard.writeText(text); setMsg({ ok: true, text: t('Indirizzo copiato.') }); } catch { setMsg({ ok: false, text: t('Copia non riuscita: selezionalo e copialo a mano.') }); } };
  const set = (k) => (e) => setFs({ ...fs, [lang]: { ...fs[lang], [k]: e.target.value } });

  if (view === 'edit') {
    return (
      <div className="mdet mdet--edit">
        <button type="button" className="link" onClick={() => { setMsg(null); setView('details'); }}>{t('← Torna ai dettagli')}</button>
        {msg && !msg.ok && <p className="notice notice--bad" role="alert">{msg.text}</p>}
        <ImageEditor key={item.mtime} item={item} src={thumb(item, 1200)} canReplace={upload} busy={busy} onApply={apply} />
      </div>
    );
  }

  return (
    <div className="mdet mdet--modal">
      <div className="mdet__left">
      {item.missing ? <p className="mdet__missing">{t('Il file non si trova più sul server.')}</p> : /* eslint-disable-next-line @next/next/no-img-element */ <img className="mdet__img" src={thumb(item)} alt="" />}
      <p className="mdet__name muted">{item.name}</p>
      <dl className="mdet__meta">
        <dt>{t('Percorso')}</dt><dd><code>{item.path}</code></dd>
        <dt>{t('Dimensioni')}</dt><dd>{item.width && item.height ? `${item.width} × ${item.height} px` : '—'}, {kb(item.bytes ?? 0)}</dd>
        <dt>{t('Origine')}</dt><dd>{item.source === 'upload' ? t('Caricata dall\'admin') : t('Nel progetto')}</dd>
      </dl>

      <div className="mdet__sec">
        <h3>{t('Dove è usata')}</h3>
        {usage === null ? <p className="muted">{t('Controllo…')}</p> : usage.length === 0 ? <p className="muted">{t('In nessuna pagina.')}</p> : (
          <ul className="plain">
            {usage.map((u) => (
              <li key={`${u.kind}:${u.key}`}><Link href={docHref(u)}>{t(DOC_LABEL[u.kind])}{u.kind === 'page' || u.kind === 'post' ? `: ${u.key}` : ''}</Link>{' '}
                <span className="muted">{u.online && u.inDraft ? t('(online e in bozza)') : u.online ? t('(solo online)') : t('(solo in bozza)')}</span></li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
      {upload ? (
        asked ? (
          <div className="mdet__confirm"><span>{t('Eliminare definitivamente?')}</span> <button type="button" className="btn btn--danger" onClick={del}>{t('Sì, elimina')}</button> <button type="button" className="btn" onClick={() => setAsked(false)}>{t('Annulla')}</button></div>
        ) : <button type="button" className="btn btn--danger" disabled={!!usage?.length} title={usage?.length ? t('È ancora usata: toglila dalle pagine prima di eliminarla.') : undefined} onClick={() => setAsked(true)}>{t('Elimina')}</button>
      ) : <span className="fld__help">{item.source === 'upload' ? t('Questa immagine l\'ha caricata un altro utente: non la puoi eliminare.') : t('Le immagini del progetto non si eliminano da qui.')}</span>}
      </div>
      <div className="mdet__right">
      <div className="fld">
        <label className="fld__label" htmlFor="mdet-fname">{t('Nome del file')}</label>
        {upload ? (
          <>
            <span className="mdet__copy">
              <input id="mdet-fname" value={fname} maxLength={60} onChange={(e) => setFname(e.target.value)} aria-describedby="mdet-fname-help" />
              <span className="mdet__ext">{ext}</span>
              <button type="button" className="btn" disabled={busy || !fname.trim() || `${fname}${ext}` === item.path.slice(item.path.lastIndexOf('/') + 1)} onClick={rename}>{t('Rinomina')}</button>
            </span>
            <span id="mdet-fname-help" className="fld__help">{t('Lettere minuscole, numeri e trattini: il resto viene sistemato da solo. Pagine e articoli che usano l\'immagine si aggiornano. Cambia anche l\'indirizzo (URL).')}</span>
          </>
        ) : <span className="fld__help">{item.source === 'upload' ? t('Questa immagine l\'ha caricata un altro utente: non puoi cambiarne il nome.') : t('Le immagini del progetto stanno nel repository del template: il nome si cambia lì.')}</span>}
      </div>
      {langs.length > 1 && (
        <div className="langtabs" role="tablist" aria-label={t('Lingua dei dettagli')}>
          {langs.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={lang === l} className={`langtab${lang === l ? ' is-on' : ''}`} onClick={() => setLang(l)}>
              {langName(l, cmsLang)}<span className={`langtab__dot langtab__dot--${FIELDS.some((k) => fs[l][k].trim()) ? 'on' : 'draft'}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <label className="fld"><span className="fld__label">{t('Titolo')}</span><input value={f.title} maxLength={200} onChange={set('title')} disabled={!canEdit} /></label>
      <label className="fld">
        <span className="fld__label">{t('Testo alternativo')}</span>
        <input value={f.alt} maxLength={300} onChange={set('alt')} placeholder={t('Cosa mostra l\'immagine')} disabled={!canEdit} />
        <span className="fld__help">{t('Viene proposto quando inserisci l\'immagine in una pagina; in ogni pagina puoi cambiarlo.')}</span>
      </label>
      <label className="fld"><span className="fld__label">{t('Didascalia')}</span><textarea rows={2} value={f.caption} maxLength={500} onChange={set('caption')} disabled={!canEdit} /></label>
      <label className="fld"><span className="fld__label">{t('Descrizione')}</span><textarea rows={3} value={f.description} maxLength={2000} onChange={set('description')} disabled={!canEdit} /></label>
      {canEdit ? <button type="button" className="btn btn--primary" disabled={!dirty} onClick={save}>{t('Salva dettagli')}</button> : <span className="fld__help">{t('Questa immagine non l\'hai caricata tu: puoi usarla e salvarne una copia ritagliata, ma non modificarne i dati.')}</span>}

      <div className="mdet__sec">
        <h3>{t('Indirizzo (URL)')}</h3>
        <button type="button" className="btn" aria-expanded={showUrl} onClick={() => setShowUrl(!showUrl)}>{showUrl ? t('Nascondi URL') : t('Mostra URL')}</button>
        {showUrl && (
          <div className="mdet__url">
            <label className="fld"><span className="fld__label">{t('Nel sito')}</span><span className="mdet__copy"><input readOnly value={rel} onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={() => copy(rel)}>{t('Copia')}</button></span></label>
            {siteUrl && <label className="fld"><span className="fld__label">{t('Completo')}</span><span className="mdet__copy"><input readOnly value={full} onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={() => copy(full)}>{t('Copia')}</button></span></label>}
            <span className="fld__help">{t('L\'immagine è online solo se è usata in una pagina o in un articolo pubblicati: il sito pubblica soltanto i file che usa.')}</span>
          </div>
        )}
      </div>

      <div className="mdet__sec">
        <h3>{t('Sostituisci l\'immagine')}</h3>
        {upload ? (
          <>
            <input type="file" accept={svg ? 'image/svg+xml' : 'image/jpeg,image/png,image/webp'} disabled={busy} aria-label={t('Scegli il nuovo file')} onChange={(e) => { replaceWith(e.target.files?.[0]); e.target.value = ''; }} />
            <span className="fld__help">{t('Il file nuovo prende il posto di questo e mantiene lo stesso indirizzo: le pagine che lo usano si aggiornano da sole. Massimo {maxMb} MB.', { maxMb })}</span>
          </>
        ) : <span className="fld__help">{item.source === 'upload' ? t('Questa immagine l\'ha caricata un altro utente: non la puoi sostituire.') : t('Le immagini del progetto stanno nel repository del template: si sostituiscono lì.')} {t('Puoi però salvarne una copia ritagliata.')}</span>}
      </div>

      <div className="mdet__sec">
        <h3>{t('Modifica l\'immagine')}</h3>
        {svg ? <span className="fld__help">{t('Gli SVG sono vettoriali: non si ritagliano né si ridimensionano.')}</span> : item.missing || !item.width || !item.height ? <span className="fld__help">{t('Non disponibile: manca il file o le dimensioni.')}</span> : (
          <>
            <button type="button" className="btn" onClick={() => { setMsg(null); setView('edit'); }}>{t('Ritaglia o ridimensiona…')}</button>
          </>
        )}
      </div>

      </div>
    </div>
  );
}
