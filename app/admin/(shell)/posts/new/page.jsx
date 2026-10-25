import { requireUser } from '@/lib/auth.mjs';
import NewPostForm from '../NewPostForm';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Aggiungi articolo')} | Atena CMS` }; }

export default async function NewPost() {
  await requireUser('author');
  const t = await getT();
  return <main className="page"><h1>{t('Aggiungi articolo')}</h1><NewPostForm /></main>;
}
