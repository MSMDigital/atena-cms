import { requireUser } from '@/lib/auth.mjs';
import { listTemplates, uploadEnabled } from '@/lib/template.mjs';
import { recentAudit } from '@/lib/audit.mjs';
import { LIMITS } from '@/lib/template-install.mjs';
import TemplatesPanel from './TemplatesPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Template | Outsmart CMS' };

export default async function TemplatesPage() {
  await requireUser('admin');
  const templates = listTemplates().map(({ dir, ...t }) => t);
  const events = (await recentAudit(30)).filter((e) => e.action.startsWith('template.')).slice(0, 8).map((e) => ({ ...e, created_at: String(e.created_at) }));
  return (
    <main className="page">
      <div className="page__head"><h1>Template</h1></div>
      <p className="hint">Il template è il design del sito: colori di partenza, blocchi, HTML e contenuti di esempio. Il CMS resta lo stesso. Si installa da un file zip (creato con <code>npm run template:pack</code>) e poi si attiva.</p>
      <TemplatesPanel templates={templates} events={events} maxMb={Math.round(LIMITS.zipBytes / 1048576)} canUpload={uploadEnabled()} />
    </main>
  );
}
