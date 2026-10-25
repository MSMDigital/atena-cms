import { requireUser } from '@/lib/auth.mjs';
import { listMedia, maxUploadBytes } from '@/lib/media.mjs';
import { loadData } from '@/lib/docs.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import MediaLibrary from './MediaLibrary';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Immagini')} | Atena CMS` }; }

export default async function MediaPage() {
  const user = await requireUser('author');
  const t = await getT();
  const site = (await loadData('draft')).site;
  const baseLang = site?.locales?.base ?? site?.locales?.default ?? 'it';   // le colonne dell'immagine sono nella lingua di base
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Immagini')}</h1></div>
      <MediaLibrary initial={await listMedia()} maxMb={Math.round(maxUploadBytes() / 1048576)} siteUrl={site?.siteUrl ?? ''} userId={user.id} isAdmin={user.role === 'admin'} langs={[baseLang, ...(site?.locales?.enabled ?? []).filter((l) => l !== baseLang)]} baseLang={baseLang} />
    </main>
  );
}
