// Serve dist/ in locale per guardare il sito generato. Uso: node scripts/serve.mjs [porta (default 4173)]
// Come in produzione (un proxy davanti al sito statico e all'app), /api/ va all'app Next.js: FORMS_PROXY (default http://localhost:3000).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(process.env.SITE_OUT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist'));
const port = +(process.argv[2] ?? 4173);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };

const proxy = new URL(process.env.FORMS_PROXY ?? 'http://localhost:3000');
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = http.request({ host: proxy.hostname, port: proxy.port, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('app non raggiungibile'); });
    req.pipe(up);
    return;
  }
  let f;
  try { f = path.join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch { res.writeHead(400); res.end('400'); return; }
  if (f !== base && !f.startsWith(base + path.sep)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('403'); return; }   // niente uscite dalla cartella con ../
  if (f.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/  (dist/)`));
