'use client';

// Schede di lingua sopra l'editor di una pagina: una per lingua attiva. Ogni lingua è un documento a sé: la scheda porta alla sua versione
// (o, se manca, la crea in bozza).
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { createTranslationAction } from '../../_editor/actions';
import { useLangName } from '../../_editor/TableParts';

export default function LangTabs({ baseKey, current, versions, kind = 'page' }) {
  const t = useT();
  const name = useLangName();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState(null);
  const make = (lang) => start(async () => { const r = await createTranslationAction(baseKey, lang, kind); if (r.ok) router.push(`/admin/${kind === 'post' ? 'posts' : 'pages'}/${r.key}`); else setErr(r.error); });
  return (
    <nav className="langtabs" aria-label={t('Lingue della pagina')}>
      {versions.map((v) => v.missing
        ? <button key={v.lang} type="button" className="langtab langtab--missing" disabled={busy} onClick={() => make(v.lang)}>+ {name(v.lang)}</button>
        : <Link key={v.lang} href={`/admin/${kind === 'post' ? 'posts' : 'pages'}/${v.key}`} className={`langtab${v.key === current ? ' is-on' : ''}`} aria-current={v.key === current ? 'page' : undefined}>
          {name(v.lang)}<span className={`langtab__dot langtab__dot--${v.status === 'published' ? 'on' : 'draft'}`} aria-hidden="true" />
        </Link>)}
      {err && <span className="muted" role="alert"> {err}</span>}
    </nav>
  );
}
