import { requireUser } from '@/lib/auth.mjs';
import { previewPages } from '@/lib/preview.mjs';
import NewPageForm from '../NewPageForm';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Aggiungi pagina')} | Atena CMS` }; }

export default async function NewPage() {
  await requireUser('author');
  const t = await getT();
  const seen = new Set();
  const pages = (await previewPages()).filter((p) => !p.key.includes('--') && !seen.has(p.key) && seen.add(p.key)).map(({ key, name }) => ({ key, name }));   // una voce per pagina
  return <main className="page"><h1>{t('Aggiungi pagina')}</h1><NewPageForm pages={pages} startOpen /></main>;
}
