import { requireUser } from '@/lib/auth.mjs';
import { listTemplates, uploadEnabled } from '@/lib/template.mjs';
import { recentAudit } from '@/lib/audit.mjs';
import { LIMITS } from '@/lib/template-install.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import TemplatesPanel from './TemplatesPanel';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Template')} | Atena CMS` }; }

export default async function TemplatesPage() {
  await requireUser('admin');
  const t = await getT();
  const templates = listTemplates().map(({ dir, ...t }) => t);
  const events = (await recentAudit(30)).filter((e) => e.action.startsWith('template.')).slice(0, 8).map((e) => ({ ...e, created_at: String(e.created_at) }));
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Template')}</h1></div>
      <p className="hint">{t('Il template è il design del sito: colori di partenza, blocchi, HTML e contenuti di esempio. Il CMS resta lo stesso. Si installa da un file zip (creato con')} <code>npm run template:pack</code>{t(') e poi si attiva.')}</p>
      <TemplatesPanel templates={templates} events={events} maxMb={Math.round(LIMITS.zipBytes / 1048576)} canUpload={uploadEnabled()} general={publicGeneral(await getGeneral())} />
    </main>
  );
}
