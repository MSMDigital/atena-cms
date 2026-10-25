import { requireUser } from '@/lib/auth.mjs';
import { listTrash } from '@/lib/docs.mjs';
import TrashList from './TrashList';
import { formatStamp } from '@/render/format.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Cestino')} | Atena CMS` }; }

export default async function Trash({ searchParams }) {
  const user = await requireUser('admin');
  const t = await getT();
  const { tipo } = await searchParams;
  const all = await listTrash();
  const g = await getGeneral();
  const items = all.filter((d) => !tipo || (tipo === 'pagine' ? d.kind === 'page' : d.kind === 'post'));
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Cestino')}</h1></div>
      <p className="hint">{t('Pagine e articoli eliminati. Se erano online restano sul sito fino alla prossima pubblicazione. Ripristinati tornano in bozza; «Elimina per sempre» non si può annullare.')}</p>
      <TrashList items={items.map((d) => ({ ...d, deletedAt: String(d.deletedAt), deletedLabel: formatStamp(d.deletedAt, g) }))} canManage={user.role === 'admin'} />
    </main>
  );
}
