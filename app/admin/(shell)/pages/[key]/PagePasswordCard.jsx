'use client';

import { useActionState } from 'react';
import { setPagePasswordAction, clearPagePasswordAction } from './password-actions';
import { formatStamp } from '@/render/format.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';

export default function PagePasswordCard({ pageKey, min, access, general = {} }) {
  const t = useT();
  const [state, action, pending] = useActionState(setPagePasswordAction, null);
  const [clearState, clearAction, clearPending] = useActionState(clearPagePasswordAction, null);
  const view = clearState?.view ?? state?.view ?? access;

  return (
    <section className="card">
      <h2>{t('Password della pagina')}</h2>
      <p className="hint">{t('Quando "Richiedi una password" è attivo (qui sopra), la pagina pubblicata mostra una schermata con la password invece del contenuto. Non si recupera: per cambiarla, scrivine una nuova.')}</p>
      {view.hasPassword
        ? <p className="notice notice--ok" role="status">{t(view.updatedBy ? (view.updatedAt ? 'Password impostata, da {by} il {at}.' : 'Password impostata, da {by}.') : view.updatedAt ? 'Password impostata il {at}.' : 'Password impostata.', { by: view.updatedBy, at: view.updatedAt ? formatStamp(view.updatedAt, general) : '' })}</p>
        : <p className="notice notice--warn" role="status">{t('Nessuna password impostata: finché non ne scrivi una, la pagina resta bloccata per chiunque.')}</p>}
      <form action={action} className="account__form">
        <input type="hidden" name="key" value={pageKey} />
        <label>{t('Nuova password')}<input name="password" type="password" autoComplete="new-password" minLength={min} required /><span className="fld__help">{t('Almeno {min} caratteri. Condividila solo con chi deve entrare.', { min })}</span></label>
        <label>{t('Ripetila')}<input name="again" type="password" autoComplete="new-password" minLength={min} required /></label>
        {state?.error && <p className="bad" role="alert">{t(state.error)}</p>}
        {state?.ok && <p className="ok" role="status">{t('Password salvata.')}</p>}
        <button className="btn btn--primary" disabled={pending}>{pending ? t('Salvataggio…') : t('Salva password')}</button>
      </form>
      {view.hasPassword && (
        <form action={clearAction} style={{ marginTop: '1rem' }}>
          <input type="hidden" name="key" value={pageKey} />
          {clearState?.ok && <p className="ok" role="status">{t('Password rimossa: la pagina resta bloccata per tutti.')}</p>}
          <button className="btn btn--danger" type="submit" disabled={clearPending}>{clearPending ? t('Rimozione…') : t('Rimuovi la password')}</button>
        </form>
      )}
    </section>
  );
}
