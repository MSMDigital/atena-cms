import { requireUser } from '@/lib/auth.mjs';
import { getGeneral, timezones } from '@/lib/general.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import GeneralForm from './GeneralForm';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Impostazioni generali')} | Atena CMS` }; }

export default async function GeneralPage() {
  const user = await requireUser('admin');
  const t = await getT();
  return (
    <main className="page page--settings">
      <div className="page__head"><h1>{t('Generale')}</h1></div>
      <p className="hint">{t('Valgono per tutto il CMS e il sito: orari delle pubblicazioni pianificate, date e ore mostrate, notifiche.')}</p>
      <GeneralForm initial={await getGeneral()} zones={timezones()} myEmail={user.email} />
    </main>
  );
}
