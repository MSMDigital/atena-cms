// Confronto strutturale tra le pagine di riferimento (reference/) e quelle generate (dist/): stessi elementi, classi, testi e stessi link.
// Ignora ciò che cambia per costruzione: valori di href/src (si confronta la pagina o l'immagine di destinazione), id, style, dimensioni.
// Uso: node templates/mammano/tools/compare-html.mjs [reference] [dist] [--head]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadData, createContext } from '../../../render/context.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const withHead = args.includes('--head');
const [refDir, distDir] = args.filter((a) => !a.startsWith('--')).map((d) => path.resolve(d));
const REF = refDir ?? path.join(ROOT, 'tools/reference');
const DIST = distDir ?? path.resolve(ROOT, '../../dist');

const data = loadData(ROOT);
const ctx = createContext(data, data.site.locales.default);
const FILES = ['index', 'servizi', 'traslochi-privati', 'traslochi-aziendali', 'traslochi-internazionali', 'deposito-sgomberi-imballaggi', 'chi-siamo', 'preventivo', 'contatti'];
const keyOf = (f) => (f === 'index' ? 'home' : f);
const pathToKey = Object.fromEntries(data.pages.map((p) => [ctx.pathOf(p.key), p.key]));

// Eseguita nel browser: descrive il DOM in righe confrontabili.
function outline(side, pathToKey, withHead) {
  const IGNORE_CLASS = new Set(['section--flush-top', 'split__quote', 'contacts']);   // classi nuove al posto di stili inline
  const KEEP = ['data-surface', 'role', 'type', 'name', 'placeholder', 'alt', 'hidden', 'open', 'tabindex', 'hreflang', 'lang', 'title', 'loading', 'fetchpriority', 'scope', 'target', 'rel', 'aria-label', 'aria-current', 'aria-hidden', 'aria-expanded', 'aria-controls', 'inputmode', 'autocomplete', 'required', 'value'];
  const href = (h) => {
    if (/^(tel:|mailto:|https?:)/.test(h) || h === '#' || (h.startsWith('#') && !h.includes('/'))) return h;
    const [p, a] = h.split('#');
    if (side === 'ref') { const m = p.match(/^([\w-]+)\.html$/); return m ? `page:${m[1] === 'index' ? 'home' : m[1]}${a ? '#' + a : ''}` : h; }
    return pathToKey[p] ? `page:${pathToKey[p]}${a ? '#' + a : ''}` : h;
  };
  const src = (s) => (s.includes('assets/img/') ? 'img:' + s.split('assets/img/')[1] : s);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const lines = [];
  const walk = (e, d) => {
    const tag = e.tagName.toLowerCase();
    if (['script', 'style', 'noscript'].includes(tag)) return;
    if (e.classList.contains('map-consent__box')) return;   // il riquadro del consenso (nel prototipo la mappa si caricava da sola)
    if (e.classList.contains('form-error')) return;   // messaggio d'errore dell'invio reale: il prototipo non ce l'aveva
    if (e.classList.contains('lang') || e.classList.contains('lang-mobile')) return;   // selettore lingua: assente con una sola lingua online
    if (e.classList.contains('map-consent')) { for (const c of e.childNodes) if (c.nodeType === 1) walk(c, d); return; }   // contenitore nuovo attorno alla mappa
    const cls = [...e.classList].filter((c) => !IGNORE_CLASS.has(c)).sort();
    const at = [];
    for (const k of KEEP) if (e.hasAttribute(k) && !(k === 'hidden' && tag === 'iframe') && !(k === 'name' && e.type === 'checkbox') && !(k === 'role' && e.classList.contains('form-success'))) at.push(`${k}=${e.getAttribute(k)}`);   // il consenso ora ha un nome (serve al salvataggio)
    if (e.hasAttribute('href') && tag !== 'link') {
      // Nel prototipo Privacy, Note legali, Cookie e il link dell'informativa nel modulo puntavano a "#": ora sono pagine vere, e il confronto lo tiene per buono.
      const legal = side === 'ref' && e.getAttribute('href') === '#' ? { Privacy: 'privacy', 'informativa sulla privacy': 'privacy', 'Note legali': 'note-legali', Cookie: 'cookie' }[e.textContent.trim()] : null;
      at.push('href=' + (legal ? `page:${legal}` : href(e.getAttribute('href'))));
    }
    if (e.hasAttribute('src') && tag !== 'iframe') at.push('src=' + src(e.getAttribute('src')));
    if (tag === 'iframe') at.push('src=' + (e.getAttribute('src') ?? e.getAttribute('data-src')));   // con il consenso l'indirizzo sta in data-src finché non si carica
    lines.push('  '.repeat(d) + tag + (cls.length ? '.' + cls.join('.') : '') + (at.length ? ` [${at.join(' | ')}]` : ''));
    if (tag === 'svg') return;
    for (const c of e.childNodes) {
      if (c.nodeType === 3) { const t = norm(c.textContent); if (t) lines.push('  '.repeat(d + 1) + '"' + t + '"'); }
      else if (c.nodeType === 1) walk(c, d + 1);
    }
  };
  walk(document.body, 0);
  if (withHead) {
    const h = ['title: ' + document.title];
    for (const m of document.head.querySelectorAll('meta[name],meta[property]')) h.push(`meta ${m.getAttribute('name') || m.getAttribute('property')}: ${m.content}`);
    for (const l of document.head.querySelectorAll('link[rel=canonical],link[rel=alternate]')) h.push(`link ${l.rel} ${l.getAttribute('hreflang') || ''}: ${l.href}`);
    for (const s of document.head.querySelectorAll('script[type="application/ld+json"]')) { const o = JSON.parse(s.textContent); h.push('ld ' + o['@type'] + ': ' + JSON.stringify(o, Object.keys(o).sort())); }
    return ['# head', ...h, '# body', ...lines];
  }
  return lines;
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--allow-file-access-from-files'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
let bad = 0;
try {
  for (const f of FILES) {
    const side = async (url, s) => {
      const p = await browser.newPage(); await p.setJavaScriptEnabled(false);
      await p.goto(url, { waitUntil: 'load' });
      const l = await p.evaluate(outline, s, pathToKey, withHead); await p.close(); return l;
    };
    const a = await side(`file://${path.join(REF, f + '.html')}`, 'ref');
    const b = await side(`file://${path.join(DIST, ctx.pathOf(keyOf(f)), 'index.html')}`, 'dist');
    fs.writeFileSync(path.join(tmp, f + '.ref.txt'), a.join('\n') + '\n');
    fs.writeFileSync(path.join(tmp, f + '.dist.txt'), b.join('\n') + '\n');
    let d = '';
    try { execFileSync('diff', ['-u', '--label', `reference/${f}`, '--label', `dist/${f}`, path.join(tmp, f + '.ref.txt'), path.join(tmp, f + '.dist.txt')], { encoding: 'utf8' }); }
    catch (e) { d = e.stdout ?? ''; }
    const n = d.split('\n').filter((l) => /^[+-][^+-]/.test(l)).length;
    console.log(`${f.padEnd(34)} ${n === 0 ? 'identica' : n + ' righe diverse'}`);
    if (n) { bad++; console.log(d.split('\n').slice(0, +(process.env.LINES ?? 40)).join('\n')); }
  }
} finally { await browser.close(); }
console.log(`\n${FILES.length - bad}/${FILES.length} pagine con DOM identico`);
process.exitCode = bad ? 1 : 0;
