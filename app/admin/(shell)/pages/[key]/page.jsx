import { notFound, redirect } from 'next/navigation';
import { ownsDoc } from '@/lib/permissions.mjs';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState, ensure404 } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import { MIN_PASSWORD } from '@/lib/password.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { pageAccessView } from '@/lib/page-access.mjs';
import DocEditor from '../../_editor/DocEditor';
import PagePasswordCard from './PagePasswordCard';
import LangTabs from './LangTabs';

export const dynamic = 'force-dynamic';

export default async function PageEditor({ params }) {
  const user = await requireUser('author');
  const { key } = await params;
  let doc = await getDoc('page', key);
  if (key === '404' && user.role === 'admin' && (!doc || doc.deleted_at)) { await ensure404(user.id); doc = await getDoc('page', key); }   // Impostazioni → 404: si crea dal template al primo accesso
  if (!doc || doc.deleted_at) notFound();
  if (!ownsDoc(user, doc)) redirect('/admin?negato=1');   // un autore apre solo i propri contenuti
  const meta = await editorMeta();
  const isTr = !!doc.draft.translationOf;
  const isNotFound = key === '404' || key.startsWith('404--');
  const baseKey = doc.draft.translationOf ?? key;
  // Con la lingua di base definita, ogni versione si scrive nella sua lingua soltanto (le altre sono altre schede).
  const lang = meta.baseLang ? (doc.draft.lang ?? meta.baseLang) : null;
  const editorMetaFor = lang ? { ...meta, locales: [lang], defaultLocale: lang, docLang: lang } : meta;
  let versions = null;
  if (meta.baseLang && meta.locales.length > 1) {
    versions = await Promise.all(meta.locales.map(async (l) => {
      const k = l === meta.baseLang ? baseKey : `${baseKey}--${l}`;
      const d = k === key ? doc : await getDoc('page', k);
      return d && !d.deleted_at ? { lang: l, key: k, status: d.draft.status } : { lang: l, missing: true };
    }));
  }
  return (
    <>
      {versions && <LangTabs baseKey={baseKey} current={key} versions={versions} />}
      <DocEditor kind="page" docKey={key} title={doc.draft.name?.[lang ?? 'it'] || key} initial={doc.draft} rev={doc.rev} state={docState(doc)}
        meta={editorMetaFor} canDelete={user.role === 'admin' && key !== 'home' && !isNotFound} canPublish={user.role === 'admin'} />
      {user.role === 'admin' && !isTr && !isNotFound && <PagePasswordCard pageKey={key} min={MIN_PASSWORD} access={await pageAccessView(key)} general={publicGeneral(await getGeneral())} />}
    </>
  );
}
