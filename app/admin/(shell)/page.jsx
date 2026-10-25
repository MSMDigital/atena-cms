import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { listDocs, lastPublication } from '@/lib/docs.mjs';
import { previewPages } from '@/lib/preview.mjs';
import { ownsDoc, ROLE_LABEL } from '@/lib/permissions.mjs';
import PublishPanel from './PublishPanel';
import { formatStamp } from '@/render/format.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { getT, getLang } from '@/lib/i18n-server.mjs';
import { langName } from '@/render/locales.mjs';
import { recentSubmissionCount } from '@/lib/requests.mjs';
import { cmsInfo } from '@/lib/cms-info.mjs';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }) {
  const user = await requireUser();
  const t = await getT();
  const lang = await getLang();
  const { negato } = await searchParams;
  let [docs, last, pages] = await Promise.all([listDocs(), lastPublication(), previewPages()]);
  const g = await getGeneral();
  const info = await cmsInfo();
  const siteDoc = docs.find((d) => d.kind === 'site')?.data;
  // Un autore vede solo i propri contenuti; un utente «normale» nessuno.
  if (user.role !== 'admin') docs = docs.filter((d) => (d.kind === 'page' || d.kind === 'post') && ownsDoc(user, { created_by: d.createdBy, draft: d.data }));
  // Lingue del sito: prima la predefinita (o di base), poi le altre attive; mai «it» per default se i dati dicono altro.
  const loc = siteDoc?.locales ?? {};
  const siteLangs = [...new Set([loc.default ?? loc.base ?? 'it', ...(loc.enabled ?? [])])];
  const enabled = docs.find((d) => d.kind === 'site')?.data?.locales?.enabled ?? ['it'];
  const langOff = (d) => (d.kind === 'page' || d.kind === 'post') && !!d.data.translationOf && !!d.data.lang && !enabled.includes(d.data.lang);   // versione in una lingua tolta dal sito
  const pending = docs.filter((d) => !['clean', 'trashed'].includes(d.state)).length;
  docs = docs.filter((d) => d.state !== 'trashed' && !langOff(d) && !(d.kind === 'page' && (d.key === '404' || d.key.startsWith('404--'))));   // le versioni in lingue disattivate non si mostrano (restano nel conteggio da pubblicare, per toglierle dal sito)

  const nPages = docs.filter((d) => d.kind === 'page').length;
  const nPosts = docs.filter((d) => d.kind === 'post').length;
  const nReq = user.role === 'admin' ? await recentSubmissionCount(7) : 0;

  return (
    <main className="page">
      <h1>{t('Panoramica')}</h1>
      {negato && <p className="notice notice--bad" role="alert">{t('Non hai i permessi per quella sezione.')}</p>}
      <div className="dash">
        <div className="dash__main">
        <PublishPanel pending={pending} lastPublication={last && { ...last, created_at: String(last.created_at), label: formatStamp(last.created_at, g) }} canPublish={user.role === 'admin'} />
        <details className="card fold">
          <summary><h2>{t('Cosa puoi fare')}</h2></summary>
          <p className="muted">{t('Il tuo ruolo:')} <strong>{t(ROLE_LABEL[user.role] ?? user.role)}</strong>.</p>
          {user.role === 'normal' ? (
            <p>{t('Il tuo account non ha ancora privilegi: puoi solo aggiornare il tuo')} <Link href="/admin/account">{t('profilo')}</Link> {t('e la password. Per modificare contenuti chiedi a un amministratore di cambiarti il ruolo.')}</p>
          ) : (
            <ul className="plain">
              <li><Link href="/admin/pages">{t('Pagine')}</Link>: {user.role === 'admin' ? t('contenuti e blocchi, con anteprima dal vivo.') : t('le tue pagine, salvate come bozze.')}</li>
              <li><Link href="/admin/posts">{t('Articoli')}</Link>: {user.role === 'admin' ? t('tutti gli articoli del blog.') : t('i tuoi articoli, salvati come bozze.')}</li>
              <li><Link href="/admin/media">{t('Media')}</Link>: {t('le immagini del sito.')}</li>
              {user.role === 'admin' && <li><Link href="/admin/users">{t('Utenti')}</Link>: {t('crea e modifica gli utenti e i loro ruoli.')}</li>}
              {user.role === 'admin' && <li><Link href="/admin/requests">{t('Richieste')}</Link>: {t('i messaggi inviati dai moduli del sito.')}</li>}
              {user.role === 'admin' && <li><Link href="/admin/site">{t('Sito')}</Link>: {t('azienda, menu, footer, testi fissi.')}</li>}
              {user.role === 'admin' && <li><Link href="/admin/style">{t('Stile')}</Link>: {t('colori, testi, pulsanti.')}</li>}
              {user.role === 'author' && <li>{t('Un amministratore pubblica le tue bozze.')}</li>}
            </ul>
          )}
        </details>
        </div>
        <section className="card card--info">
          <h2>{t('Informazioni sul CMS')}</h2>
          <dl className="info">
            <dt>{t('Versione')}</dt><dd>{info.name}{info.version ? ` ${info.version}` : ''}</dd>
            {info.template && (<><dt>{t('Template')}</dt><dd>{info.template.name} <span className="muted">v{info.template.version}</span></dd></>)}
            <dt>{t('Lingue del sito')}</dt><dd>{siteLangs.map((l) => langName(l, lang)).join(', ')}</dd>
            {siteDoc?.siteUrl && (<><dt>{t('Indirizzo del sito')}</dt><dd><a href={siteDoc.siteUrl} target="_blank" rel="noopener noreferrer">{siteDoc.siteUrl.replace(/^https?:\/\//, '')}</a></dd></>)}
            {user.role === 'admin' && (<>
              <dt>{t('Ambiente')}</dt><dd>{t(info.env)}</dd>
              <dt>{t('Server')}</dt><dd>Node {info.node}{info.next ? ` · Next.js ${info.next}` : ''}</dd>
              {info.db && (<><dt>{t('Database')}</dt><dd>{info.db}</dd></>)}
            </>)}
          </dl>
          {user.role === 'admin' && <p className="muted info__links"><Link href="/admin/backup">{t('Backup')}</Link> · <Link href="/admin/security">{t('Login sicuro')}</Link> · <Link href="/admin/settings/general">{t('Impostazioni generali')}</Link></p>}
        </section>
      </div>
      <section className="card card--flush">
        <h2>{t('Contenuti')}</h2>
        <div className="stats">
          <Link href="/admin/pages" className="stat"><strong>{nPages}</strong><span>{t('Pagine')}</span></Link>
          <Link href="/admin/posts" className="stat"><strong>{nPosts}</strong><span>{t('Articoli')}</span></Link>
          {user.role === 'admin' && <Link href="/admin/requests" className="stat"><strong>{nReq}</strong><span>{t('Richieste')} {t('ultimi 7 giorni')}</span></Link>}
        </div>
      </section>
    </main>
  );
}
