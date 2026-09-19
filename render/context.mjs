// Dati del sito + contesto di rendering (lingua, URL, link, testi ricchi).
import fs from 'node:fs';
import path from 'node:path';
import { raw } from './html.mjs';
import { sanitizeRich } from './sanitize.mjs';
import { imageSize } from './image-size.mjs';

export function loadData(root) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const pagesDir = path.join(root, 'content/pages');
  const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.json')).sort().map((f) => read(`content/pages/${f}`));
  return {
    root,
    site: read('content/site.json'),
    shared: read('content/shared.json'),
    tokens: read('tokens.json'),
    meta: fs.existsSync(path.join(root, 'assets/css/tokens.meta.json')) ? read('assets/css/tokens.meta.json') : null,
    pages,
  };
}

const WA = (n) => `https://wa.me/${n.replace(/\D/g, '')}`;

export function createContext(data, locale, opts = {}) {
  const { site, pages } = data;
  const def = site.locales.default;
  const byKey = Object.assign(Object.create(null), Object.fromEntries(pages.map((p) => [p.key, p])));   // senza prototipo: una chiave come "constructor" non deve trovare nulla
  // Cartelle in cui cercare i file delle immagini (progetto, poi caricamenti): servono per width/height.
  const imgDirs = opts.imgDirs ?? (data.root ? [opts.imgDir ?? path.join(data.root, 'assets/img')] : []);   // senza root (processo isolato) le dimensioni arrivano da opts.images

  const t = (v) => (v == null ? '' : typeof v === 'string' ? v : v[locale] ?? v[def] ?? '');
  // Lo slug finisce in un percorso di file e in un indirizzo: solo minuscole, cifre e trattini (mai ../). Uno slug non valido è come vuoto.
  const slugOf = (p, l) => { const s = p.slug?.[l] ?? p.slug?.[def] ?? ''; return typeof s === 'string' && /^[a-z0-9-]*$/.test(s) ? s : ''; };

  // Un indirizzo per lingua: prefisso lingua (tranne la predefinita) + slug di ogni antenato + slug della pagina.
  const pathOf = (key, l = locale) => {
    if (!byKey[key]) return null;
    const segs = [];
    let depth = 0;   // limite: un ciclo tra pagine padre non deve bloccare la build (la validazione lo segnala)
    for (let p = byKey[key]; p && depth++ < 12; p = p.parent ? byKey[p.parent] : null) { const s = slugOf(p, l); if (s) segs.unshift(s); }
    return '/' + [...(l === def ? [] : [l]), ...segs].map((s) => s + '/').join('');
  };
  const urlOf = (key, l = locale) => site.siteUrl + pathOf(key, l);

  const company = site.company;
  const channel = (c) => {
    const ch = company.channels;
    if (c === 'phone' || c === 'mobile') return { href: `tel:${ch[c].number}`, display: ch[c].display };
    if (c === 'whatsapp') return { href: WA(ch.whatsapp.number), display: '' };
    if (c === 'email') return { href: `mailto:${ch.email.address}`, display: ch.email.address };
    throw new Error(`canale sconosciuto: ${c}`);
  };

  const link = (l) => {
    if (l.type === 'page') { const p = pathOf(l.page); return p ? p + (l.anchor ? `#${l.anchor}` : '') : '#'; }   // pagina non ancora creata
    if (l.type === 'anchor') return `#${l.anchor}`;
    if (l.type === 'channel') return channel(l.channel).href;
    return /^(?:https?:|mailto:|tel:)/i.test(l.url ?? '') ? l.url : '#';   // mai javascript: o data: da un indirizzo scritto a mano
  };

  // href="page:chiave#ancora" e href="channel:canale" nei testi ricchi diventano indirizzi veri.
  const resolveHref = (h) => {
    const pg = h.match(/^page:([a-z0-9-]+)(?:#([a-z][a-z0-9-]*))?$/); if (pg) return link({ type: 'page', page: pg[1], anchor: pg[2] });
    const chn = h.match(/^channel:(\w+)$/); if (chn && ['phone', 'mobile', 'whatsapp', 'email'].includes(chn[1])) return link({ type: 'channel', channel: chn[1] });
    return null;
  };
  const richStr = (s) => sanitizeRich(s).replace(/href="([^"]*)"/g, (m, h) => { const r = resolveHref(h); return r ? `href="${r}"` : m; });

  return {
    data, site, tokens: data.tokens, meta: data.meta, shared: data.shared, pages, byKey, locale, def, imgDirs,
    tag: site.locales.tags[locale],
    t,
    rich: (v) => raw(richStr(t(v))),
    richStr,
    pathOf, urlOf, link, channel,
    slugOf,
    enabled: site.locales.enabled,
    isLive: (p, l) => p.status === 'published' && site.locales.enabled.includes(l) && (l === def || !!p.title[l]),
    assetImg: (src) => `/assets/img/${src}`,
    // Dimensioni di un'immagine (per width/height): dalla mappa già calcolata dal motore (nel processo isolato non si leggono file) o dalle cartelle.
    imageSize: (src) => (opts.images ? opts.images[src] ?? null : imgDirs.map((d) => imageSize(path.join(d, src))).find(Boolean) ?? null),
    interp: (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m),
  };
}
