import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth.mjs';
import { isInstalled } from '@/lib/install.mjs';
import LoginForm from './LoginForm';

export const metadata = { title: 'Accesso | Outsmart CMS' };

export default async function LoginPage({ searchParams }) {
  if (!(await isInstalled())) redirect('/install');          // prima installazione: si comincia dalla procedura guidata
  if (await currentUser()) redirect('/admin');
  const { next } = await searchParams;
  return (
    <main className="login">
      <div className="login__card">
        <h1>Outsmart CMS</h1>
        <p className="muted">Accedi per gestire il sito.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
