'use client';

import { useActionState } from 'react';
import { changePasswordAction } from './actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

export default function AccountForm({ min }) {
  const t = useT();
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="account__form">
      <label>{t('Password attuale')}<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>{t('Nuova password')}<input name="next" type="password" autoComplete="new-password" minLength={min} required /><span className="fld__help">{t('Almeno {min} caratteri. Una frase lunga va meglio di una parola complicata.', { min })}</span></label>
      <label>{t('Ripeti la nuova password')}<input name="again" type="password" autoComplete="new-password" minLength={min} required /></label>
      {state?.error && <p className="bad" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">{t('Password cambiata. Gli accessi su altri dispositivi sono stati chiusi.')}</p>}
      <button className="btn btn--primary" disabled={pending}>{pending ? t('Salvataggio…') : t('Cambia password')}</button>
    </form>
  );
}
