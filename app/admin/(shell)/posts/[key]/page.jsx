import { notFound, redirect } from 'next/navigation';
import { ownsDoc } from '@/lib/permissions.mjs';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import { textOf } from '@/render/translations.mjs';
import DocEditor from '../../_editor/DocEditor';
import LangTabs from '../../pages/[key]/LangTabs';

export const dynamic = 'force-dynamic';

export default async function PostEditor({ params }) {
  const user = await requireUser('author');
  const { key } = await params;
  const doc = await getDoc('post', key);
  if (!doc || doc.deleted_at) notFound();
  if (!ownsDoc(user, doc)) redirect('/admin?negato=1');   // un autore apre solo i propri contenuti
  const meta = await editorMeta();
  const baseKey = doc.draft.translationOf ?? key;
  // Con la lingua di base definita, ogni versione si scrive nella sua lingua soltanto (le altre sono altre schede).
  const lang = meta.baseLang ? (doc.draft.lang ?? meta.baseLang) : null;
  const editorMetaFor = lang ? { ...meta, locales: [lang], defaultLocale: lang, docLang: lang } : meta;
  let versions = null;
  if (meta.baseLang && meta.locales.length > 1) {
    versions = await Promise.all(meta.locales.map(async (l) => {
      const k = l === meta.baseLang ? baseKey : `${baseKey}--${l}`;
      const d = k === key ? doc : await getDoc('post', k);
      return d && !d.deleted_at ? { lang: l, key: k, status: d.draft.status } : { lang: l, missing: true };
    }));
  }
  return (
    <>
      {versions && <LangTabs baseKey={baseKey} current={key} versions={versions} kind="post" />}
      <DocEditor kind="post" docKey={key} title={textOf(doc.draft.title, lang ?? 'it', 'it') || key} initial={doc.draft} rev={doc.rev} state={docState(doc)}
        meta={editorMetaFor} canDelete={user.role === 'admin'} canPublish={user.role === 'admin'} />
    </>
  );
}
