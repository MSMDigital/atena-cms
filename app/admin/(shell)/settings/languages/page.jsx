import { requireUser } from '@/lib/auth.mjs';
import { getDoc } from '@/lib/docs.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import LanguagesForm from './LanguagesForm';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Lingue')} | Atena CMS` }; }

export default async function LanguagesPage() {
  await requireUser('admin');
  const t = await getT();
  const site = (await getDoc('site', 'main'))?.draft;
  return (
    <main className="page page--settings">
      <div className="page__head"><h1>{t('Lingue')}</h1></div>
      <p className="hint">{t('Le lingue in cui è pubblicato il sito. Ogni pagina ha una versione per lingua: finché una versione è in bozza, in quella lingua la pagina non è online. Le modifiche si salvano come bozza ed escono con «Pubblica».')}</p>
      <LanguagesForm initial={site?.locales ?? { default: 'it', enabled: ['it'], tags: {} }} />
    </main>
  );
}
