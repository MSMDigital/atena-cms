import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { currentUser } from '@/lib/auth.mjs';
import { ROOT } from '@/lib/env.mjs';
import { verifyPreviewToken } from '@/lib/preview-token.mjs';
import { ensureFonts } from '@/render/fonts.mjs';

export const dynamic = 'force-dynamic';
// Font dell'anteprima: scaricati dal server (una volta) in .cache e serviti da qui. Il browser non contatta mai Google.
const DIR = path.join(ROOT, '.cache/preview-fonts');
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'];
const HEAD = { 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' };   // l'anteprima ha un'origine opaca (sandbox)

export async function GET(req, { params }) {
  const { path: segs } = await params;
  if (segs.length === 2 && segs[0] === 'f' && /^[a-z0-9-]+\.woff2$/.test(segs[1])) {
    const file = path.join(DIR, 'fonts', segs[1]);
    if (!fs.existsSync(file)) return new Response('Non trovato', { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { ...HEAD, 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if (segs.length !== 1 || segs[0] !== 'fonts.css') return new Response('Non trovato', { status: 404 });

  const q = new URL(req.url).searchParams;
  const families = (q.get('f') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const w = /^(\d{3,4})\.\.(\d{3,4})$/.exec(q.get('w') ?? '');
  const subsets = (q.get('s') ?? 'latin').split(',').filter((x) => SUBSETS.includes(x));
  if (!families.length || families.length > 4 || !families.every((f) => FAMILY.test(f)) || !w || !subsets.length) return new Response('Richiesta non valida', { status: 400 });
  const wMin = +w[1]; const wMax = +w[2];
  const spec = { families, weights: [wMin, wMax], wMin, wMax, subsets, body: families[0] };

  const name = crypto.createHash('sha1').update(JSON.stringify([families, wMin, wMax, subsets])).digest('hex').slice(0, 12);
  const cssPath = path.join(DIR, 'css', `${name}.css`);
  if (!fs.existsSync(cssPath)) {
    // Scaricare dalla rete è permesso solo con la sessione o con il token firmato dal server: la richiesta anonima serve solo ciò che c'è già.
    const allowed = (await currentUser()) || verifyPreviewToken('fonts', q.get('t'));
    if (!allowed) return new Response('Non autorizzato', { status: 401 });
    try { await ensureFonts(null, { fontsDir: path.join(DIR, 'fonts'), cssPath, spec }); }
    catch (e) { return new Response(`Font non disponibili: ${e.message}`, { status: 502 }); }
  }
  const css = fs.readFileSync(cssPath, 'utf8').replace(/url\(\.\.\/fonts\/([^)]+)\)/g, 'url(/admin/preview-fonts/f/$1)');
  return new Response(css, { headers: { ...HEAD, 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' } });
}
