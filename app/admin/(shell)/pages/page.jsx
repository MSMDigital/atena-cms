import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { listDocs, loadData, trashCounts } from '@/lib/docs.mjs';
import { previewPages } from '@/lib/preview.mjs';
import { checkPage } from '@/lib/post-seo.mjs';
import { listAuthors } from '@/lib/editor-meta.mjs';
import { LOCALES } from '@/schema/common.mjs';
import { ownsDoc } from '@/lib/permissions.mjs';
import PagesTable from './PagesTable';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Pagine')} | Atena CMS` }; }
const STATE = { clean: ['Pubblicato', 'ok'], modified: ['Modifiche non pubblicate', 'warn'], unpublished: ['Mai pubblicata', 'warn'], deleted: ['Sparirà alla prossima pubblicazione', 'bad'] };
const FILTERS = [['', 'Tutte'], ['published', 'Pubblicate'], ['draft', 'Bozze']];

export default async function PagesList({ searchParams }) {
  const user = await requireUser('author');
  const t = await getT();
  const { stato, q } = await searchParams;
  const [docs, paths, data, trash] = await Promise.all([listDocs(), previewPages(), loadData('draft'), trashCounts()]);
  const locales = data.site?.locales ?? { default: 'it', enabled: ['it'] };
  const baseLang = locales.base ?? 'it';   // la lingua in cui sono scritte le pagine di base; le altre lingue sono documenti a sé
  const info = Object.fromEntries(paths.filter((p) => p.locale === baseLang || !p.key.includes('--')).map((p) => [p.key, p]));
  const trs = Object.fromEntries(docs.filter((d) => d.kind === 'page' && !d.deletedAt && d.data.translationOf).map((d) => [d.key, d]));
  const all = docs.filter((d) => d.kind === 'page' && !d.deletedAt && !d.data.translationOf && d.key !== '404' && ownsDoc(user, { created_by: d.createdBy, draft: d.data }))   // un autore vede le proprie.sort((a, b) => (a.key === 'home' ? -1 : b.key === 'home' ? 1 : (info[a.key]?.path ?? a.key).localeCompare(info[b.key]?.path ?? b.key)));
  const needle = String(q ?? '').trim().toLowerCase();
  const scoped = all.filter((d) => !needle || [d.data.name?.[baseLang], d.key, d.data.slug?.[baseLang], d.data.author, d.data.title?.[baseLang], info[d.key]?.path].some((v) => String(v ?? '').toLowerCase().includes(needle)));
  const count = (s) => (s ? scoped.filter((d) => d.data.status === s).length : scoped.length);
  const pages = stato ? scoped.filter((d) => d.data.status === stato) : scoped;
  const defaultOg = !!data.site?.seo?.defaultOgImage?.src;
  const rows = pages.map((d) => {
    const [stateLabel, tone] = STATE[d.state] ?? ['—', 'warn'];
    const c = checkPage(d.data, { defaultOg });
    return { key: d.key, name: d.data.name?.[baseLang] ?? d.key, title: d.data.title?.[baseLang] ?? '', description: d.data.description?.[baseLang] ?? '', author: d.data.author ?? '', slug: d.data.slug ?? {}, path: info[d.key]?.path ?? '—', online: d.state !== 'unpublished',
      versions: locales.enabled.length > 1 ? locales.enabled.map((l) => { const tr = trs[`${d.key}--${l}`]; return l === baseLang ? { lang: l, key: d.key, status: d.data.status, state: d.state, isBase: true } : tr ? { lang: l, key: tr.key, status: tr.data.status, state: tr.state } : { lang: l, missing: true }; }) : null,
      base: d.key === 'home' ? null : (info[d.key]?.path ?? '/').replace(/[^/]*\/$/, ''),
      taken: Object.fromEntries(LOCALES.map((l) => [l, all.filter((o) => o.key !== d.key && (o.data.parent ?? null) === (d.data.parent ?? null)).map((o) => o.data.slug?.[l]).filter(Boolean)])), status: d.data.status, stateLabel: t(stateLabel), tone, seo: c.seo, geo: c.geo };
  });
  const href = (over) => { const p = new URLSearchParams(Object.entries({ stato, q, ...over }).filter(([, v]) => v)); return `/admin/pages${p.size ? `?${p}` : ''}`; };
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Pagine')}</h1><Link className="btn btn--primary" href="/admin/pages/new">{t('Aggiungi pagina')}</Link></div>
      <p className="filters">
        {FILTERS.map(([s, label]) => <Link key={s} href={href({ stato: s })} className={(stato ?? '') === s ? 'is-on' : undefined}>{t(label)} <span className="muted">({count(s)})</span></Link>)}
        {trash.page > 0 && <Link href="/admin/trash?tipo=pagine">{t('Cestino')} <span className="muted">({trash.page})</span></Link>}
      </p>
      <form className="filterbar" method="get" action="/admin/pages" role="search">
        {stato && <input type="hidden" name="stato" value={stato} />}
        <input type="search" name="q" defaultValue={q ?? ''} placeholder={t('Cerca per nome, indirizzo o autore')} aria-label={t('Cerca nelle pagine')} />
        <button className="btn">{t('Cerca')}</button>
        {q && <Link className="link" href={href({ q: '' })}>{t('Azzera')}</Link>}
      </form>
      <PagesTable rows={rows} locales={[baseLang]} baseLang={baseLang} authors={await listAuthors()} isAdmin={user.role === 'admin'} filtered={!!(stato || q)} />
    </main>
  );
}
