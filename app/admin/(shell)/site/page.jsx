import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import DocEditor from '../_editor/DocEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dati del sito | Outsmart CMS' };

export default async function SiteEditor() {
  const user = await requireUser('admin');
  const doc = await getDoc('site', 'main');
  if (!doc) notFound();
  return <DocEditor kind="site" docKey="main" title="Dati del sito" initial={doc.draft} rev={doc.rev} state={docState(doc)} meta={await editorMeta()} canDelete={false} canPublish={user.role === 'admin'} />;
}
