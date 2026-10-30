import fs from 'node:fs';
import { findFile, isSafeLogical } from '@/lib/media.mjs';
import { allowedRequest, publishedProtected, MIME } from '@/lib/protected-files.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const notFound = () => new Response('Non trovato', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, noimageindex' } });

// Immagini e PDF «protetti» (vedi lib/protected-files.mjs): si servono solo a chi arriva da una pagina del sito, mai a un indirizzo diretto,
// e solo se il sito pubblicato li usa. Ogni rifiuto è un «non trovato» (non si rivela nemmeno che il file esiste).
async function serve(req, withBody) {
  let logical;
  try { logical = (await req.params).path.map(decodeURIComponent).join('/'); } catch { return notFound(); }
  if (!isSafeLogical(logical)) return notFound();
  const { files, siteHost } = await publishedProtected();
  if (!files.has(logical)) return notFound();
  const h = req.headers;
  const hosts = [h.get('host'), (h.get('x-forwarded-host') ?? '').split(',')[0].trim(), siteHost];
  if (!allowedRequest(h, hosts)) return notFound();
  const file = findFile(logical);
  if (!file) return notFound();
  const ext = logical.slice(logical.lastIndexOf('.') + 1).toLowerCase();
  const type = MIME[ext];
  if (!type) return notFound();
  const headers = {
    'Content-Type': type,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, noimageindex, noarchive, nosnippet',
    'Cache-Control': 'private, no-cache',   // il browser chiede ogni volta: un indirizzo digitato non deve poter pescare dalla cache
    Vary: 'Sec-Fetch-Site, Referer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (ext === 'svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";   // un SVG aperto come documento non esegue nulla (il PDF no: il visualizzatore del browser non funzionerebbe)
  const body = fs.readFileSync(file);
  headers['Content-Length'] = String(body.length);
  return new Response(withBody ? body : null, { status: 200, headers });
}

export const GET = (req, ctx) => serve({ headers: req.headers, params: ctx.params }, true);
export const HEAD = (req, ctx) => serve({ headers: req.headers, params: ctx.params }, false);
