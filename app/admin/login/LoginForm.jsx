'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';

export default function LoginForm({ next }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="login__form">
      <input type="hidden" name="next" value={next ?? ''} />
      <label>
        Email
        <input name="email" type="email" autoComplete="username" defaultValue={state?.email ?? ''} required autoFocus />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="login__error" role="alert">{state.error}</p>}
      <button className="btn btn--primary" disabled={pending}>{pending ? 'Accesso…' : 'Accedi'}</button>
    </form>
  );
}
