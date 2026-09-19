import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import DocEditor from '../../_editor/DocEditor';

export const dynamic = 'force-dynamic';

export default async function PageEditor({ params }) {
  const user = await requireUser();
  const { key } = await params;
  const doc = await getDoc('page', key);
  if (!doc || doc.deleted_at) notFound();
  return (
    <DocEditor kind="page" docKey={key} title={doc.draft.name?.it || key} initial={doc.draft} rev={doc.rev} state={docState(doc)}
      meta={await editorMeta()} canDelete={user.role === 'admin' && key !== 'home'} canPublish={user.role === 'admin'} />
  );
}
