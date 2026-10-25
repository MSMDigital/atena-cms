'use client';

// Elenco degli articoli: selezione per le azioni di massa, modifica rapida (titolo, autore, indirizzo, stato) e semaforo SEO / GEO.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { quickEditPostAction, bulkPostsAction } from '../_editor/actions';
import { useLangName, dateTime, Light, AuthorSelect, SlugField, Versions, quickEditMessage, bulkMessage } from '../_editor/TableParts';

const STATUS = { draft: 'Bozza', scheduled: 'Pianificato', published: 'Pubblicato' };

function QuickEdit({ row, locales, baseLang, authors, isAdmin, basePath, onDone }) {
  const t = useT();
  const name = useLangName();
  const [f, setF] = useState({ title: row.title, author: row.author, slug: { ...row.slug }, status: row.status, publishAt: row.publishAt });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const save = (e) => {
    e.preventDefault();
    start(async () => { const r = await quickEditPostAction({ key: row.key, ...f }); if (r.ok) onDone(true, quickEditMessage(r, t)); else setMsg(r.error); });
  };
  return (
    <form className="qe" onSubmit={save}>
      <strong>{t('Modifica rapida')}</strong>
      <div className="qe__grid">
        <label>{t('Titolo')}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
        {isAdmin && <label>{t('Autore')}<AuthorSelect value={f.author} authors={authors} onChange={(v) => setF({ ...f, author: v })} /></label>}
        {locales.map((l, i) => (
          <SlugField key={l} label={`${t('Indirizzo')}${locales.length > 1 ? ` (${name(l)})` : ''}`} value={f.slug[l] ?? ''} onChange={(v) => setF({ ...f, slug: { ...f.slug, [l]: v } })}
            source={f.title} base={i === 0 ? basePath : null} taken={row.taken?.[l] ?? []} original={row.slug[l] ?? ''} required={l === baseLang} online={row.online} />
        ))}
        <label>{t('Stato')}
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </label>
        {f.status === 'scheduled' && <label>{t('Pubblica il')}<input type="datetime-local" step={3600} value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} required /></label>}
      </div>
      {msg && <p className="notice notice--bad" role="alert">{msg}</p>}
      <div className="qe__actions"><button className="btn btn--primary" disabled={busy}>{busy ? (isAdmin ? t('Pubblico…') : t('Salvo…')) : isAdmin ? t('Aggiorna e pubblica') : t('Salva bozza')}</button><button type="button" className="btn" onClick={() => onDone(false)}>{t('Annulla')}</button></div>
    </form>
  );
}

function BulkEdit({ keys, options, authors, isAdmin, onClose, run, busy }) {
  const t = useT();
  const [s, setS] = useState({ status: '', author: '', addCategories: [], addTags: [] });
  const toggle = (field, k) => setS({ ...s, [field]: s[field].includes(k) ? s[field].filter((x) => x !== k) : [...s[field], k] });
  return (
    <form className="qe" onSubmit={(e) => { e.preventDefault(); run({ keys, action: 'edit', set: { ...s, status: s.status || undefined } }); }}>
      <strong>{keys.length === 1 ? t('Modifica di massa: 1 articolo') : t('Modifica di massa: {n} articoli', { n: keys.length })}</strong>
      <div className="qe__grid">
        <label>{t('Stato')}
          <select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}>
            <option value="">{t('— nessuna modifica —')}</option>
            <option value="published">{t('Pubblicato')}</option>
            <option value="draft">{t('Bozza')}</option>
          </select>
        </label>
        {isAdmin && <label>{t('Autore')}<AuthorSelect value={s.author} authors={authors} keepEmpty="— nessuna modifica —" onChange={(v) => setS({ ...s, author: v })} /></label>}
      </div>
      {options.categories.length > 0 && <fieldset className="qe__set"><legend>{t('Aggiungi categorie')}</legend>{options.categories.map((c) => <label key={c.key} className="check"><input type="checkbox" checked={s.addCategories.includes(c.key)} onChange={() => toggle('addCategories', c.key)} /> {c.name}</label>)}</fieldset>}
      {options.tags.length > 0 && <fieldset className="qe__set"><legend>{t('Aggiungi tag')}</legend>{options.tags.map((t) => <label key={t.key} className="check"><input type="checkbox" checked={s.addTags.includes(t.key)} onChange={() => toggle('addTags', t.key)} /> {t.name}</label>)}</fieldset>}
      <p className="muted">{t('Le categorie e i tag scelti si aggiungono a quelli che ogni articolo ha già. Per pianificare un articolo usa la modifica rapida.')}</p>
      <div className="qe__actions"><button className="btn btn--primary" disabled={busy}>{busy ? t('Salvo…') : isAdmin ? t('Aggiorna e pubblica') : t('Aggiorna')}</button><button type="button" className="btn" onClick={onClose}>{t('Annulla')}</button></div>
    </form>
  );
}

export default function PostsTable({ rows, options, locales, baseLang, authors, isAdmin, filtered, basePath }) {
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
    if (input.action === 'trash' && !window.confirm(input.keys.length === 1 ? t('Spostare nel cestino 1 articolo? Si possono ripristinare.') : t('Spostare nel cestino {n} articoli? Si possono ripristinare.', { n: input.keys.length }))) return;
    start(async () => {
      const r = await bulkPostsAction(input);
      if (r.ok) { setMsg(bulkMessage(r, input.action === 'trash' ? 'nel cestino' : 'aggiornati', t)); setSel([]); setBulk(false); router.refresh(); }
      else setMsg({ tone: 'bad', text: t(r.error) });
    });
  };
  const trashOne = (k) => run({ keys: [k], action: 'trash' });

  return (
    <section className="card">
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
      {sel.length > 0 && (
        <div className="bulkbar" role="toolbar" aria-label={t('Azioni sugli articoli selezionati')}>
          <strong>{sel.length === 1 ? t('1 selezionato') : t('{n} selezionati', { n: sel.length })}</strong>
          <button type="button" className="btn" disabled={busy} onClick={() => run({ keys: sel, action: 'edit', set: { status: 'published' } })}>{t('Pubblica')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run({ keys: sel, action: 'edit', set: { status: 'draft' } })}>{t('Metti in bozza')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => setBulk(!bulk)} aria-expanded={bulk}>{t('Modifica…')}</button>
          {isAdmin && <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run({ keys: sel, action: 'trash' })}>{t('Sposta nel cestino')}</button>}
          <button type="button" className="link" onClick={() => { setSel([]); setBulk(false); }}>{t('Deseleziona')}</button>
        </div>
      )}
      {bulk && sel.length > 0 && <BulkEdit keys={sel} options={options} authors={authors} isAdmin={isAdmin} onClose={() => setBulk(false)} run={run} busy={busy} />}
      <table className="table table--posts">
        <thead>
          <tr>
            <th className="col-check"><input type="checkbox" checked={all} aria-label={t('Seleziona tutti gli articoli')} onChange={() => setSel(all ? [] : rows.map((r) => r.key))} /></th>
            <th>{t('Titolo')}</th>{rows.some((r) => r.versions) && <th>{t('Lingue')}</th>}<th>{t('Autore')}</th><th>{t('Categorie e tag')}</th><th>{t('Data')}</th><th className="col-light">SEO</th><th className="col-light">GEO</th><th>{t('Pubblicazione')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={9} className="muted">{filtered ? t('Nessun articolo con questo filtro.') : t('Nessun articolo: aggiungine uno.')}</td></tr>}
          {rows.map((r) => (
            editing === r.key ? (
              <tr key={r.key} className="is-editing"><td colSpan={9}><QuickEdit row={r} locales={locales} baseLang={baseLang} authors={authors} isAdmin={isAdmin} basePath={basePath} onDone={(saved, m) => { setEditing(null); if (m) setMsg(m); if (saved) router.refresh(); }} /></td></tr>
            ) : (
              <tr key={r.key} className={sel.includes(r.key) ? 'is-selected' : undefined}>
                <td className="col-check"><input type="checkbox" checked={sel.includes(r.key)} aria-label={t('Seleziona {x}', { x: r.title })} onChange={() => toggle(r.key)} /></td>
                <td>
                  <Link href={`/admin/posts/${r.key}`}><strong>{r.title}</strong></Link>
                  {r.status !== 'published' && <span className="muted"> — {r.status === 'scheduled' ? t('Pianificato per il {d}', { d: dateTime(r.publishAt) }) : t('Bozza')}</span>}
                  <div className="rowactions">
                    <Link href={`/admin/posts/${r.key}`}>{t('Modifica')}</Link>
                    <button type="button" className="link" onClick={() => setEditing(r.key)}>{t('Modifica rapida')}</button>
                    {isAdmin && <button type="button" className="link link--danger" disabled={busy} onClick={() => trashOne(r.key)}>{t('Cestino')}</button>}
                  </div>
                </td>
                {rows.some((x) => x.versions) && <td><Versions versions={r.versions} baseKey={r.key} kind="post" /></td>}
                <td className="muted">{r.author || '—'}</td>
                <td className="muted">{[...r.categories, ...r.tags.map((t) => `#${t}`)].join(', ') || '—'}</td>
                <td className="muted">{r.status === 'scheduled' ? r.publishAt.slice(0, 10) : r.date}</td>
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
