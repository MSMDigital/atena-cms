import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState, ensureLayoutDocs } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import { requireTemplate } from '@/lib/template.mjs';
import DocEditor from '../_editor/DocEditor';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Header')} | Atena CMS` }; }

export default async function HeaderEditor() {
  const user = await requireUser('admin');
  const t = await getT();
  const tpl = requireTemplate();
  if (!tpl.schema.header?.properties) {
    return <div className="page"><h1>{t('Header')}</h1><p className="muted">{t('Il template attivo ({name}) non prevede più di un header: si modifica da Dati del sito.', { name: tpl.manifest.name })}</p></div>;
  }
  await ensureLayoutDocs(user.id, tpl);
  const doc = await getDoc('headers', 'main');
  if (!doc) notFound();
  return <DocEditor kind="headers" docKey="main" title={t('Header')} initial={doc.draft} rev={doc.rev} state={docState(doc)} meta={await editorMeta()} canDelete={false} canPublish />;
}
