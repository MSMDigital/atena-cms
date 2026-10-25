'use client';

// Pulsante «Pubblica» sempre in fondo al menu laterale: pubblica tutte le modifiche in attesa (solo un admin). Per gli altri mostra solo quante sono.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { publishAction } from './actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

export default function SidebarPublish({ pending, canPublish, label = 'Pubblica' }) {
  const t = useT();
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [busy, start] = useTransition();
  const publish = () => start(async () => { setResult(null); const r = await publishAction(); setResult(r); router.refresh(); });
  return (
    <div className="sidebar__publish">
      {canPublish ? (
        <button type="button" className="sidebar__pubbtn" onClick={publish} disabled={busy || (pending === 0 && !result)} aria-describedby="side-pub-status">
          {busy ? t('Pubblicazione…') : label}{pending > 0 && !busy && <span className="nav-badge" aria-label={t('{n} modifiche in attesa', { n: pending })}>{pending}</span>}
        </button>
      ) : <p className="sidebar__pubnote">{pending > 0 ? (pending === 1 ? t('{n} tua bozza: la pubblicazione la fa un amministratore.', { n: pending }) : t('{n} tue bozze: la pubblicazione la fa un amministratore.', { n: pending })) : t('Nessuna bozza in attesa.')}</p>}
      <p id="side-pub-status" className="sidebar__pubstatus" role="status" aria-live="polite">
        {result?.ok && !result.nothing && t('Pubblicato ({n} pagine).', { n: result.pages })}
        {result?.ok && result.nothing && t('Niente da pubblicare.')}
        {result && !result.ok && <span className="sidebar__puberr">{result.error}. {t('Il sito online non è cambiato.')}{result.details?.[0] ? ` ${result.details[0]}` : ''}</span>}
      </p>
    </div>
  );
}
