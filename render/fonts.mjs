// Font in locale: scarica da Google Fonts i woff2 delle famiglie scelte nei token e scrive fonts.css.
// Solo Node (fs + rete). Si riscarica solo se cambiano famiglie, pesi o sottoinsiemi.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fontSpec } from './tokens.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const get = async (url, binary) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
};
const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');

// fontsDir: dove finiscono i woff2. cssPath: dove scrivere fonts.css.
// sourceDirs / sourceCss: file già scaricati da riusare (es. gli asset del progetto). cacheDir: cache persistente, alimentata dai nuovi download.
// Si va in rete solo se le famiglie, i pesi o i sottoinsiemi non sono già disponibili in locale.
// Restituisce { note, preload } (preload: percorsi relativi ad assets/ del font del corpo, sottoinsieme latin).
export async function ensureFonts(t, { fontsDir, cssPath, sourceDirs = [], sourceCss = [], cacheDir, spec: givenSpec }) {
  const spec = givenSpec ?? fontSpec(t);   // spec: per l'anteprima dell'admin, che conosce solo famiglie e pesi, non i token interi
  const key = crypto.createHash('sha1').update(JSON.stringify([spec.families, spec.wMin, spec.wMax, spec.subsets])).digest('hex').slice(0, 12);
  const dirs = [fontsDir, ...sourceDirs, ...(cacheDir ? [cacheDir] : [])];
  const cssCache = cacheDir ? path.join(cacheDir, `css-${key}.css`) : null;
  const preloadOf = (css) => [...css.matchAll(/font-family: "([^"]+)".*?url\(\.\.\/fonts\/([^)]+)\)/g)]
    .filter((m) => m[1] === spec.body && /-latin\.woff2$/.test(m[2])).map((m) => `fonts/${m[2]}`);

  // 1. Esiste già un fonts.css con la stessa chiave e tutti i suoi file? Lo si riusa, senza rete.
  for (const candidate of [cssPath, ...sourceCss, ...(cssCache ? [cssCache] : [])]) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const css = fs.readFileSync(candidate, 'utf8');
    if (!css.includes(`fonts-key: ${key}`)) continue;
    const files = [...css.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)].map((m) => m[1]);
    const where = files.map((f) => dirs.map((d) => path.join(d, f)).find((p) => fs.existsSync(p)));
    if (where.some((w) => !w)) continue;
    fs.mkdirSync(fontsDir, { recursive: true });
    files.forEach((f, i) => { const target = path.join(fontsDir, f); if (!fs.existsSync(target)) fs.copyFileSync(where[i], target); });
    if (candidate !== cssPath) { fs.mkdirSync(path.dirname(cssPath), { recursive: true }); fs.writeFileSync(cssPath, css); }
    return { note: 'font: già in locale, invariati', preload: preloadOf(css) };
  }

  // 2. Altrimenti si scaricano da Google Fonts.
  const existing = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  try {
    fs.mkdirSync(fontsDir, { recursive: true });
    if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
    const faces = [];
    for (const family of spec.families) {
      const fam = family.replace(/ /g, '+');
      let css; let variable = true;
      try { css = await get(`https://fonts.googleapis.com/css2?family=${fam}:wght@${spec.wMin}..${spec.wMax}&display=swap`); }
      catch { variable = false; css = await get(`https://fonts.googleapis.com/css2?family=${fam}:wght@${spec.weights.join(';')}&display=swap`); }
      for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
        const [, subset, body] = m;
        if (!spec.subsets.includes(subset)) continue;
        const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
        const weight = body.match(/font-weight:\s*([^;]+);/)?.[1].trim();
        const range = body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
        if (!url || !weight) continue;
        const file = `${slug(family)}-${subset}${variable ? '' : '-' + weight.replace(/\s+/g, '-')}.woff2`;
        const target = path.join(fontsDir, file);
        if (!fs.existsSync(target)) {
          const cached = dirs.map((d) => path.join(d, file)).find((f) => fs.existsSync(f));
          if (cached) fs.copyFileSync(cached, target); else fs.writeFileSync(target, await get(url, true));
        }
        if (cacheDir && !fs.existsSync(path.join(cacheDir, file))) fs.copyFileSync(target, path.join(cacheDir, file));
        faces.push({ family, subset, weight, range, file });
      }
    }
    if (!faces.length) throw new Error('nessun font trovato per i sottoinsiemi richiesti');
    const out = [`/* GENERATO da scripts/build-tokens.mjs. Non modificare a mano. fonts-key: ${key} */`];
    for (const f of faces) out.push(`@font-face { font-family: "${f.family}"; font-style: normal; font-weight: ${f.weight}; font-display: swap; src: url(../fonts/${f.file}) format("woff2");${f.range ? ` unicode-range: ${f.range};` : ''} }`);
    const cssText = out.join('\n') + '\n';
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    fs.writeFileSync(cssPath, cssText);
    if (cssCache) fs.writeFileSync(cssCache, cssText);
    return { note: `font: ${faces.length} file scaricati`, preload: preloadOf(cssText) };
  } catch (e) {
    if (!existing) throw new Error(`font: download fallito (${e.message}) e nessun fonts.css esistente`);
    return { note: `font: ATTENZIONE, download fallito (${e.message}), tengo quelli esistenti (possono non corrispondere ai token)`, preload: preloadOf(existing) };
  }
}
