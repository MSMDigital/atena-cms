import { redirect } from 'next/navigation';
import { isInstalled } from '@/lib/install.mjs';
import { installToken } from '@/lib/install.mjs';
import Wizard from './Wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Installazione | Outsmart CMS', robots: { index: false, follow: false } };

export default async function InstallPage() {
  if (await isInstalled()) redirect('/admin/login');
  installToken();          // la crea (e la scrive nel log del server) alla prima visita
  return (
    <main className="install">
      <div className="install__card">
        <h1>Installazione di Outsmart CMS</h1>
        <Wizard />
      </div>
    </main>
  );
}
