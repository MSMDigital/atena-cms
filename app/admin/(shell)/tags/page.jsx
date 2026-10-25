import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState, listDocs, saveDraft } from '@/lib/docs.mjs';
import { requireTemplate } from '@/lib/template.mjs';
import TermsTable from '../_editor/TermsTable';
import { getT } from '@/lib/i18n-server.mjs';
import { baseOf, textOf } from '@/render/translations.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Tag')} | Atena CMS` }; }

export default async function TagsPage() {
  const user = await requireUser('admin');
  const t = await getT();
  if (!requireTemplate().schema.blocks.blocks.some((b) => b.$id.endsWith('/posts-list.json'))) notFound();
  let doc = await getDoc('tags', 'main');
  if (!doc) { await saveDraft('tags', 'main', {}, user.id); doc = await getDoc('tags', 'main'); }
  const B = baseOf((await getDoc('site', 'main'))?.draft);
  const posts = (await listDocs()).filter((d) => d.kind === 'post' && !d.deletedAt);
  const rows = Object.entries(doc.draft ?? {}).map(([key, tg]) => ({ key, name: textOf(tg.name, B, 'it') || key, description: textOf(tg.description, B, 'it'), count: posts.filter((p) => (p.data.tags ?? []).includes(key)).length }));
  return <TermsTable kind="tags" labels={{ one: t('tag'), many: t('Tag'), add: t('Aggiungi tag'), hint: t('Parole chiave più precise delle categorie. Un tag compare sul sito (con la sua pagina) solo se ha almeno un articolo pubblicato.') }} rows={rows} state={docState(doc)} />;
}
