'use client';

import { useState, useTransition } from 'react';
import { publishAction } from './actions';

export default function PublishPanel({ pending, lastPublication, canPublish }) {
  const [result, setResult] = useState(null);
  const [busy, start] = useTransition();
  const publish = () => start(async () => setResult(await publishAction()));

  return (
    <section className="card">
      <h2>Pubblicazione</h2>
      <p className="muted">
        {lastPublication
          ? <>Ultima pubblicazione: {new Date(lastPublication.created_at).toLocaleString('it-CH')}{lastPublication.by_name ? `, ${lastPublication.by_name}` : ''} ({lastPublication.status === 'ok' ? `${lastPublication.pages} pagine` : 'non riuscita'}).</>
          : 'Il sito non è mai stato pubblicato da qui.'}
      </p>
      <p>{pending === 0 ? 'Nessuna modifica in attesa.' : `${pending} ${pending === 1 ? 'documento con modifiche' : 'documenti con modifiche'} in attesa di pubblicazione.`}</p>
      {canPublish && <button className="btn btn--primary" onClick={publish} disabled={busy || pending === 0}>{busy ? 'Pubblicazione…' : 'Pubblica le modifiche'}</button>}
      {result?.ok && !result.nothing && <p className="notice notice--ok" role="status">Pubblicato: {result.pages} pagine. {result.warnings?.length ? `${result.warnings.length} avvisi (link a pagine ancora da creare).` : ''}</p>}
      {result && !result.ok && (
        <div className="notice notice--bad" role="alert">
          <strong>{result.error}. Il sito online non è cambiato.</strong>
          <ul>{result.details?.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
