import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth.mjs';
import { isInstalled } from '@/lib/install.mjs';
import LoginForm from './LoginForm';
import { getT, getLang } from '@/lib/i18n-server.mjs';
import { I18nProvider } from '@/app/admin/_i18n/I18nProvider';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Accesso')} | Atena CMS` }; }

export default async function LoginPage({ searchParams }) {
  if (!(await isInstalled())) redirect('/install');          // prima installazione: si comincia dalla procedura guidata
  if (await currentUser()) redirect('/admin');
  const { next } = await searchParams;
  const t = await getT();
  const lang = await getLang();
  return (
    <main className="login">
      <div className="login__card">
        <img className="brand-mark" src="/brand/atena-mark.svg" alt="" width="48" height="48" />
        <h1>Atena</h1>
        <p className="muted">{t('Accedi per gestire il sito.')}</p>
        <I18nProvider lang={lang}><LoginForm next={next} /></I18nProvider>
      </div>
    </main>
  );
}
