// Controllo delle traduzioni dell'admin. Uso: node scripts/i18n-check.mjs [file o cartella ...]   (senza argomenti: tutta la cartella app/)
//  1. «Mancanti»: frasi passate a t('…') / T('…') che non hanno la traduzione inglese in lib/i18n/en/*.mjs.
//  2. «Da controllare»: testo italiano che sembra a vista ma non passa da t() (testo tra tag JSX, attributi come placeholder/title/aria-label).
// È un controllo a occhio (espressioni regolari, non un parser): serve a non dimenticare frasi, non a certificarle.
import fs from 'node:fs';
import path from 'node:path';
import { EN } from '../lib/i18n/en.mjs';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['app'];
const files = [];
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) { if (!['node_modules', '.next'].includes(path.basename(p))) for (const e of fs.readdirSync(p)) walk(path.join(p, e)); }
  else if (/\.(jsx|js|mjs)$/.test(p) && !/\.test\./.test(p)) files.push(p);
};
roots.forEach(walk);

const ITALIAN = /\b(il|lo|la|le|gli|di|del|della|dei|delle|che|per|non|un|una|è|sono|con|nel|nella|da|si|può|puoi|hai|ha|già|più|tutti|tutte|nessun|nessuna|salva|crea|elimina|modifica|scegli|aggiungi|torna|chiudi|annulla|conferma|prima|dopo|ancora|sito|pagina|pagine|articolo|articoli|immagine|immagini|utente|utenti|password|email|impostazioni|errore|obbligatorio|valido|non valido)\b/i;
const missing = []; const suspect = [];
const tCall = /\b[tT]\(\s*(?:(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\.|[^`\\])*)`)/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = tCall.exec(src))) {
    const key = (m[2] ?? m[3] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
    if (key && !Object.hasOwn(EN, key)) missing.push([f, key]);
  }
  if (!f.endsWith('.jsx')) continue;
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const l = line.replace(/\{[^{}]*\}/g, '{}');
    for (const t of l.matchAll(/>([^<>{}]{3,})</g)) { const s = t[1].trim(); if (/[A-Za-zÀ-ÿ]{3,}/.test(s) && ITALIAN.test(s) && !/^[\w./:-]+$/.test(s)) suspect.push([f, i + 1, s.slice(0, 90)]); }
    for (const a of l.matchAll(/\b(placeholder|title|aria-label|alt|label)="([^"{}]{3,})"/g)) if (ITALIAN.test(a[2])) suspect.push([f, i + 1, `${a[1]}="${a[2].slice(0, 80)}"`]);
    const textLine = line.trim();
    if (/^[A-ZÀ-Ý][^<>{}=;()]{12,}$/.test(textLine) && ITALIAN.test(textLine) && !textLine.startsWith('//') && !textLine.startsWith('*')) suspect.push([f, i + 1, textLine.slice(0, 90)]);
  });
}
const byFile = (rows) => rows.reduce((o, r) => { (o[r[0]] ??= []).push(r.slice(1)); return o; }, {});
const mf = byFile(missing); const sf = byFile(suspect);
console.log(`File controllati: ${files.length} · frasi con t(): ${files.length ? [...new Set(missing.map((x) => x[1]))].length : 0} senza traduzione · testi da controllare: ${suspect.length}`);
for (const [f, rows] of Object.entries(mf)) { console.log(`\n[mancanti] ${f}`); rows.forEach(([k]) => console.log(`  - ${k.slice(0, 110)}`)); }
for (const [f, rows] of Object.entries(sf)) { console.log(`\n[da controllare] ${f}`); rows.forEach(([n, s]) => console.log(`  ${n}: ${s}`)); }
process.exit(missing.length || suspect.length ? 1 : 0);
