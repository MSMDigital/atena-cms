'use client';

import { useState, useTransition } from 'react';
import { publishAction } from './actions';
import { issueHref } from '@/lib/schema-form.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';

export default function PublishPanel({ pending, lastPublication, canPublish }) {
  const t = useT();
  const [result, setResult] = useState(null);
  const [busy, start] = useTransition();
  const publish = () => start(async () => setResult(await publishAction()));

  return (
    <section className="card">
      <h2>{t('Pubblicazione')}</h2>
      <p className="muted">
        {lastPublication
          ? t('Ultima pubblicazione: {when}{by} ({outcome}).', { when: lastPublication.label, by: lastPublication.by_name ? `, ${lastPublication.by_name}` : '', outcome: lastPublication.status === 'ok' ? t('{n} pagine', { n: lastPublication.pages }) : t('non riuscita') })
          : t('Il sito non è mai stato pubblicato da qui.')}
      </p>
      <p>{pending === 0 ? t('Nessuna modifica in attesa.') : pending === 1 ? t('{n} documento con modifiche in attesa di pubblicazione.', { n: pending }) : t('{n} documenti con modifiche in attesa di pubblicazione.', { n: pending })}</p>
      {canPublish && <button className="btn btn--primary" onClick={publish} disabled={busy || pending === 0}>{busy ? t('Pubblicazione…') : t('Pubblica le modifiche')}</button>}
      {result?.ok && !result.nothing && <p className="notice notice--ok" role="status">{t('Pubblicato: {n} pagine.', { n: result.pages })} {result.warnings?.length ? t('{n} avvisi (link a pagine ancora da creare).', { n: result.warnings.length }) : ''}</p>}
      {result && !result.ok && (
        <div className="notice notice--bad" role="alert">
          <strong>{result.error}. {t('Il sito online non è cambiato.')}</strong>
          <ul>{result.details?.map((d, i) => { const h = issueHref(d); return <li key={i}>{h ? <a href={h}>{d}</a> : d}</li>; })}</ul>
        </div>
      )}
    </section>
  );
}
