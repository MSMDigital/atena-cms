import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { listUsers } from '@/lib/users.mjs';
import { ROLE_LABEL, ROLES } from '@/lib/permissions.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import UsersTable from './UsersTable';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Utenti')} | Atena CMS` }; }

export default async function UsersPage({ searchParams }) {
  const me = await requireUser('admin');
  const t = await getT();
  const { ruolo, q } = await searchParams;
  const all = await listUsers();
  const needle = String(q ?? '').trim().toLowerCase();
  const scoped = all.filter((u) => !needle || [u.username, u.firstName, u.lastName, u.email].some((v) => String(v ?? '').toLowerCase().includes(needle)));
  const count = (r) => (r ? scoped.filter((u) => u.role === r).length : scoped.length);
  const users = ruolo ? scoped.filter((u) => u.role === ruolo) : scoped;
  const href = (over) => { const p = new URLSearchParams(Object.entries({ ruolo, q, ...over }).filter(([, v]) => v)); return `/admin/users${p.size ? `?${p}` : ''}`; };
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Utenti')}</h1><Link className="btn btn--primary" href="/admin/users/new">{t('Aggiungi utente')}</Link></div>
      <p className="filters">
        <Link href={href({ ruolo: '' })} className={!ruolo ? 'is-on' : undefined}>{t('Tutti')} <span className="muted">({count('')})</span></Link>
        {ROLES.map((r) => <Link key={r} href={href({ ruolo: r })} className={ruolo === r ? 'is-on' : undefined}>{t(ROLE_LABEL[r])} <span className="muted">({count(r)})</span></Link>)}
      </p>
      <form className="filterbar" method="get" action="/admin/users" role="search">
        {ruolo && <input type="hidden" name="ruolo" value={ruolo} />}
        <input type="search" name="q" defaultValue={q ?? ''} placeholder={t('Cerca per nome utente, nome o email')} aria-label={t('Cerca tra gli utenti')} />
        <button className="btn">{t('Cerca')}</button>
        {q && <Link className="link" href={href({ q: '' })}>{t('Azzera')}</Link>}
      </form>
      <UsersTable rows={users.map((u) => ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, active: u.active, showPublic: u.showPublic, isMe: u.id === me.id }))} filtered={!!(ruolo || q)} />
    </main>
  );
}
