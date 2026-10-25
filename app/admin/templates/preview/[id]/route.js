import { currentUser } from '@/lib/auth.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import { renderTemplateThumb } from '@/lib/template-thumb.mjs';

export const dynamic = 'force-dynamic';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' } });

// Miniatura di UN template installato (Admin → Template), con i SUOI contenuti di esempio: solo un admin la vede. La pagina la chiede con
// fetch() e passa la stringa ricevuta a un iframe con sandbox (srcdoc): mai una navigazione diretta a questo indirizzo.
export async function GET(_req, { params }) {
  const t = await getT();
  const user = await currentUser();
  if (!user || user.role !== 'admin') return page('<!doctype html><meta charset="utf-8"><body>' + esc(t('Non autorizzato.')) + '</body>', 401);
  const { id } = await params;
  const r = await renderTemplateThumb(id);
  if (r.error) return page(`<!doctype html><meta charset="utf-8"><body style="font:12px system-ui;padding:1rem;color:#888">${esc(t(r.error))}</body>`, /non trovato/i.test(r.error) ? 404 : 500);
  return page(r.html);
}
