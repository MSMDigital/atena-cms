'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setRequestStatusAction, resendRequestMailAction, deleteRequestAction } from '../actions';

const STATUS = { new: 'Nuova', read: 'Letta', archived: 'Archiviata' };

export default function RequestActions({ id, status, mailStatus, isAdmin }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [asked, setAsked] = useState(false);

  const setStatus = (s) => start(async () => { await setRequestStatusAction(id, s); router.refresh(); });
  const resend = () => start(async () => {
    const r = await resendRequestMailAction(id);
    setMsg(r.ok ? { ok: true, text: 'Email inviata.' } : { ok: false, text: r.error ?? 'Invio non riuscito.' });
    router.refresh();
  });
  const remove = () => start(async () => {
    const r = await deleteRequestAction(id);
    if (r.ok) router.push('/admin/requests'); else setMsg({ ok: false, text: 'Non è stato possibile eliminarla.' });
  });

  return (
    <div className="req__actions">
      <p className="req__status">Stato: <strong>{STATUS[status]}</strong></p>
      <div className="req__buttons">
        {status !== 'read' && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('read')}>Segna come letta</button>}
        {status !== 'new' && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('new')}>Segna come nuova</button>}
        {status !== 'archived' && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('archived')}>Archivia</button>}
        {mailStatus !== 'sent' && <button type="button" className="btn" disabled={busy} onClick={resend}>Invia di nuovo l&apos;email</button>}
        {isAdmin && (asked
          ? <span className="mdet__confirm"><span>Eliminare definitivamente?</span> <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>Sì, elimina</button> <button type="button" className="btn" onClick={() => setAsked(false)}>Annulla</button></span>
          : <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setAsked(true)}>Elimina</button>)}
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
    </div>
  );
}
