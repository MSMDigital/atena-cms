import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { listDocs, loadData, trashCounts } from '@/lib/docs.mjs';
import { requireTemplate } from '@/lib/template.mjs';
import { checkPost } from '@/lib/post-seo.mjs';
import { listAuthors } from '@/lib/editor-meta.mjs';
import { LOCALES } from '@/schema/common.mjs';
import { previewPages } from '@/lib/preview.mjs';
import { ownsDoc } from '@/lib/permissions.mjs';
import PostsTable from './PostsTable';
import { getT } from '@/lib/i18n-server.mjs';
import { baseOf, textOf } from '@/render/translations.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Articoli')} | Atena CMS` }; }
const STATE = { clean: ['Online', 'ok'], modified: ['Modifiche non pubblicate', 'warn'], unpublished: ['Non ancora pubblicato', 'warn'], deleted: ['Sparirà alla prossima pubblicazione', 'bad'] };
const FILTERS = [['', 'Tutti'], ['published', 'Pubblicati'], ['draft', 'Bozze'], ['scheduled', 'Pianificati']];

export default async function PostsList({ searchParams }) {
  const user = await requireUser('author');
  const t = await getT();
  if (!requireTemplate().schema.blocks.blocks.some((b) => b.$id.endsWith('/posts-list.json'))) notFound();
  const { stato, cat, tag, q } = await searchParams;
  const [docs, data, trash, paths] = await Promise.all([listDocs(), loadData('draft'), trashCounts(), previewPages()]);
  const basePath = paths.find((p) => p.key === (data.site?.blog?.page ?? 'blog'))?.path ?? '/blog/';
  const B = baseOf(data.site);   // i testi si mostrano nella lingua dei contenuti di base
  const name = (map, k) => textOf(map?.[k]?.name, B, 'it') || k;
  const trs = Object.fromEntries(docs.filter((d) => d.kind === 'post' && !d.deletedAt && d.data.translationOf).map((d) => [d.key, d]));
  const enabled = data.site?.locales?.enabled ?? ['it'];
  const all = docs.filter((d) => d.kind === 'post' && !d.deletedAt && !d.data.translationOf && ownsDoc(user, { created_by: d.createdBy, draft: d.data }))   // un autore vede i propri.sort((a, b) => String(b.data.publishAt ?? b.data.date).localeCompare(String(a.data.publishAt ?? a.data.date)));
  const needle = String(q ?? '').trim().toLowerCase();
  const matches = (p) => (!cat || (p.data.categories ?? []).includes(cat)) && (!tag || (p.data.tags ?? []).includes(tag))
    && (!needle || [textOf(p.data.title, B, 'it'), p.key, p.data.slug?.[B] ?? p.data.slug?.it, p.data.author, textOf(p.data.excerpt, B, 'it')].some((v) => String(v ?? '').toLowerCase().includes(needle)));
  const scoped = all.filter(matches);   // i conteggi dei filtri di stato seguono categoria, tag e ricerca
  const count = (s) => (s ? scoped.filter((p) => p.data.status === s).length : scoped.length);
  const posts = stato ? scoped.filter((p) => p.data.status === stato) : scoped;
  const shown = FILTERS.filter(([s]) => s !== 'scheduled' || count('scheduled') > 0 || stato === 'scheduled');
  const rows = posts.map((d) => {
    const [stateLabel, tone] = STATE[d.state] ?? ['—', 'warn'];
    const c = checkPost(d.data, { locale: B });
    return {
      key: d.key, title: textOf(d.data.title, B, 'it') || d.key, author: d.data.author ?? '', slug: d.data.slug ?? {}, status: d.data.status, publishAt: d.data.publishAt ?? '', date: d.data.date,
      categories: (d.data.categories ?? []).map((k) => name(data.categories, k)), tags: (d.data.tags ?? []).map((k) => name(data.tags, k)),
      versions: enabled.length > 1 ? enabled.map((l) => { const tr = trs[`${d.key}--${l}`]; return l === B ? { lang: l, key: d.key, status: d.data.status, state: d.state, isBase: true } : tr ? { lang: l, key: tr.key, status: tr.data.status, state: tr.state } : { lang: l, missing: true }; }) : null,
      stateLabel: t(stateLabel), tone, seo: c.seo, geo: c.geo, online: d.state !== 'unpublished',
      taken: Object.fromEntries(LOCALES.map((l) => [l, all.filter((o) => o.key !== d.key).map((o) => o.data.slug?.[l]).filter(Boolean)])),
    };
  });
  const options = {
    categories: Object.keys(data.categories ?? {}).map((k) => ({ key: k, name: name(data.categories, k) })),
    tags: Object.keys(data.tags ?? {}).map((k) => ({ key: k, name: name(data.tags, k) })),
  };
  const href = (over) => { const p = new URLSearchParams(Object.entries({ stato, cat, tag, q, ...over }).filter(([, v]) => v)); return `/admin/posts${p.size ? `?${p}` : ''}`; };
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Articoli')}</h1><Link className="btn btn--primary" href="/admin/posts/new">{t('Aggiungi articolo')}</Link></div>
      <p className="filters">
        {shown.map(([s, label]) => <Link key={s} href={href({ stato: s })} className={(stato ?? '') === s ? 'is-on' : undefined}>{t(label)} <span className="muted">({count(s)})</span></Link>)}
        {trash.post > 0 && <Link href="/admin/trash?tipo=articoli">{t('Cestino')} <span className="muted">({trash.post})</span></Link>}
      </p>
      <form className="filterbar" method="get" action="/admin/posts" role="search">
        {stato && <input type="hidden" name="stato" value={stato} />}
        <input type="search" name="q" defaultValue={q ?? ''} placeholder={t('Cerca per titolo, indirizzo o autore')} aria-label={t('Cerca negli articoli')} />
        <select name="cat" defaultValue={cat ?? ''} aria-label={t('Filtra per categoria')}><option value="">{t('Tutte le categorie')}</option>{options.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        <select name="tag" defaultValue={tag ?? ''} aria-label={t('Filtra per tag')}><option value="">{t('Tutti i tag')}</option>{options.tags.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select>
        <button className="btn">{t('Filtra')}</button>
        {(cat || tag || q) && <Link className="link" href={href({ stato, cat: '', tag: '', q: '' })}>{t('Azzera')}</Link>}
      </form>
      <PostsTable rows={rows} options={options} baseLang={B} locales={[B]} authors={await listAuthors()} isAdmin={user.role === 'admin'} basePath={basePath} filtered={!!(stato || cat || tag || q)} />
    </main>
  );
}
