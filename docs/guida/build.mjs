// Genera il PDF della guida «Prova in locale» con il brand Outsmart (HTML → Chrome).
// Uso: node docs/guida/build.mjs [--png]   →  docs/guida/Outsmart-CMS-Prova-in-locale.pdf (con --png anche le pagine in docs/guida/anteprima/)
// Serve la connessione a internet: i font (Satoshi, Gambarino, IBM Plex Mono) si caricano da Fontshare e Google Fonts.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const svgUri = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(HERE, 'assets', f)).toString('base64');
const html = fs.readFileSync(path.join(HERE, 'guida.html'), 'utf8').replaceAll('{{LOGO_DARK}}', svgUri('BrightWhiteColoured.svg'));
const htmlOut = path.join(HERE, '.guida.render.html');
fs.writeFileSync(htmlOut, html);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
try {
  const page = await browser.newPage();
  await page.goto('file://' + htmlOut, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ['Satoshi', 'Gambarino', 'IBM Plex Mono'].map((f) => [f, document.fonts.check(`16px "${f}"`)]));
  const missing = fonts.filter(([, ok]) => !ok).map(([f]) => f);
  if (missing.length) throw new Error(`font non caricati: ${missing.join(', ')} (connessione assente?)`);
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
    const foot = p.querySelector('.foot');
    const last = [...p.children].filter((c) => !c.classList.contains('foot')).pop();
    return foot && last && last.getBoundingClientRect().bottom > foot.getBoundingClientRect().top - 4 ? i + 1 : 0;
  }).filter(Boolean));
  if (overflow.length) throw new Error(`il contenuto tocca il piè di pagina nelle pagine: ${overflow.join(', ')}`);
  const pdf = path.join(HERE, 'Outsmart-CMS-Prova-in-locale.pdf');
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('PDF:', path.relative(process.cwd(), pdf));
  if (process.argv.includes('--png')) {
    const dir = path.join(HERE, 'anteprima'); fs.mkdirSync(dir, { recursive: true });
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.6 });
    const pages = await page.$$('.page');
    for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(dir, `p${i + 1}.png`) });
    console.log('Pagine:', pages.length);
  }
} finally { await browser.close(); fs.rmSync(htmlOut, { force: true }); }
