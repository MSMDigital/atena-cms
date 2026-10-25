import fs from 'node:fs';
import { currentUser } from '@/lib/auth.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import { thumbnail, findFile, thumbWidth } from '@/lib/media.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Miniatura (480 px, WebP) di un'immagine della libreria, per l'elenco e il selettore.
export async function GET(req, { params }) {
  const t = await getT();
  if (!(await currentUser())) return new Response(t('Non autorizzato'), { status: 401 });
  const { path: segs } = await params;
  let logical;
  try { logical = segs.map(decodeURIComponent).join('/'); } catch { return new Response(t('Non trovato'), { status: 404 }); }

  // SVG: XML testuale, non un'immagine raster — i decodificatori di sharp/libvips sono volutamente bloccati per
  // questo formato (lib/media.mjs). Si serve il file così com'è: il browser lo disegna da solo, e un <img> non
  // esegue eventuali <script> dentro l'SVG (lo farebbe solo aprendolo come documento a sé, non qui).
  if (logical.toLowerCase().endsWith('.svg')) {
    const file = findFile(logical);
    if (!file) return new Response(t('Non trovato'), { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }

  let file = null;
  try { file = await thumbnail(logical, thumbWidth(new URL(req.url).searchParams.get('w'))); } catch { /* file illeggibile: 404 */ }
  if (!file) return new Response(t('Non trovato'), { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
