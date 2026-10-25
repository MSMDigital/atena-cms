import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { submissionCounts } from '@/lib/requests.mjs';
import { logoutAction } from '../login/actions';
import { Suspense } from 'react';
import SideNav from './SideNav';
import { trashCounts } from '@/lib/docs.mjs';
import { activeTemplate } from '@/lib/template.mjs';
import { canWrite, ROLE_LABEL, ownsDoc } from '@/lib/permissions.mjs';
import { getGeneral } from '@/lib/general.mjs';
import { getT, getLang } from '@/lib/i18n-server.mjs';
import { I18nProvider } from '../_i18n/I18nProvider';
import { listDocs } from '@/lib/docs.mjs';
import SidebarPublish from './SidebarPublish';

export default async function Shell({ children }) {
  const user = await requireUser();
  const { new: newRequests } = user.role === 'admin' ? await submissionCounts() : { new: 0 };
  const admin = user.role === 'admin';
  const tpl = activeTemplate();
  const blog = !!tpl?.schema?.blocks?.blocks?.some((b) => b.$id?.endsWith('/posts-list.json'));
  const trash = user.role === 'admin' ? await trashCounts() : { post: 0, page: 0 };
  const layouts = !!tpl?.schema?.header?.properties;
  // Come WordPress: Bacheca, Articoli, Media, Pagine, Moduli (richieste), Aspetto, Impostazioni.
  const general = await getGeneral();
  const T = await getT();
  const lang = await getLang();
  const translate = (list) => list.map((it) => ({ ...it, label: T(it.label), ...(it.children ? { children: translate(it.children) } : {}) }));
  // Modifiche in attesa: un admin tutte, un autore le proprie.
  const pending = canWrite(user) ? (await listDocs()).filter((d) => !['clean', 'trashed'].includes(d.state) && (admin || (['page', 'post'].includes(d.kind) && ownsDoc(user, { created_by: d.createdBy, draft: d.data })))).length : 0;
  const writer = canWrite(user);   // admin e autori; un utente «normale» non ha voci oltre alla bacheca
  const items = [
    { label: 'Bacheca', href: '/admin' },
    ...(blog && writer ? [{ label: 'Articoli', href: '/admin/posts', children: [
      { label: 'Tutti gli articoli', href: '/admin/posts' },
      { label: 'Aggiungi articolo', href: '/admin/posts/new' },
      ...(admin ? [{ label: 'Categorie', href: '/admin/categories' }, { label: 'Tag', href: '/admin/tags' }] : []),
      ...(admin && trash.post > 0 ? [{ label: 'Cestino', href: '/admin/trash?tipo=articoli', badge: trash.post }] : []),
    ] }] : []),
    ...(writer ? [{ label: 'Media', href: '/admin/media' }] : []),
    ...(writer ? [{ label: 'Pagine', href: '/admin/pages', children: [
      { label: 'Tutte le pagine', href: '/admin/pages' },
      { label: 'Aggiungi pagina', href: '/admin/pages/new' },
      ...(admin ? [{ label: 'Blocchi condivisi', href: '/admin/shared' }] : []),
      ...(admin && trash.page > 0 ? [{ label: 'Cestino', href: '/admin/trash?tipo=pagine', badge: trash.page }] : []),
    ] }] : []),
    ...(admin ? [
      { label: 'Richieste', href: '/admin/requests', badge: newRequests },
      { label: 'Utenti', href: '/admin/users', children: [
        { label: 'Tutti gli utenti', href: '/admin/users' },
        { label: 'Aggiungi utente', href: '/admin/users/new' },
      ] },
      { label: 'Aspetto', href: '/admin/style', children: [
        { label: 'Stile', href: '/admin/style' },
        { label: 'Navigazione', href: '/admin/site?gruppo=navigazione' },
        ...(layouts ? [{ label: 'Header', href: '/admin/headers' }, { label: 'Footer', href: '/admin/footers' }] : []),
        { label: 'Template', href: '/admin/templates' },
      ] },
      { label: 'Impostazioni', href: '/admin/settings/general', children: [
        { label: 'Generale', href: '/admin/settings/general' },
        { label: 'Lingue', href: '/admin/settings/languages' },
        { label: '404', href: '/admin/pages/404' },
        { label: 'Dati del sito', href: '/admin/site?gruppo=generale' },
        { label: 'SEO & Geo', href: '/admin/site?gruppo=seo-geo' },
        { label: 'Email', href: '/admin/email' },
        { label: 'Login sicuro', href: '/admin/security' },
        { label: 'Backup', href: '/admin/backup' },
      ] },
    ] : []),
  ];
  return (
    <I18nProvider lang={lang}>
    <div className="shell">
      <aside className="sidebar">
        <Link href="/admin" className="sidebar__brand"><img src="/brand/atena-mark.svg" alt="" width="32" height="32" />Atena</Link>
        <Suspense fallback={null}><SideNav items={translate(items)} /></Suspense>
        {writer && <SidebarPublish pending={pending} canPublish={admin} label={T('Pubblica')} />}
        <div className="sidebar__user">
          <Link href="/admin/account" title={T('Il mio profilo e la password')}>{user.name}</Link>
          <span className="tag">{T(ROLE_LABEL[user.role] ?? user.role)}</span>
          <form action={logoutAction}><button className="link">{T('Esci')}</button></form>
        </div>
      </aside>
      <div className="shell__main">{children}</div>
    </div>
    </I18nProvider>
  );
}
