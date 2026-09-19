import { currentUser } from '@/lib/auth.mjs';
import { renderPreview } from '@/lib/preview.mjs';

export const dynamic = 'force-dynamic';

const page = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' } });

export async function GET(_req, { params }) {
  if (!(await currentUser())) return new Response('Non autorizzato', { status: 401 });
  const { path: segs = [] } = await params;
  let pathname;
  try { pathname = '/' + segs.map((s) => decodeURIComponent(s) + '/').join(''); } catch { return page('<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:2rem">Indirizzo non valido.</body>', 400); }
  const r = await renderPreview(pathname);
  if (!r) return page('<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:2rem">Pagina non trovata nell\'anteprima.</body>', 404);
  if (r.error) return page(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:2rem">${String(r.error).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</body>`, 500);
  return page(r.html);
}
