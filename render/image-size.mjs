// Dimensioni di JPEG, PNG, WebP e SVG leggendo l'intestazione del file (per width/height, che evitano lo spostamento del layout al caricamento).
import fs from 'node:fs';

const cache = new Map();

// SVG: XML testuale, non binario — si leggono width/height del tag <svg>, o in mancanza il viewBox.
// Esportata (non solo usata da imageSize): lib/media.mjs la applica a un caricamento appena ricevuto, prima che
// finisca su disco, dove imageSize(file) non può ancora leggerlo.
export function svgSize(b) {
  const text = b.toString('utf8', 0, Math.min(b.length, 8192));   // il tag <svg> è sempre vicino all'inizio
  const tag = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return null;
  const num = (attr) => { const m = tag.match(new RegExp(`${attr}\\s*=\\s*["']?([\\d.]+)`, 'i')); return m ? parseFloat(m[1]) : null; };
  let width = num('width'); let height = num('height');
  if (!width || !height) {
    const vb = tag.match(/viewBox\s*=\s*["']?\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
    if (vb) { width = width || parseFloat(vb[1]); height = height || parseFloat(vb[2]); }
  }
  return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
}

const png = (b) => (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null);

function jpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < b.length) {
    if (b[pos] !== 0xff) { pos++; continue; }
    const marker = b[pos + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(pos + 5), width: b.readUInt16BE(pos + 7) };
    pos += 2 + b.readUInt16BE(pos + 2);
  }
  return null;
}

// WebP: tre varianti dell'intestazione (lossy "VP8 ", lossless "VP8L", estesa "VP8X").
function webp(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  return null;
}

export function imageSize(file) {
  if (cache.has(file)) return cache.get(file);
  let size = null;
  try {
    const b = fs.readFileSync(file);
    size = file.toLowerCase().endsWith('.svg') ? svgSize(b) : (png(b) ?? jpeg(b) ?? webp(b));
  } catch { /* file mancante: niente dimensioni */ }
  if (size) cache.set(file, size);   // i file mancanti non si memorizzano: un caricamento successivo deve essere visto
  return size;
}
