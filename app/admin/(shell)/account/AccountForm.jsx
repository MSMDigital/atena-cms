'use client';

import { useActionState } from 'react';
import { changePasswordAction } from './actions';

export default function AccountForm({ min }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="account__form">
      <label>Password attuale<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>Nuova password<input name="next" type="password" autoComplete="new-password" minLength={min} required /><span className="fld__help">Almeno {min} caratteri. Una frase lunga va meglio di una parola complicata.</span></label>
      <label>Ripeti la nuova password<input name="again" type="password" autoComplete="new-password" minLength={min} required /></label>
      {state?.error && <p className="bad" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">Password cambiata. Gli accessi su altri dispositivi sono stati chiusi.</p>}
      <button className="btn btn--primary" disabled={pending}>{pending ? 'Salvataggio…' : 'Cambia password'}</button>
    </form>
  );
}
