// File «protetti» (immagini e PDF marcati nella libreria): non sono file statici del sito ma li serve l'app, da /api/files/<percorso>.
// Si vedono solo se la richiesta nasce da una pagina del sito (un'immagine in una pagina, un link interno, un PDF in un riquadro): l'indirizzo
// scritto a mano nel browser, un segnalibro, un altro sito che lo incorpora o un crawler ricevono «non trovato». Non sono mai indicizzati.
//
// LIMITE, da dire chiaro: l'origine della richiesta la dichiara il browser (Sec-Fetch-Site, Referer). Basta a impedire indirizzi diretti,
// link da altri siti, indicizzazione e scansioni casuali, ma chi vuole può inventarsi quelle intestazioni (curl, uno script): non è
// una protezione per documenti riservati. Per quelli serve una pagina con password.
import { one } from './db.mjs';

// Hostname di un indirizzo, o null.
const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return null; } };

// `hosts`: gli indirizzi (host[:porta]) che contano come «dentro il sito»: quello della richiesta, quelli inoltrati dal proxy e quello pubblico del sito.
export function allowedRequest(headers, hosts) {
  const ok = new Set([...hosts].filter(Boolean).map((h) => h.toLowerCase()));
  const fromSite = hostOf(headers.get('referer') ?? '') && ok.has(hostOf(headers.get('referer')));
  const fetchSite = (headers.get('sec-fetch-site') ?? '').toLowerCase();
  if (fetchSite) {
    if (fetchSite === 'same-origin') return true;
    if (fetchSite === 'same-site') return !!fromSite;
    return false;   // none (indirizzo digitato o segnalibro) o cross-site (un altro sito)
  }
  return !!fromSite;   // browser vecchi o strumenti che non mandano Sec-Fetch-*: conta solo il Referer
}

let cache = { at: 0, files: new Set(), siteHost: null };
// File protetti usati dal sito pubblicato (salvati a ogni pubblicazione) e indirizzo pubblico del sito. Breve cache: una query ogni tanto.
export async function publishedProtected() {
  if (Date.now() - cache.at < 15_000) return cache;
  let files = new Set(); let siteHost = null;
  try {
    const row = await one("SELECT value FROM settings WHERE name = 'protected_published'");
    files = new Set(row ? JSON.parse(row.value) : []);
    const site = await one("SELECT published FROM docs WHERE kind = 'site' AND doc_key = 'main'");
    siteHost = site?.published ? hostOf(JSON.parse(site.published).siteUrl) : null;
  } catch { /* database non raggiungibile: nessun file */ }
  cache = { at: Date.now(), files, siteHost };
  return cache;
}
export const resetProtectedCache = () => { cache = { at: 0, files: new Set(), siteHost: null }; };

export const MIME = { pdf: 'application/pdf', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' };
