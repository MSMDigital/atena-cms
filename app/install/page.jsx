import { redirect } from 'next/navigation';
import { isInstalled } from '@/lib/install.mjs';
import { installToken } from '@/lib/install.mjs';
import { loginPath } from '@/lib/admin-path.mjs';
import Wizard from './Wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Installazione | Atena CMS', robots: { index: false, follow: false } };

export default async function InstallPage() {
  if (await isInstalled()) redirect(loginPath());
  installToken();          // la crea (e la scrive nel log del server) alla prima visita
  return (
    <main className="install">
      <div className="install__card">
        <img className="brand-mark" src="/brand/atena-mark.svg" alt="" width="48" height="48" />
        <Wizard />
      </div>
    </main>
  );
}
