import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth.mjs';
import { formatStamp } from '@/render/format.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { getSubmission, MAIL_LABEL } from '@/lib/requests.mjs';
import { previewPages } from '@/lib/preview.mjs';
import RequestActions from './RequestActions';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Richiesta')} | Atena CMS` }; }
const MAIL_TONE = { sent: 'ok', failed: 'bad', skipped: 'warn', pending: 'warn' };

export default async function RequestPage({ params }) {
  const user = await requireUser('admin');
  const t = await getT();
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const r = await getSubmission(Number(id));
  if (!r) notFound();
  const pages = await previewPages();
  const page = pages.find((p) => p.key === r.page_key);
  const g = await getGeneral();
  const when = formatStamp(r.created_at, g);

  return (
    <main className="page">
      <p className="hint"><Link href="/admin/requests">{t('← Tutte le richieste')}</Link></p>
      <div className="page__head"><h1>{r.formLabel}</h1><span className="muted">{when}</span></div>
      <div className="grid2">
        <section className="card">
          <dl className="req">
            {r.fields.map((f) => (
              <div key={f.name} className={f.long ? 'req__row req__row--long' : 'req__row'}>
                <dt>{f.label}</dt>
                <dd>{f.name === 'email' ? <a href={`mailto:${f.value}`}>{f.value}</a> : f.name === 'telefono' ? <a href={`tel:${f.value.replace(/[^+\d]/g, '')}`}>{f.value}</a> : f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card">
          <h2>{t('Gestione')}</h2>
          <dl className="req">
            <div className="req__row"><dt>{t('Pagina')}</dt><dd>{page ? `${page.name} (${page.path})` : r.page_key}</dd></div>
            <div className="req__row"><dt>{t('Email')}</dt><dd><span className={`tag tag--${MAIL_TONE[r.mail_status]}`}>{t(MAIL_LABEL[r.mail_status])}</span>{r.mailed_at ? ` ${formatStamp(r.mailed_at, g)}` : ''}</dd></div>
            <div className="req__row"><dt>{t('Destinatari')}</dt><dd>{r.recipients ?? '—'}</dd></div>
            {r.mail_error && <div className="req__row"><dt>{t('Errore')}</dt><dd className="bad">{t(r.mail_error)}</dd></div>}
          </dl>
          <RequestActions id={r.id} status={r.status} mailStatus={r.mail_status} isAdmin={user.role === 'admin'} />
        </section>
      </div>
    </main>
  );
}
