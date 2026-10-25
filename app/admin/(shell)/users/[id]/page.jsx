import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getUser } from '@/lib/users.mjs';
import { listMedia, maxUploadBytes } from '@/lib/media.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import UserForm from '../UserForm';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Modifica utente')} | Atena CMS` }; }

export default async function EditUserPage({ params }) {
  const me = await requireUser('admin');
  const t = await getT();
  const { id } = await params;
  const user = /^\d+$/.test(id) ? await getUser(Number(id)) : null;
  if (!user) notFound();
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Modifica utente: {name}', { name: user.username })}</h1></div>
      <UserForm mode="edit" initial={user} isSelf={user.id === me.id} media={await listMedia()} maxMb={Math.round(maxUploadBytes() / 1048576)} />
    </main>
  );
}
