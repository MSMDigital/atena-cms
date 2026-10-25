'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

export default function LoginForm({ next }) {
  const t = useT();
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="login__form">
      <input type="hidden" name="next" value={next ?? ''} />
      <label>
        {t('Email o nome utente')}
        <input name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={state?.email ?? ''} required autoFocus />
      </label>
      <label>
        {t('Password')}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="login__error" role="alert">{state.error}</p>}
      <button className="btn btn--primary" disabled={pending}>{pending ? t('Accesso…') : t('Accedi')}</button>
    </form>
  );
}
