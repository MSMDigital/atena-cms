'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPageAction } from '../_editor/actions';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function NewPageForm({ pages }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', key: '', slug: '', parent: '' });
  const [touched, setTouched] = useState({ key: false, slug: false });
  const [error, setError] = useState(null);
  const [busy, start] = useTransition();

  const setName = (name) => setF((cur) => ({ ...cur, name, key: touched.key ? cur.key : slugify(name), slug: touched.slug ? cur.slug : slugify(name) }));
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const r = await createPageAction(f);
      if (r.ok) router.push(`/admin/pages/${r.key}`); else setError(r.error);
    });
  };

  if (!open) return <button className="btn btn--primary" onClick={() => setOpen(true)}>Nuova pagina</button>;
  return (
    <form className="newpage card" onSubmit={submit}>
      <h2>Nuova pagina</h2>
      <label>Nome<input value={f.name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <label>Indirizzo (l&apos;ultima parte dell&apos;URL)<input value={f.slug} onChange={(e) => { setTouched({ ...touched, slug: true }); setF({ ...f, slug: e.target.value }); }} required /></label>
      <label>Chiave interna (non si cambia più)<input value={f.key} onChange={(e) => { setTouched({ ...touched, key: true }); setF({ ...f, key: e.target.value }); }} required /></label>
      <label>Sotto la pagina
        <select value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
          <option value="">— direttamente sotto la home —</option>
          {pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
      </label>
      {error && <p className="notice notice--bad" role="alert">{error}</p>}
      <div className="newpage__actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>Annulla</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Creazione…' : 'Crea la pagina'}</button>
      </div>
    </form>
  );
}
