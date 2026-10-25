'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateTemplateAction, checkTemplateAction, removeTemplateAction } from './actions';
import { formatStamp } from '@/render/format.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const ACTIONS = { 'template.install': 'Installato', 'template.install.failed': 'Installazione rifiutata', 'template.activate': 'Attivato', 'template.activate.failed': 'Attivazione fallita', 'template.remove': 'Tolto' };

// Anteprima della home del template, coi SUOI contenuti di esempio (mai il database: un template appena caricato non ha ancora documenti).
// L'HTML lo scarica questa pagina, con la sessione (fetch, non un indirizzo diretto), e lo passa a un iframe sandbox="allow-scripts" senza
// same-origin, come l'anteprima dello stile e dei contenuti: il codice del template non tocca né l'admin né i suoi cookie.
function TemplateThumb({ id, broken }) {
  const frame = useRef(null);
  const [state, setState] = useState(broken ? 'error' : 'loading');
  useEffect(() => {
    if (broken) return undefined;
    let stale = false;
    setState('loading');
    fetch(`/admin/templates/preview/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((html) => { if (!stale && frame.current) { frame.current.srcdoc = html; setState('ok'); } })
      .catch(() => { if (!stale) setState('error'); });
    return () => { stale = true; };
  }, [id, broken]);
  return (
    <div className={`tpl__thumb${state === 'ok' ? ' tpl__thumb--ok' : ''}`} aria-hidden="true">
      {state !== 'ok' && <span className="tpl__thumb-ph">{state === 'loading' ? '…' : '—'}</span>}
      {!broken && <iframe ref={frame} tabIndex={-1} sandbox="allow-scripts" title="" width="1400" height="900" />}
    </div>
  );
}

export default function TemplatesPanel({ templates, events, maxMb, canUpload, general = {} }) {
  const tr = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [upload, setUpload] = useState({ state: 'idle' });
  const [open, setOpen] = useState(null);           // id del template di cui si sta chiedendo l'attivazione
  const [compat, setCompat] = useState(null);
  const [choice, setChoice] = useState('keep');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null);
  const form = useRef(null);
  const hasActive = templates.some((t) => t.active);

  async function send(e) {
    e.preventDefault();
    const fd = new FormData(form.current);
    if (!fd.get('file')?.size) { setUpload({ state: 'error', error: tr('Scegli un file zip.') }); return; }
    setUpload({ state: 'busy' });
    let res; let json = null;
    try { res = await fetch('/admin/templates/upload', { method: 'POST', body: fd }); json = await res.json(); } catch { setUpload({ state: 'error', error: tr('Connessione non riuscita.') }); return; }
    if (json?.ok) { setUpload({ state: 'ok', manifest: json.manifest, warnings: json.warnings ?? [], upgradedFrom: json.upgradedFrom, smoke: json.smoke }); form.current.reset(); router.refresh(); }
    else setUpload({ state: 'error', error: json?.error ?? tr('Installazione non riuscita.'), details: json?.details ?? [] });
  }

  const askActivate = (id) => start(async () => {
    setOpen(id); setPw(''); setMsg(null); setChoice('keep'); setCompat(null);
    setCompat(await checkTemplateAction(id));
  });
  const activate = (id) => start(async () => {
    const r = await activateTemplateAction({ id, content: compat?.docs ? choice : 'sample', password: pw });
    if (r.ok) { setOpen(null); setMsg({ ok: true, text: `${tr('Template attivato: sito pubblicato ({n} pagine).', { n: r.pages })}${r.backup ? ` ${tr('Copia dei contenuti precedenti salvata sul server.')}` : ''}` }); router.refresh(); }
    else setMsg({ ok: false, text: r.error, details: r.details });
  });
  const remove = (id) => start(async () => {
    const password = window.prompt(tr('Per togliere il template conferma la tua password:'));
    if (!password) return;
    const r = await removeTemplateAction({ id, password });
    setMsg(r.ok ? { ok: true, text: tr('Template tolto (resta una copia nel cestino del server).') } : { ok: false, text: r.error });
    router.refresh();
  });

  return (
    <div className="tpl">
      {!hasActive && <p className="notice notice--warn" role="status">{tr('Nessun template attivo: installane uno e attivalo per avere un sito.')}</p>}
      {msg && <div className={`notice notice--${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}{msg.details?.length ? <ul>{msg.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}</div>}

      <section className="card">
        <h2>{tr('Installati')}</h2>
        {templates.length === 0 && <p className="muted">{tr('Nessun template installato.')}</p>}
        <ul className="tpl__list">
          {templates.map((t) => (
            <li key={t.id} className={`tpl__item${t.active ? ' tpl__item--on' : ''}`} data-id={t.id}>
              <div className="tpl__head">
                <TemplateThumb id={t.id} broken={!!t.broken} />
                <strong>{t.name}</strong> <span className="muted">{t.id} · {tr('versione {v}', { v: t.version })}</span>
                {t.active && <span className="tag tag--ok">{tr('Attivo')}</span>}
                {t.broken && <span className="tag tag--bad">{tr('Non valido')}</span>}
              </div>
              {t.description && <p className="tpl__desc">{t.description}</p>}
              {t.broken && <p className="bad">{t.broken}</p>}
              {t.author && <p className="hint">{tr('Autore')}: {t.author}</p>}
              {!t.active && !t.broken && (
                <div className="tpl__actions">
                  <button type="button" className="btn" disabled={busy} onClick={() => askActivate(t.id)}>{tr('Attiva…')}</button>
                  <button type="button" className="btn btn--danger" disabled={busy} onClick={() => remove(t.id)}>{tr('Togli')}</button>
                </div>
              )}
              {open === t.id && (
                <div className="tpl__confirm">
                  {compat === null ? <p className="muted">{tr('Controllo i contenuti attuali…')}</p> : compat.docs === 0 ? (
                    <p>{tr('Il sito non ha ancora contenuti: si installano quelli di esempio del template.')}</p>
                  ) : (
                    <fieldset>
                      <legend>{tr('Cosa fare dei contenuti attuali')}</legend>
                      <label className="check"><input type="radio" name="content" checked={choice === 'keep'} onChange={() => setChoice('keep')} /> {tr('Tenerli')} {compat.errorCount ? <span className="bad">({tr('non compatibili: {n} problemi', { n: compat.errorCount })})</span> : <span className="ok">({tr('compatibili')})</span>}</label>
                      <label className="check"><input type="radio" name="content" checked={choice === 'sample'} onChange={() => setChoice('sample')} /> {tr('Sostituirli con quelli di esempio del template')} <span className="bad">({tr('cancella pagine, dati del sito e stile; se ne salva una copia sul server')})</span></label>
                      {choice === 'keep' && compat.errorCount > 0 && <ul className="bad">{compat.errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>}
                    </fieldset>
                  )}
                  <label className="fld"><span className="fld__label">{tr('La tua password, per confermare')}</span><input type="password" value={pw} autoComplete="current-password" onChange={(e) => setPw(e.target.value)} /></label>
                  <div className="tpl__actions">
                    <button type="button" className="btn btn--primary" disabled={busy || compat === null || !pw || (compat.docs > 0 && choice === 'keep' && compat.errorCount > 0)} onClick={() => activate(t.id)}>{busy ? tr('Attivazione…') : tr('Attiva e pubblica il sito')}</button>
                    <button type="button" className="btn" onClick={() => setOpen(null)}>{tr('Annulla')}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!canUpload && <section className="card"><h2>{tr('Installa un template')}</h2><p className="hint">{tr('Il caricamento da zip è disattivato su questo server (')}<code>ALLOW_TEMPLATE_UPLOAD=0</code>{tr('): i template si installano copiando la cartella in')} <code>templates/</code>.</p></section>}
      {canUpload && <section className="card">
        <h2>{tr('Installa un template')}</h2>
        <p className="hint">{tr('File zip fino a {maxMb} MB. Il pacchetto viene controllato per intero e provato in un ambiente isolato prima di essere installato; il codice del template non può leggere il database, scrivere file o lanciare comandi. Installa solo template di cui ti fidi.', { maxMb })}</p>
        <form ref={form} onSubmit={send} className="tpl__form">
          <label className="fld"><span className="fld__label">{tr('File del template (.zip)')}</span><input type="file" name="file" accept=".zip,application/zip" required /></label>
          <label className="fld"><span className="fld__label">{tr('La tua password, per confermare')}</span><input type="password" name="password" autoComplete="current-password" required /></label>
          <label className="check"><input type="checkbox" name="again" value="1" /> {tr('Consenti la stessa versione o una precedente (reinstallazione)')}</label>
          <button className="btn btn--primary" disabled={upload.state === 'busy'}>{upload.state === 'busy' ? tr('Controllo e prova in corso…') : tr('Installa')}</button>
        </form>
        {upload.state === 'ok' && (
          <div className="notice notice--ok" role="status">
            {tr('Installato:')} <strong>{upload.manifest.name}</strong> {upload.manifest.version}{upload.upgradedFrom ? ` (${tr('aggiornato dalla {v}', { v: upload.upgradedFrom })})` : ''}. {tr('Prova di esecuzione: {n} pagine rese. Ora puoi attivarlo.', { n: upload.smoke?.pages })}
            {upload.warnings.length > 0 && <details><summary>{tr('{n} avvisi', { n: upload.warnings.length })}</summary><ul>{upload.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
          </div>
        )}
        {upload.state === 'error' && (
          <div className="notice notice--bad" role="alert">{upload.error}{upload.details?.length > 0 && <ul>{upload.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}</div>
        )}
      </section>}

      {events.length > 0 && (
        <section className="card">
          <h2>{tr('Ultime operazioni')}</h2>
          <ul className="plain">{events.map((e) => <li key={e.id}><span className="muted">{formatStamp(e.created_at, general)}</span> · {ACTIONS[e.action] ? tr(ACTIONS[e.action]) : e.action}: {e.detail} <span className="muted">({e.by_name ?? '—'})</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
