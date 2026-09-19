import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { listDocs, lastPublication } from '@/lib/docs.mjs';
import { previewPages } from '@/lib/preview.mjs';
import PublishPanel from './PublishPanel';

export const dynamic = 'force-dynamic';
const STATE = { clean: ['Pubblicato', 'ok'], modified: ['Modifiche non pubblicate', 'warn'], unpublished: ['Mai pubblicato', 'warn'], deleted: ['Da eliminare', 'bad'] };
const HREF = { tokens: () => '/admin/style', site: () => '/admin/site', shared: () => '/admin/shared', page: (k) => `/admin/pages/${k}` };
const KIND = { tokens: 'Stile', site: 'Dati del sito', shared: 'Blocchi condivisi', page: 'Pagina' };

export default async function Dashboard({ searchParams }) {
  const user = await requireUser();
  const { negato } = await searchParams;
  const [docs, last, pages] = await Promise.all([listDocs(), lastPublication(), previewPages()]);
  const nameOf = Object.fromEntries(pages.map((p) => [p.key, p]));
  const pending = docs.filter((d) => d.state !== 'clean').length;

  return (
    <main className="page">
      <h1>Panoramica</h1>
      {negato && <p className="notice notice--bad" role="alert">Non hai i permessi per quella sezione.</p>}
      <div className="grid2">
        <PublishPanel pending={pending} lastPublication={last && { ...last, created_at: String(last.created_at) }} canPublish={user.role === 'admin'} />
        <section className="card">
          <h2>Cosa puoi modificare</h2>
          <ul className="plain">
            <li><Link href="/admin/pages">Pagine</Link>: contenuti e blocchi, con anteprima dal vivo.</li>
            <li><Link href="/admin/shared">Condivisi</Link>: blocchi usati in più pagine.</li>
            <li><Link href="/admin/requests">Richieste</Link>: i messaggi inviati dai moduli del sito.</li>
            {user.role === 'admin' && <li><Link href="/admin/site">Sito</Link>: azienda, menu, footer, testi fissi.</li>}
            {user.role === 'admin' && <li><Link href="/admin/style">Stile</Link>: colori, testi, pulsanti.</li>}
          </ul>
        </section>
      </div>
      <section className="card">
        <h2>Contenuti</h2>
        <table className="table">
          <thead><tr><th>Tipo</th><th>Nome</th><th>Stato</th><th>Ultima modifica</th></tr></thead>
          <tbody>
            {docs.map((d) => {
              const [label, tone] = STATE[d.state];
              return (
                <tr key={d.id}>
                  <td>{KIND[d.kind]}</td>
                  <td>{d.state === 'deleted' ? (d.key) : <Link href={HREF[d.kind](d.key)}>{d.kind === 'page' ? (nameOf[d.key]?.name ?? d.key) : d.key === 'main' ? KIND[d.kind] : d.key}</Link>}{d.kind === 'page' && nameOf[d.key] && <span className="muted"> {nameOf[d.key].path}</span>}</td>
                  <td><span className={`tag tag--${tone}`}>{label}</span></td>
                  <td className="muted">{new Date(d.draftUpdatedAt).toLocaleString('it-CH')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
