import { requireUser } from '@/lib/auth.mjs';
import { getDoc, docState } from '@/lib/docs.mjs';
import { previewPages } from '@/lib/preview.mjs';
import StyleEditor from './StyleEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stile | Outsmart CMS' };

export default async function StylePage() {
  await requireUser('admin');
  const doc = await getDoc('tokens', 'main');
  if (!doc) return <main className="page"><p className="notice notice--bad">Nessun dato nel database: esegui <code>npm run db:seed</code>.</p></main>;
  return <StyleEditor initial={doc.draft} published={doc.published} state={docState(doc)} rev={doc.rev} pages={await previewPages()} />;
}
