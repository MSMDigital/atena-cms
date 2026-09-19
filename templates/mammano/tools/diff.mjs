// Confronto pixel per pixel tra due cartelle di screenshot (output di shots.mjs).
// Uso: node templates/mammano/tools/diff.mjs <prima> <dopo> [--tol 10] [--out cartella-diff]
// Stampa per pagina: differenza di altezza, % di pixel diversi e le fasce verticali (200 px) più colpite.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const tol = Number(opt('--tol', 10));
const outDir = opt('--out', null);
const [a, b] = args;
if (!a || !b) { console.error('uso: diff.mjs <prima> <dopo> [--tol N] [--out dir]'); process.exit(1); }
if (outDir) fs.mkdirSync(outDir, { recursive: true });

const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const compare = (imgA, imgB, tol) => page.evaluate(async (imgA, imgB, tol) => {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const [A, B] = await Promise.all([load(imgA), load(imgB)]);
  const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
  const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const da = px(A), db = px(B);
  const out = new Uint8ClampedArray(w * h * 4);
  const bands = new Array(Math.ceil(h / 200)).fill(0);
  let diff = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    if (d > tol) { diff++; bands[Math.floor(y / 200)]++; out[i] = 255; out[i + 1] = 0; out[i + 2] = 60; out[i + 3] = 255; }
    else { out[i] = db[i] * .35 + 165; out[i + 1] = db[i + 1] * .35 + 165; out[i + 2] = db[i + 2] * .35 + 165; out[i + 3] = 255; }
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
  return { w, h, hA: A.height, hB: B.height, diff, bands, png: c.toDataURL('image/png') };
}, imgA, imgB, tol);

let total = 0, worst = 0;
for (const vp of ['desktop', 'mobile']) {
  const files = fs.existsSync(path.join(a, vp)) ? fs.readdirSync(path.join(a, vp)).filter((f) => f.endsWith('.png')).sort() : [];
  for (const f of files) {
    const fb = path.join(b, vp, f);
    if (!fs.existsSync(fb)) { console.log(`${vp}/${f}: MANCA nel dopo`); continue; }
    const r = await compare(b64(path.join(a, vp, f)), b64(fb), tol);
    const pct = (100 * r.diff) / (r.w * r.h);
    total += r.diff; worst = Math.max(worst, pct);
    const hot = r.bands.map((n, i) => [i * 200, n / (r.w * 200)]).filter(([, p]) => p > 0.005).sort((x, y) => y[1] - x[1]).slice(0, 4)
      .map(([y, p]) => `y${y}:${(p * 100).toFixed(1)}%`).join(' ');
    console.log(`${vp}/${f.replace('.png', '')}`.padEnd(48), `h ${r.hA}→${r.hB}${r.hA === r.hB ? '' : ' (Δ' + (r.hB - r.hA) + ')'}`.padEnd(20), `diff ${pct.toFixed(2)}%`.padEnd(14), hot);
    if (outDir) { fs.mkdirSync(path.join(outDir, vp), { recursive: true }); fs.writeFileSync(path.join(outDir, vp, f), Buffer.from(r.png.split(',')[1], 'base64')); }
  }
}
console.log(`\ntolleranza per canale: ${tol}/255 | peggiore: ${worst.toFixed(2)}%`);
await browser.close();
