import { notFound, redirect } from 'next/navigation';
import { requireTemplate } from '@/lib/template.mjs';
import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { editorMeta } from '@/lib/editor-meta.mjs';
import { SITE_GROUPS } from '@/lib/schema-form.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import DocEditor from '../_editor/DocEditor';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Dati del sito')} | Atena CMS` }; }

// I dati del sito in tre viste: Navigazione, SEO & Geo e Dati del sito (il resto). Il documento è sempre uno solo.
export default async function SiteEditor({ searchParams }) {
  await requireUser('admin');
  const t = await getT();
  const { gruppo } = await searchParams;
  if (gruppo === 'lingue') redirect('/admin/settings/languages');   // le lingue hanno la loro pagina
  if (gruppo === 'email') redirect('/admin/email');                    // e l'indirizzo che riceve le richieste dei moduli sta in Email
  const group = Object.hasOwn(SITE_GROUPS, gruppo) ? gruppo : 'generale';
  // Navigazione: se il template scorpora header e footer, la navigazione è lì (Header, e Footer accanto): si apre direttamente l'editor degli header.
  // Alla prima apertura l'editor crea header e footer dal menu e dal piè di pagina dei dati del sito, quindi niente va perso.
  if (group === 'navigazione' && requireTemplate().schema.header?.properties) redirect('/admin/headers');
  const doc = await getDoc('site', 'main');
  if (!doc) notFound();
  return <DocEditor key={group} kind="site" docKey="main" title={t(SITE_GROUPS[group].title)} siteGroup={group} initial={doc.draft} rev={doc.rev} state={docState(doc)} meta={await editorMeta()} canDelete={false} canPublish />;
}
