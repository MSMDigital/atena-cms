import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import DocEditor from '../_editor/DocEditor';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Blocchi condivisi')} | Atena CMS` }; }

export default async function SharedEditor() {
  const user = await requireUser('admin');
  const t = await getT();
  const doc = await getDoc('shared', 'main');
  if (!doc) notFound();
  return <DocEditor kind="shared" docKey="main" title={t('Blocchi condivisi')} initial={doc.draft} rev={doc.rev} state={docState(doc)} meta={await editorMeta()} canDelete={false} canPublish={user.role === 'admin'} />;
}
