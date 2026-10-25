import { requireUser } from '@/lib/auth.mjs';
import { listMedia, maxUploadBytes } from '@/lib/media.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import UserForm from '../UserForm';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Aggiungi utente')} | Atena CMS` }; }

export default async function NewUserPage() {
  await requireUser('admin');
  const t = await getT();
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Aggiungi utente')}</h1></div>
      <UserForm mode="create" initial={null} media={await listMedia()} maxMb={Math.round(maxUploadBytes() / 1048576)} />
    </main>
  );
}
