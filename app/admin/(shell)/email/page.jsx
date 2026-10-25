import { requireUser } from '@/lib/auth.mjs';
import { mailSettingsView, getMailRecipients, defaultSenderName } from '@/lib/settings.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import EmailSettings from './EmailSettings';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Impostazioni email')} | Atena CMS` }; }

export default async function EmailPage() {
  const user = await requireUser('admin');
  const t = await getT();
  return (
    <main className="page page--settings">
      <div className="page__head"><h1>{t('Impostazioni email')}</h1></div>
      <p className="hint">{t('Come partono le email delle richieste dei moduli del sito (server SMTP o Brevo) e a chi arrivano. La password si conserva cifrata e non viene mai mostrata: per cambiarla se ne inserisce una nuova.')}</p>
      <EmailSettings initial={await mailSettingsView()} adminEmail={user.email} adminName={await defaultSenderName()} general={{ ...publicGeneral(await getGeneral()), adminEmail: (await getGeneral()).adminEmail }} recipients={await getMailRecipients()} />
    </main>
  );
}
