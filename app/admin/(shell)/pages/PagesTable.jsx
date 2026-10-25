'use client';

// Elenco delle pagine: selezione per le azioni di massa, modifica rapida (nome, titolo e descrizione SEO, indirizzo, autore, stato) e semaforo SEO / GEO.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { quickEditPageAction, bulkPagesAction } from '../_editor/actions';
import { useLangName, Light, AuthorSelect, SlugField, Versions, quickEditMessage, bulkMessage } from '../_editor/TableParts';

function Counter({ n, lo, hi }) {
  const t = useT();
  return <span className={n === 0 || n < lo || n > hi ? 'count count--warn' : 'count count--ok'}>{t('{n} caratteri (ideale {lo}–{hi})', { n, lo, hi })}</span>;
}

function QuickEdit({ row, locales, authors, isAdmin, onDone }) {
  const t = useT();
  const name = useLangName();
  const home = row.key === 'home';
  const [f, setF] = useState({ name: row.name, title: row.title, description: row.description, author: row.author, slug: { ...row.slug }, status: row.status });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const save = (e) => {
    e.preventDefault();
    start(async () => { const r = await quickEditPageAction({ key: row.key, ...f }); if (r.ok) onDone(true, quickEditMessage(r, t)); else setMsg(r.error); });
  };
  return (
    <form className="qe" onSubmit={save}>
      <strong>{t('Modifica rapida')}</strong>
      <div className="qe__grid">
        <label>{t('Nome')}<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        {isAdmin && <label>{t('Autore')}<AuthorSelect value={f.author} authors={authors} onChange={(v) => setF({ ...f, author: v })} /></label>}
        {!home && locales.map((l, i) => (
          <SlugField key={l} label={`${t('Indirizzo')}${locales.length > 1 ? ` (${name(l)})` : ''}`} value={f.slug[l] ?? ''} onChange={(v) => setF({ ...f, slug: { ...f.slug, [l]: v } })}
            source={f.name} base={i === 0 ? row.base : null} taken={row.taken?.[l] ?? []} original={row.slug[l] ?? ''} required online={row.online} />
        ))}
        <label>{t('Stato')}
          <select value={f.status} disabled={home} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="published">{t('Pubblicata')}</option><option value="draft">{t('Bozza')}</option>
          </select>
        </label>
      </div>
      <label>{t('Titolo SEO')} <Counter n={f.title.length} lo={20} hi={65} /><input value={f.title} maxLength={300} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label>{t('Descrizione SEO')} <Counter n={f.description.length} lo={70} hi={170} /><textarea rows={2} value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      {msg && <p className="notice notice--bad" role="alert">{msg}</p>}
      <div className="qe__actions"><button className="btn btn--primary" disabled={busy}>{busy ? (isAdmin ? t('Pubblico…') : t('Salvo…')) : isAdmin ? t('Aggiorna e pubblica') : t('Salva bozza')}</button><button type="button" className="btn" onClick={() => onDone(false)}>{t('Annulla')}</button></div>
    </form>
  );
}

function BulkEdit({ keys, authors, isAdmin, onClose, run, busy }) {
  const t = useT();
  const [s, setS] = useState({ status: '', author: '' });
  return (
    <form className="qe" onSubmit={(e) => { e.preventDefault(); run({ keys, action: 'edit', set: { ...s, status: s.status || undefined } }); }}>
      <strong>{keys.length === 1 ? t('Modifica di massa: 1 pagina') : t('Modifica di massa: {n} pagine', { n: keys.length })}</strong>
      <div className="qe__grid">
        <label>{t('Stato')}
          <select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}>
            <option value="">{t('— nessuna modifica —')}</option><option value="published">{t('Pubblicata')}</option><option value="draft">{t('Bozza')}</option>
          </select>
        </label>
        {isAdmin && <label>{t('Autore')}<AuthorSelect value={s.author} authors={authors} keepEmpty="— nessuna modifica —" onChange={(v) => setS({ ...s, author: v })} /></label>}
      </div>
      <div className="qe__actions"><button className="btn btn--primary" disabled={busy}>{busy ? t('Salvo…') : isAdmin ? t('Aggiorna e pubblica') : t('Aggiorna')}</button><button type="button" className="btn" onClick={onClose}>{t('Annulla')}</button></div>
    </form>
  );
}

export default function PagesTable({ rows, locales, baseLang, authors, isAdmin, filtered }) {
  const t = useT();
  const router = useRouter();
  const [sel, setSel] = useState([]);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (k) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);

  const run = (input) => {
    if (input.action === 'trash' && !window.confirm(input.keys.length === 1 ? t('Spostare nel cestino 1 pagina? Si possono ripristinare.') : t('Spostare nel cestino {n} pagine? Si possono ripristinare.', { n: input.keys.length }))) return;
    start(async () => {
      const r = await bulkPagesAction(input);
      if (r.ok) {
        setMsg(bulkMessage(r, input.action === 'trash' ? 'nel cestino' : 'aggiornate', t)); setSel([]); setBulk(false); router.refresh();
      } else setMsg({ tone: 'bad', text: t(r.error) });
    });
  };

  return (
    <section className="card">
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
      {sel.length > 0 && (
        <div className="bulkbar" role="toolbar" aria-label={t('Azioni sulle pagine selezionate')}>
          <strong>{sel.length === 1 ? t('1 selezionata') : t('{n} selezionate', { n: sel.length })}</strong>
          <button type="button" className="btn" disabled={busy} onClick={() => run({ keys: sel, action: 'edit', set: { status: 'published' } })}>{t('Pubblica')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run({ keys: sel, action: 'edit', set: { status: 'draft' } })}>{t('Metti in bozza')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => setBulk(!bulk)} aria-expanded={bulk}>{t('Modifica…')}</button>
          {isAdmin && <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run({ keys: sel, action: 'trash' })}>{t('Sposta nel cestino')}</button>}
          <button type="button" className="link" onClick={() => { setSel([]); setBulk(false); }}>{t('Deseleziona')}</button>
        </div>
      )}
      {bulk && sel.length > 0 && <BulkEdit keys={sel} authors={authors} isAdmin={isAdmin} onClose={() => setBulk(false)} run={run} busy={busy} />}
      <table className="table table--posts">
        <thead>
          <tr>
            <th className="col-check"><input type="checkbox" checked={all} aria-label={t('Seleziona tutte le pagine')} onChange={() => setSel(all ? [] : rows.map((r) => r.key))} /></th>
            <th>{t('Nome')}</th><th>{t('Indirizzo')}</th>{rows.some((r) => r.versions) && <th>{t('Lingue')}</th>}<th>{t('Autore')}</th><th className="col-light">SEO</th><th className="col-light">GEO</th><th>{t('Pubblicazione')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8} className="muted">{filtered ? t('Nessuna pagina con questo filtro.') : t('Nessuna pagina.')}</td></tr>}
          {rows.map((r) => (
            editing === r.key ? (
              <tr key={r.key} className="is-editing"><td colSpan={8}><QuickEdit row={r} locales={locales} authors={authors} isAdmin={isAdmin} onDone={(saved, m) => { setEditing(null); if (m) setMsg(m); if (saved) router.refresh(); }} /></td></tr>
            ) : (
              <tr key={r.key} className={sel.includes(r.key) ? 'is-selected' : undefined}>
                <td className="col-check"><input type="checkbox" checked={sel.includes(r.key)} aria-label={t('Seleziona {x}', { x: r.name })} onChange={() => toggle(r.key)} /></td>
                <td>
                  <Link href={`/admin/pages/${r.key}`}><strong>{r.name}</strong></Link>
                  {r.status !== 'published' && <span className="muted"> — {t('Bozza')}</span>}
                  <div className="rowactions">
                    <Link href={`/admin/pages/${r.key}`}>{t('Modifica')}</Link>
                    <button type="button" className="link" onClick={() => setEditing(r.key)}>{t('Modifica rapida')}</button>
                    {isAdmin && r.key !== 'home' && <button type="button" className="link link--danger" disabled={busy} onClick={() => run({ keys: [r.key], action: 'trash' })}>{t('Cestino')}</button>}
                  </div>
                </td>
                <td className="muted">{r.path}</td>
                {rows.some((x) => x.versions) && <td><Versions versions={r.versions} baseKey={r.key} kind="page" /></td>}
                <td className="muted">{r.author || '—'}</td>
                <td className="col-light"><Light label="SEO" info={r.seo} /></td>
                <td className="col-light"><Light label="GEO" info={r.geo} /></td>
                <td><span className={`tag tag--${r.tone}`}>{r.stateLabel}</span></td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </section>
  );
}
