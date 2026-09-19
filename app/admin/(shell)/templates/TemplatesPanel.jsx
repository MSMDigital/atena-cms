'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateTemplateAction, checkTemplateAction, removeTemplateAction } from './actions';

const ACTIONS = { 'template.install': 'Installato', 'template.install.failed': 'Installazione rifiutata', 'template.activate': 'Attivato', 'template.activate.failed': 'Attivazione fallita', 'template.remove': 'Tolto' };

export default function TemplatesPanel({ templates, events, maxMb, canUpload }) {
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
    if (!fd.get('file')?.size) { setUpload({ state: 'error', error: 'Scegli un file zip.' }); return; }
    setUpload({ state: 'busy' });
    let res; let json = null;
    try { res = await fetch('/admin/templates/upload', { method: 'POST', body: fd }); json = await res.json(); } catch { setUpload({ state: 'error', error: 'Connessione non riuscita.' }); return; }
    if (json?.ok) { setUpload({ state: 'ok', manifest: json.manifest, warnings: json.warnings ?? [], upgradedFrom: json.upgradedFrom, smoke: json.smoke }); form.current.reset(); router.refresh(); }
    else setUpload({ state: 'error', error: json?.error ?? 'Installazione non riuscita.', details: json?.details ?? [] });
  }

  const askActivate = (id) => start(async () => {
    setOpen(id); setPw(''); setMsg(null); setChoice('keep'); setCompat(null);
    setCompat(await checkTemplateAction(id));
  });
  const activate = (id) => start(async () => {
    const r = await activateTemplateAction({ id, content: compat?.docs ? choice : 'sample', password: pw });
    if (r.ok) { setOpen(null); setMsg({ ok: true, text: `Template attivato: sito pubblicato (${r.pages} pagine).${r.backup ? ' Copia dei contenuti precedenti salvata sul server.' : ''}` }); router.refresh(); }
    else setMsg({ ok: false, text: r.error, details: r.details });
  });
  const remove = (id) => start(async () => {
    const password = window.prompt('Per togliere il template conferma la tua password:');
    if (!password) return;
    const r = await removeTemplateAction({ id, password });
    setMsg(r.ok ? { ok: true, text: 'Template tolto (resta una copia nel cestino del server).' } : { ok: false, text: r.error });
    router.refresh();
  });

  return (
    <div className="tpl">
      {!hasActive && <p className="notice notice--warn" role="status">Nessun template attivo: installane uno e attivalo per avere un sito.</p>}
      {msg && <div className={`notice notice--${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}{msg.details?.length ? <ul>{msg.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}</div>}

      <section className="card">
        <h2>Installati</h2>
        {templates.length === 0 && <p className="muted">Nessun template installato.</p>}
        <ul className="tpl__list">
          {templates.map((t) => (
            <li key={t.id} className={`tpl__item${t.active ? ' tpl__item--on' : ''}`} data-id={t.id}>
              <div className="tpl__head">
                <strong>{t.name}</strong> <span className="muted">{t.id} · versione {t.version}</span>
                {t.active && <span className="tag tag--ok">Attivo</span>}
                {t.broken && <span className="tag tag--bad">Non valido</span>}
              </div>
              {t.description && <p className="tpl__desc">{t.description}</p>}
              {t.broken && <p className="bad">{t.broken}</p>}
              {t.author && <p className="hint">Autore: {t.author}</p>}
              {!t.active && !t.broken && (
                <div className="tpl__actions">
                  <button type="button" className="btn" disabled={busy} onClick={() => askActivate(t.id)}>Attiva…</button>
                  <button type="button" className="btn btn--danger" disabled={busy} onClick={() => remove(t.id)}>Togli</button>
                </div>
              )}
              {open === t.id && (
                <div className="tpl__confirm">
                  {compat === null ? <p className="muted">Controllo i contenuti attuali…</p> : compat.docs === 0 ? (
                    <p>Il sito non ha ancora contenuti: si installano quelli di esempio del template.</p>
                  ) : (
                    <fieldset>
                      <legend>Cosa fare dei contenuti attuali</legend>
                      <label className="check"><input type="radio" name="content" checked={choice === 'keep'} onChange={() => setChoice('keep')} /> Tenerli {compat.errorCount ? <span className="bad">(non compatibili: {compat.errorCount} problemi)</span> : <span className="ok">(compatibili)</span>}</label>
                      <label className="check"><input type="radio" name="content" checked={choice === 'sample'} onChange={() => setChoice('sample')} /> Sostituirli con quelli di esempio del template <span className="bad">(cancella pagine, dati del sito e stile; se ne salva una copia sul server)</span></label>
                      {choice === 'keep' && compat.errorCount > 0 && <ul className="bad">{compat.errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>}
                    </fieldset>
                  )}
                  <label className="fld"><span className="fld__label">La tua password, per confermare</span><input type="password" value={pw} autoComplete="current-password" onChange={(e) => setPw(e.target.value)} /></label>
                  <div className="tpl__actions">
                    <button type="button" className="btn btn--primary" disabled={busy || compat === null || !pw || (compat.docs > 0 && choice === 'keep' && compat.errorCount > 0)} onClick={() => activate(t.id)}>{busy ? 'Attivazione…' : 'Attiva e pubblica il sito'}</button>
                    <button type="button" className="btn" onClick={() => setOpen(null)}>Annulla</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!canUpload && <section className="card"><h2>Installa un template</h2><p className="hint">Il caricamento da zip è disattivato su questo server (<code>ALLOW_TEMPLATE_UPLOAD=0</code>): i template si installano copiando la cartella in <code>templates/</code>.</p></section>}
      {canUpload && <section className="card">
        <h2>Installa un template</h2>
        <p className="hint">File zip fino a {maxMb} MB. Il pacchetto viene controllato per intero e provato in un ambiente isolato prima di essere installato; il codice del template non può leggere il database, scrivere file o lanciare comandi. Installa solo template di cui ti fidi.</p>
        <form ref={form} onSubmit={send} className="tpl__form">
          <label className="fld"><span className="fld__label">File del template (.zip)</span><input type="file" name="file" accept=".zip,application/zip" required /></label>
          <label className="fld"><span className="fld__label">La tua password, per confermare</span><input type="password" name="password" autoComplete="current-password" required /></label>
          <label className="check"><input type="checkbox" name="again" value="1" /> Consenti la stessa versione o una precedente (reinstallazione)</label>
          <button className="btn btn--primary" disabled={upload.state === 'busy'}>{upload.state === 'busy' ? 'Controllo e prova in corso…' : 'Installa'}</button>
        </form>
        {upload.state === 'ok' && (
          <div className="notice notice--ok" role="status">
            Installato: <strong>{upload.manifest.name}</strong> {upload.manifest.version}{upload.upgradedFrom ? ` (aggiornato dalla ${upload.upgradedFrom})` : ''}. Prova di esecuzione: {upload.smoke?.pages} pagine rese. Ora puoi attivarlo.
            {upload.warnings.length > 0 && <details><summary>{upload.warnings.length} avvisi</summary><ul>{upload.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
          </div>
        )}
        {upload.state === 'error' && (
          <div className="notice notice--bad" role="alert">{upload.error}{upload.details?.length > 0 && <ul>{upload.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}</div>
        )}
      </section>}

      {events.length > 0 && (
        <section className="card">
          <h2>Ultime operazioni</h2>
          <ul className="plain">{events.map((e) => <li key={e.id}><span className="muted">{new Date(e.created_at).toLocaleString('it-CH', { timeZone: 'Europe/Zurich' })}</span> · {ACTIONS[e.action] ?? e.action}: {e.detail} <span className="muted">({e.by_name ?? '—'})</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
