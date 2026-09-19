import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import DocEditor from '../_editor/DocEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blocchi condivisi | Outsmart CMS' };

export default async function SharedEditor() {
  const user = await requireUser();
  const doc = await getDoc('shared', 'main');
  if (!doc) notFound();
  return <DocEditor kind="shared" docKey="main" title="Blocchi condivisi" initial={doc.draft} rev={doc.rev} state={docState(doc)} meta={await editorMeta()} canDelete={false} canPublish={user.role === 'admin'} />;
}
