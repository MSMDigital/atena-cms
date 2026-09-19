import { requireUser } from '@/lib/auth.mjs';
import { mailSettingsView } from '@/lib/settings.mjs';
import EmailSettings from './EmailSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Impostazioni email | Outsmart CMS' };

export default async function EmailPage() {
  const user = await requireUser('admin');
  return (
    <main className="page">
      <div className="page__head"><h1>Impostazioni email</h1></div>
      <p className="hint">Il server che invia le email delle richieste dei moduli del sito. La password si conserva cifrata e non viene mai mostrata: per cambiarla se ne inserisce una nuova.</p>
      <EmailSettings initial={await mailSettingsView()} adminEmail={user.email} />
    </main>
  );
}
