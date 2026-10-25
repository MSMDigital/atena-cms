'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPostAction } from '../_editor/actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function NewPostForm() {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ title: '', slug: '', date: new Date().toLocaleDateString('sv-SE') });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState(null);
  const [busy, start] = useTransition();
  const submit = (e) => { e.preventDefault(); start(async () => { const r = await createPostAction(f); if (r.ok) router.push(`/admin/posts/${r.key}`); else setError(t(r.error)); }); };
  return (
    <form className="newpage card" onSubmit={submit}>
      <label>{t('Titolo')}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value, slug: touched ? f.slug : slugify(e.target.value) })} required autoFocus /></label>
      <label>{t("Indirizzo (l'ultima parte dell'URL, non si cambia come chiave)")}<input value={f.slug} onChange={(e) => { setTouched(true); setF({ ...f, slug: e.target.value }); }} required /></label>
      <label>{t('Data di pubblicazione')}<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
      {error && <p className="notice notice--bad" role="alert">{error}</p>}
      <div className="newpage__actions"><button className="btn btn--primary" disabled={busy}>{busy ? t('Creazione…') : t("Crea l'articolo")}</button></div>
    </form>
  );
}
