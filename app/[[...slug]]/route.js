// Il sito pubblico, servito direttamente da questa app Next: su un hosting condiviso non è sempre possibile configurare
// un proxy che mandi /admin e /api al processo Node e il resto ai file statici (come fa in locale scripts/serve.mjs).
// Questa route jolly cattura ogni indirizzo che non è /admin, /api o /install (quelli hanno le proprie route, che Next
// fa sempre vincere su questa, più generica) e serve il file corrispondente da SITE_OUT_DIR. Dove un proxy esterno
// instrada correttamente il traffico (file statici serviti da lui, mai da Next), questa route non viene mai invocata:
// nessun costo, solo un'alternativa per chi non ha quella possibilità.
import fs from 'node:fs';
import path from 'node:path';
import { outDir } from '@/lib/docs.mjs';
import { isInstalled } from '@/lib/install.mjs';

export const dynamic = 'force-dynamic';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain',
};

export async function GET(req) {
  if (!(await isInstalled())) return Response.redirect(new URL('/install', req.url), 307);

  const base = path.resolve(outDir());
  const { pathname } = new URL(req.url);
  let f;
  try { f = path.join(base, decodeURIComponent(pathname)); } catch { return new Response('400', { status: 400 }); }
  if (f !== base && !f.startsWith(base + path.sep)) return new Response('403', { status: 403 });   // niente uscite dalla cartella con ../
  if (f.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');

  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
    // Non trovato: la pagina 404 della lingua dell'indirizzo (/en/...), altrimenti quella principale, altrimenti un testo semplice.
    const first = pathname.split('/')[1];
    const nf = [first && /^[a-z]{2,3}$/.test(first) ? path.join(base, first, '404.html') : null, path.join(base, '404.html')].find((x) => x && fs.existsSync(x));
    return nf ? new Response(fs.readFileSync(nf), { status: 404, headers: { 'Content-Type': MIME['.html'] } }) : new Response('404', { status: 404 });
  }
  const buf = fs.readFileSync(f);
  return new Response(buf, { status: 200, headers: { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' } });
}
