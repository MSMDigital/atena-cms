import Link from 'next/link';
import { requireUser } from '@/lib/auth.mjs';
import { formatStamp } from '@/render/format.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { listSubmissions, submissionCounts, MAIL_LABEL } from '@/lib/requests.mjs';
import { previewPages } from '@/lib/preview.mjs';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Richieste')} | Atena CMS` }; }
const TABS = [['new', 'Nuove'], ['read', 'Lette'], ['archived', 'Archiviate'], [undefined, 'Tutte']];
const TONE = { new: 'warn', read: '', archived: '' };
const STATUS = { new: 'Nuova', read: 'Letta', archived: 'Archiviata' };
const MAIL_TONE = { sent: 'ok', failed: 'bad', skipped: 'warn', pending: 'warn' };

export default async function Requests({ searchParams }) {
  await requireUser('admin');
  const t = await getT();
  const { stato } = await searchParams;
  // Senza scelta si vedono le nuove, che sono quelle da gestire.
  const view = stato === 'tutte' ? undefined : ['new', 'read', 'archived'].includes(stato) ? stato : 'new';
  const [rows, counts, pages] = await Promise.all([listSubmissions({ status: view, limit: 100 }), submissionCounts(), previewPages()]);
  const nameOf = Object.fromEntries(pages.map((p) => [p.key, p.name]));
  const total = counts.new + counts.read + counts.archived;
  const g = await getGeneral();

  return (
    <main className="page">
      <div className="page__head"><h1>{t('Richieste')}</h1></div>
      <nav className="tabs" aria-label={t('Filtro')}>
        {TABS.map(([v, label]) => (
          <Link key={label} href={`/admin/requests?stato=${v ?? 'tutte'}`} className={`tab${view === v ? ' tab--on' : ''}`} aria-current={view === v ? 'page' : undefined}>
            {t(label)} <span className="muted">{v ? counts[v] : total}</span>
          </Link>
        ))}
      </nav>
      <RequestsTable rows={rows} nameOf={nameOf} t={t} g={g} />
    </main>
  );
}

function RequestsTable({ rows, nameOf, t, g }) {
  if (rows.length === 0) return <section className="card"><p className="muted">{t('Nessuna richiesta in questa vista.')}</p></section>;
  return (
    <section className="card">
      <table className="table">
        <thead><tr><th>{t('Ricevuta')}</th><th>{t('Da')}</th><th>{t('Pagina')}</th><th>{t('Stato')}</th><th>{t('Email')}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const who = [r.data.nome, r.data.cognome].filter(Boolean).join(' ') || r.data.email || '—';
            return (
              <tr key={r.id}>
                <td className="muted">{formatStamp(r.created_at, g)}</td>
                <td><Link href={`/admin/requests/${r.id}`}>{who}</Link>{r.data.citta ? <span className="muted"> {r.data.citta}</span> : null}</td>
                <td className="muted">{nameOf[r.page_key] ?? r.page_key}</td>
                <td><span className={`tag${TONE[r.status] ? ` tag--${TONE[r.status]}` : ''}`}>{t(STATUS[r.status])}</span></td>
                <td><span className={`tag tag--${MAIL_TONE[r.mail_status]}`}>{t(MAIL_LABEL[r.mail_status])}</span></td>
                <td><Link href={`/admin/requests/${r.id}`}>{t('Apri')}</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
