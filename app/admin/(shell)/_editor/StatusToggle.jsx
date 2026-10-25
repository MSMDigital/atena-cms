'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStatusAction } from './actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

// Pubblica / metti in bozza dall'elenco (cambia il campo «Stato» del documento; online si vede alla prossima pubblicazione).
export default function StatusToggle({ kind, docKey, status }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const next = status === 'published' ? 'draft' : 'published';
  return (
    <span className="status">
      <span className={`tag tag--${status === 'published' ? 'ok' : 'warn'}`}>{status === 'published' ? t('Pubblicata') : t('Bozza')}</span>
      <button type="button" className="link" disabled={busy} onClick={() => start(async () => { await setStatusAction(kind, docKey, next); router.refresh(); })}>
        {status === 'published' ? t('Metti in bozza') : t('Pubblica')}
      </button>
    </span>
  );
}
