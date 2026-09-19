// Screenshot a pagina intera di tutte le pagine, in modalità ?shot (animazioni concluse, galleria in fila).
// Uso: node templates/mammano/tools/shots.mjs <cartella-html> <cartella-output> [pagina ...]
// Cartella con pagine .html (reference/) → file://. Cartella generata dal build (dist/, URL puliti) → server locale in questo processo.
// Le regole ?shot (dev-shot.css) non stanno nel CSS di produzione: l'harness le inietta sempre, anche sul "prima".
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadData, createContext } from '../../../render/context.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['index', 'servizi', 'traslochi-privati', 'traslochi-aziendali', 'traslochi-internazionali',
  'deposito-sgomberi-imballaggi', 'chi-siamo', 'preventivo', 'contatti'];
const VIEWPORTS = { desktop: [1440, 900], mobile: [390, 844] };

const [base, out, ...only] = process.argv.slice(2);
if (!base || !out) { console.error('uso: shots.mjs <cartella-html> <output> [pagina ...]'); process.exit(1); }
const pages = only.length ? only : ALL;
const devShot = path.resolve(ROOT, '../assets/css/dev-shot.css');
// Modalità dist: percorso pulito di ogni pagina, servito da un server statico locale.
const cleanUrls = fs.existsSync(path.join(base, 'servizi/index.html'));
let server, origin, pathOf;
if (cleanUrls) {
  const ctx = createContext(loadData(path.resolve(ROOT, '..')), 'it');
  pathOf = (name) => ctx.pathOf(name === 'index' ? 'home' : name);
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
  server = http.createServer((req, res) => {
    let f = path.join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (f.endsWith('/')) f += 'index.html';
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); res.end(buf); } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
}
const urlOf = (name, h) => (cleanUrls ? `${origin}${pathOf(name)}?shot&vh=${h}` : `file://${path.resolve(base, name + '.html')}?shot&vh=${h}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
try {
  for (const [vp, [w, h]] of Object.entries(VIEWPORTS)) {
    fs.mkdirSync(path.join(out, vp), { recursive: true });
    for (const p of pages) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(urlOf(p, h), { waitUntil: 'networkidle0' });
      await page.addStyleTag({ path: devShot });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: path.join(out, vp, p + '.png'), fullPage: true });
      await page.close();
      console.log(vp, p);
    }
  }
} finally {
  await browser.close();
  server?.close();
}
