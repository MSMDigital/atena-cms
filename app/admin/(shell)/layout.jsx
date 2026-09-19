import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { submissionCounts } from '@/lib/requests.mjs';
import { logoutAction } from '../login/actions';

export default async function Shell({ children }) {
  const user = await requireUser();
  const { new: newRequests } = await submissionCounts();
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/admin" className="topbar__brand">Outsmart CMS</Link>
        <nav className="topbar__nav" aria-label="Principale">
          <Link href="/admin">Panoramica</Link>
          <Link href="/admin/pages">Pagine</Link>
          <Link href="/admin/shared">Condivisi</Link>
          <Link href="/admin/media">Immagini</Link>
          <Link href="/admin/requests">Richieste{newRequests > 0 && <span className="nav-badge" aria-label={`${newRequests} nuove`}>{newRequests}</span>}</Link>
          {user.role === 'admin' && <Link href="/admin/site">Sito</Link>}
          {user.role === 'admin' && <Link href="/admin/email">Email</Link>}
          {user.role === 'admin' && <Link href="/admin/templates">Template</Link>}
          {user.role === 'admin' && <Link href="/admin/style">Stile</Link>}
        </nav>
        <div className="topbar__user">
          <Link href="/admin/account" title="Il mio account e la password">{user.name}</Link>
          <span className="tag">{user.role === 'admin' ? 'Admin' : 'Editor'}</span>
          <form action={logoutAction}><button className="link">Esci</button></form>
        </div>
      </header>
      {children}
    </div>
  );
}
