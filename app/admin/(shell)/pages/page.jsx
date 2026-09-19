import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { listDocs } from '@/lib/docs.mjs';
import { previewPages } from '@/lib/preview.mjs';
import NewPageForm from './NewPageForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagine | Outsmart CMS' };
const STATE = { clean: ['Pubblicato', 'ok'], modified: ['Modifiche non pubblicate', 'warn'], unpublished: ['Mai pubblicata', 'warn'], deleted: ['Sparirà alla prossima pubblicazione', 'bad'] };

export default async function PagesList() {
  await requireUser();
  const [docs, paths] = await Promise.all([listDocs(), previewPages()]);
  const info = Object.fromEntries(paths.map((p) => [p.key, p]));
  const pages = docs.filter((d) => d.kind === 'page').sort((a, b) => (a.key === 'home' ? -1 : b.key === 'home' ? 1 : (info[a.key]?.path ?? a.key).localeCompare(info[b.key]?.path ?? b.key)));

  return (
    <main className="page">
      <div className="page__head"><h1>Pagine</h1><NewPageForm pages={paths.map(({ key, name }) => ({ key, name }))} /></div>
      <section className="card">
        <table className="table">
          <thead><tr><th>Nome</th><th>Indirizzo</th><th>Stato della pagina</th><th>Pubblicazione</th><th /></tr></thead>
          <tbody>
            {pages.map((d) => {
              const [label, tone] = STATE[d.state];
              const p = info[d.key];
              return (
                <tr key={d.id}>
                  <td>{d.state === 'deleted' ? (d.data.name?.it ?? d.key) : <Link href={`/admin/pages/${d.key}`}>{d.data.name?.it ?? d.key}</Link>}</td>
                  <td className="muted">{p?.path ?? '—'}</td>
                  <td><span className={`tag tag--${d.data.status === 'published' ? 'ok' : 'warn'}`}>{d.data.status === 'published' ? 'Pubblicata' : 'Bozza'}</span></td>
                  <td><span className={`tag tag--${tone}`}>{label}</span></td>
                  <td>{d.state !== 'deleted' && <Link href={`/admin/pages/${d.key}`}>Modifica</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
