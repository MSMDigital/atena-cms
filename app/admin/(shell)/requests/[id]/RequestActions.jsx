'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRequestStatusAction, resendRequestMailAction, deleteRequestAction } from '../actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const STATUS = { new: 'Nuova', read: 'Letta', archived: 'Archiviata' };

export default function RequestActions({ id, status, mailStatus, isAdmin }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [asked, setAsked] = useState(false);

  const setStatus = (s) => start(async () => { await setRequestStatusAction(id, s); router.refresh(); });
  const resend = () => start(async () => {
    const r = await resendRequestMailAction(id);
    setMsg(r.ok ? { ok: true, text: t('Email inviata.') } : { ok: false, text: r.error ?? t('Invio non riuscito.') });
    router.refresh();
  });
  const remove = () => start(async () => {
    const r = await deleteRequestAction(id);
    if (r.ok) router.push('/admin/requests'); else setMsg({ ok: false, text: t('Non è stato possibile eliminarla.') });
  });

  return (
    <div className="req__actions">
      <p className="req__status">{t('Stato:')} <strong>{t(STATUS[status])}</strong></p>
      <div className="req__buttons">
        {status !== 'read' && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('read')}>{t('Segna come letta')}</button>}
        {status !== 'new' && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('new')}>{t('Segna come nuova')}</button>}
        {status !== 'archived' && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('archived')}>{t('Archivia')}</button>}
        {mailStatus !== 'sent' && <button type="button" className="btn" disabled={busy} onClick={resend}>{t('Invia di nuovo l\'email')}</button>}
        {isAdmin && (asked
          ? <span className="mdet__confirm"><span>{t('Eliminare definitivamente?')}</span> <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>{t('Sì, elimina')}</button> <button type="button" className="btn" onClick={() => setAsked(false)}>{t('Annulla')}</button></span>
          : <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setAsked(true)}>{t('Elimina')}</button>)}
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
    </div>
  );
}
