'use client';

// Tag e categorie del blog: tabella con selezione, modifica rapida (nome e descrizione), eliminazione, e il modulo per aggiungerne di nuovi.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTermAction, deleteTermsAction } from './actions';
import { keyOf } from '@/schema/blog.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const STATE = { clean: null, modified: 'Modifiche non pubblicate: escono con «Pubblica»', unpublished: 'Non ancora pubblicato: esce con «Pubblica»' };

function EditRow({ row, labels, onDone }) {
  const t = useT();
  const [f, setF] = useState({ name: row.name, description: row.description });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const save = (e) => { e.preventDefault(); start(async () => { const r = await saveTermAction({ kind: labels.kind, key: row.key, ...f }); if (r.ok) onDone(true); else setMsg(t(r.error)); }); };
  return (
    <form className="qe" onSubmit={save}>
      <strong>{t('Modifica rapida')}</strong>
      <div className="qe__grid">
        <label>{t('Nome')}<input value={f.name} maxLength={60} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>{t('Indirizzo')}<input value={row.key} disabled /></label>
      </div>
      <label>{t('Descrizione')}<textarea rows={2} value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      {msg && <p className="notice notice--bad" role="alert">{msg}</p>}
      <div className="qe__actions"><button className="btn btn--primary" disabled={busy}>{busy ? t('Salvo…') : t('Aggiorna')}</button><button type="button" className="btn" onClick={() => onDone(false)}>{t('Annulla')}</button></div>
    </form>
  );
}

export default function TermsTable({ kind, labels: l, rows, state }) {
  const t = useT();
  const labels = { ...l, kind };
  const router = useRouter();
  const [sel, setSel] = useState([]);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({ name: '', description: '' });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const all = rows.length > 0 && sel.length === rows.length;
  const newKey = keyOf(f.name);
  const taken = !!newKey && rows.some((r) => r.key === newKey);
  const toggle = (k) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);

  const add = (e) => {
    e.preventDefault();
    start(async () => { const r = await saveTermAction({ kind, name: f.name, description: f.description }); if (r.ok) { setF({ name: '', description: '' }); setMsg({ tone: 'ok', text: t('{x} aggiunto.', { x: `${labels.one[0].toUpperCase()}${labels.one.slice(1)}` }) }); router.refresh(); } else setMsg({ tone: 'bad', text: t(r.error) }); });
  };
  const remove = (keys) => {
    if (!window.confirm(t('Eliminare {n} {what}? Verranno tolti anche dagli articoli che li usano.', { n: keys.length, what: keys.length === 1 ? labels.one : t('elementi') }))) return;
    start(async () => { const r = await deleteTermsAction({ kind, keys }); if (r.ok) { setSel(sel.filter((k) => !keys.includes(k))); setMsg({ tone: 'ok', text: t('Eliminato.') }); router.refresh(); } else setMsg({ tone: 'bad', text: t(r.error) }); });
  };

  return (
    <main className="page">
      <div className="page__head"><h1>{labels.many}</h1></div>
      <p className="hint">{labels.hint}</p>
      {STATE[state] && <p className="notice notice--warn" role="status">{t(STATE[state])}.</p>}
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
      <div className="terms">
        <form className="card terms__add" onSubmit={add}>
          <h2>{labels.add}</h2>
          <label>{t('Nome')}<input value={f.name} maxLength={60} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>{t('Descrizione (facoltativa)')}<textarea rows={3} value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          {newKey && <p className="fld__help">{taken ? t("Esiste già: l'indirizzo «{x}» è già usato.", { x: newKey }) : <>{t('Indirizzo della pagina:')} <code>{newKey}</code></>}</p>}
          <button className="btn btn--primary" disabled={busy || !newKey || taken}>{labels.add}</button>
        </form>
        <section className="card terms__list">
          {sel.length > 0 && (
            <div className="bulkbar" role="toolbar" aria-label={t('Azioni sugli elementi selezionati')}>
              <strong>{sel.length === 1 ? t('1 selezionato') : t('{n} selezionati', { n: sel.length })}</strong>
              <button type="button" className="btn btn--danger" disabled={busy} onClick={() => remove(sel)}>{t('Elimina')}</button>
              <button type="button" className="link" onClick={() => setSel([])}>{t('Deseleziona')}</button>
            </div>
          )}
          <table className="table table--posts">
            <thead><tr><th className="col-check"><input type="checkbox" checked={all} aria-label={t('Seleziona tutti')} onChange={() => setSel(all ? [] : rows.map((r) => r.key))} /></th><th>{t('Nome')}</th><th>{t('Descrizione')}</th><th>{t('Indirizzo')}</th><th>{t('Articoli')}</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="muted">{t('Nessun elemento: aggiungine uno.')}</td></tr>}
              {rows.map((r) => (editing === r.key ? (
                <tr key={r.key} className="is-editing"><td colSpan={5}><EditRow row={r} labels={labels} onDone={(saved) => { setEditing(null); if (saved) router.refresh(); }} /></td></tr>
              ) : (
                <tr key={r.key} className={sel.includes(r.key) ? 'is-selected' : undefined}>
                  <td className="col-check"><input type="checkbox" checked={sel.includes(r.key)} aria-label={t('Seleziona {x}', { x: r.name })} onChange={() => toggle(r.key)} /></td>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="rowactions">
                      <button type="button" className="link" onClick={() => setEditing(r.key)}>{t('Modifica rapida')}</button>
                      <button type="button" className="link link--danger" disabled={busy} onClick={() => remove([r.key])}>{t('Elimina')}</button>
                    </div>
                  </td>
                  <td className="muted">{r.description || '—'}</td>
                  <td className="muted"><code>{r.key}</code></td>
                  <td className="muted">{r.count}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
