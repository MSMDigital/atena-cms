import { requireUser } from '@/lib/auth.mjs';
import { MIN_PASSWORD } from '@/lib/password.mjs';
import AccountForm from './AccountForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Il mio account | Outsmart CMS' };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="page">
      <div className="page__head"><h1>Il mio account</h1></div>
      <section className="card account">
        <p className="hint">{user.name} · {user.email} · {user.role === 'admin' ? 'Admin' : 'Editor'}</p>
        <h2>Cambia password</h2>
        <AccountForm min={MIN_PASSWORD} />
      </section>
    </main>
  );
}
