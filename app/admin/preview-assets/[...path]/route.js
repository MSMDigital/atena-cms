import fs from 'node:fs';
import path from 'node:path';
import { currentUser } from '@/lib/auth.mjs';
import { ROOT } from '@/lib/env.mjs';
import { activeTemplate } from '@/lib/template.mjs';
import { findFile } from '@/lib/media.mjs';
import { isSafeLogical } from '@/render/images.mjs';
import { verifyPreviewToken } from '@/lib/preview-token.mjs';

export const dynamic = 'force-dynamic';
const CLIENT = path.join(ROOT, 'render/client');   // script del motore (/assets/cms/...)
const MIME = { '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

// Solo dentro la cartella indicata: niente uscite con ../
const under = (root, parts) => { const f = path.resolve(root, ...parts); return f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };

export async function GET(req, { params }) {
  const { path: segs } = await params;
  let parts;
  try { parts = segs.map(decodeURIComponent); } catch { return new Response('Non trovato', { status: 404 }); }
  // I file dell'anteprima li chiede un documento con sandbox, quindi senza cookie: i file del TEMPLATE (css, js, font, immagini del template)
  // sono pubblici (finiscono comunque nel sito); le immagini CARICATE dall'admin (non ancora pubblicate) chiedono la sessione oppure un token
  // firmato a scadenza, che l'anteprima mette nell'indirizzo.
  const tpl = activeTemplate();
  let file = null;
  if (parts[0] === 'img') {
    const rel = parts.slice(1).join('/');
    file = tpl && isSafeLogical(rel) ? under(path.join(tpl.assetsDir, 'img'), parts.slice(1)) : null;
    if (!file) {
      const allowed = (await currentUser()) || verifyPreviewToken(rel, new URL(req.url).searchParams.get('t'));
      if (!allowed) return new Response('Non autorizzato', { status: 401 });
      file = findFile(rel);
    }
  } else if (parts[0] === 'cms') file = under(CLIENT, parts.slice(1));
  else if (tpl) file = under(tpl.assetsDir, parts);
  if (!file) return new Response('Non trovato', { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
