import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState, listDocs, saveDraft } from '@/lib/docs.mjs';
import { requireTemplate } from '@/lib/template.mjs';
import TermsTable from '../_editor/TermsTable';
import { getT } from '@/lib/i18n-server.mjs';
import { baseOf, textOf } from '@/render/translations.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Categorie')} | Atena CMS` }; }

export default async function CategoriesPage() {
  const user = await requireUser('admin');
  const t = await getT();
  if (!requireTemplate().schema.blocks.blocks.some((b) => b.$id.endsWith('/posts-list.json'))) notFound();
  let doc = await getDoc('categories', 'main');
  if (!doc) { await saveDraft('categories', 'main', {}, user.id); doc = await getDoc('categories', 'main'); }
  const B = baseOf((await getDoc('site', 'main'))?.draft);
  const posts = (await listDocs()).filter((d) => d.kind === 'post' && !d.deletedAt);
  const rows = Object.entries(doc.draft ?? {}).map(([key, c]) => ({ key, name: textOf(c.name, B, 'it') || key, description: textOf(c.description, B, 'it'), count: posts.filter((p) => (p.data.categories ?? []).includes(key)).length }));
  return <TermsTable kind="categories" labels={{ one: t('categoria'), many: t('Categorie'), add: t('Aggiungi categoria'), hint: t('Le categorie degli articoli. Una categoria compare sul sito (con la sua pagina) solo se ha almeno un articolo pubblicato.') }} rows={rows} state={docState(doc)} />;
}
