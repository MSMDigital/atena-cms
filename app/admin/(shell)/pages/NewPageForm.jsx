'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPageAction } from '../_editor/actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function NewPageForm({ pages, startOpen = false }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [f, setF] = useState({ name: '', key: '', slug: '', parent: '' });
  const [touched, setTouched] = useState({ key: false, slug: false });
  const [error, setError] = useState(null);
  const [busy, start] = useTransition();

  const setName = (name) => setF((cur) => ({ ...cur, name, key: touched.key ? cur.key : slugify(name), slug: touched.slug ? cur.slug : slugify(name) }));
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const r = await createPageAction(f);
      if (r.ok) router.push(`/admin/pages/${r.key}`); else setError(t(r.error));
    });
  };

  if (!open) return <button className="btn btn--primary" onClick={() => setOpen(true)}>{t('Nuova pagina')}</button>;
  return (
    <form className="newpage card" onSubmit={submit}>
      <h2>{t('Nuova pagina')}</h2>
      <label>{t('Nome')}<input value={f.name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <label>{t("Indirizzo (l'ultima parte dell'URL)")}<input value={f.slug} onChange={(e) => { setTouched({ ...touched, slug: true }); setF({ ...f, slug: e.target.value }); }} required /></label>
      <label>{t('Chiave interna (non si cambia più)')}<input value={f.key} onChange={(e) => { setTouched({ ...touched, key: true }); setF({ ...f, key: e.target.value }); }} required /></label>
      <label>{t('Sotto la pagina')}
        <select value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
          <option value="">{t('— direttamente sotto la home —')}</option>
          {pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
      </label>
      {error && <p className="notice notice--bad" role="alert">{error}</p>}
      <div className="newpage__actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>{t('Annulla')}</button>
        <button className="btn btn--primary" disabled={busy}>{busy ? t('Creazione…') : t('Crea la pagina')}</button>
      </div>
    </form>
  );
}
