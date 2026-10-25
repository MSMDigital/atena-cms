'use client';

// Elenco degli utenti con selezione e azioni di massa: cambiare ruolo, spegnere o riaccendere il profilo sul sito, eliminare.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROLES, ROLE_LABEL } from '@/lib/permissions.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { bulkUsersAction } from './actions';

export default function UsersTable({ rows, filtered }) {
  const t = useT();
  const router = useRouter();
  const [sel, setSel] = useState([]);
  const [role, setRole] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  const run = (action, text) => {
    if (action === 'delete' && !window.confirm(sel.length === 1 ? t('Eliminare 1 utente? I loro contenuti restano nel sito, senza proprietario. Non si può annullare.') : t('Eliminare {n} utenti? I loro contenuti restano nel sito, senza proprietario. Non si può annullare.', { n: sel.length }))) return;
    if (action === 'role' && !window.confirm(sel.length === 1 ? t('Cambiare il ruolo di 1 utente in «{role}»? Dovranno accedere di nuovo.', { role: t(ROLE_LABEL[role]) }) : t('Cambiare il ruolo di {n} utenti in «{role}»? Dovranno accedere di nuovo.', { n: sel.length, role: t(ROLE_LABEL[role]) }))) return;
    start(async () => {
      const r = await bulkUsersAction({ ids: sel, action, role });
      if (r.ok) {
        setMsg({ tone: r.skipped.length ? 'warn' : 'ok', text: `${t(text, { n: r.done })}.${r.skipped.length ? ` ${t('Non modificati: {list}.', { list: r.skipped.join('; ') })}` : ''}` });
        setSel([]); setRole(''); router.refresh();
      } else setMsg({ tone: 'bad', text: r.error });
    });
  };

  return (
    <section className="card">
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
      {sel.length > 0 && (
        <div className="bulkbar" role="toolbar" aria-label={t('Azioni sugli utenti selezionati')}>
          <strong>{sel.length === 1 ? t('1 selezionato') : t('{n} selezionati', { n: sel.length })}</strong>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('Nuovo ruolo')}>
            <option value="">{t('Cambia ruolo in…')}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
          </select>
          <button type="button" className="btn" disabled={busy || !role} onClick={() => run('role', '{n} con il ruolo cambiato')}>{t('Applica ruolo')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run('hide', '{n} con il profilo spento')}>{t('Spegni profilo')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run('show', '{n} con il profilo acceso')}>{t('Riaccendi profilo')}</button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run('delete', '{n} eliminati')}>{t('Elimina')}</button>
          <button type="button" className="link" onClick={() => setSel([])}>{t('Deseleziona')}</button>
        </div>
      )}
      <table className="table table--posts">
        <thead>
          <tr>
            <th className="col-check"><input type="checkbox" checked={all} aria-label={t('Seleziona tutti gli utenti')} onChange={() => setSel(all ? [] : rows.map((r) => r.id))} /></th>
            <th>{t('Nome utente')}</th><th>{t('Nome')}</th><th>{t('Cognome')}</th><th>{t('Email')}</th><th>{t('Ruolo')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="muted">{filtered ? t('Nessun utente con questo filtro.') : t('Nessun utente.')}</td></tr>}
          {rows.map((u) => (
            <tr key={u.id} className={sel.includes(u.id) ? 'is-selected' : undefined}>
              <td className="col-check"><input type="checkbox" checked={sel.includes(u.id)} aria-label={t('Seleziona {name}', { name: u.username })} onChange={() => toggle(u.id)} /></td>
              <td>
                <Link href={`/admin/users/${u.id}`}><strong>{u.username || '—'}</strong></Link>
                {!u.active && <span className="muted"> — {t('disattivato')}</span>}
                {u.isMe && <span className="muted"> — {t('tu')}</span>}
                {u.role !== 'normal' && !u.showPublic && <span className="muted"> — {t('profilo spento')}</span>}
                <div className="rowactions"><Link href={`/admin/users/${u.id}`}>{t('Modifica')}</Link></div>
              </td>
              <td>{u.firstName || '—'}</td>
              <td>{u.lastName || '—'}</td>
              <td className="muted">{u.email}</td>
              <td><span className={`tag tag--${u.role === 'admin' ? 'ok' : u.role === 'author' ? 'warn' : ''}`}>{t(ROLE_LABEL[u.role])}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
