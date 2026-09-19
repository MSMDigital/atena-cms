// HTML del prototipo → content/pages/*.json + content/shared.json (blocchi del catalogo).
// Serve a due cose: seminare i contenuti del CMS e dimostrare che il catalogo copre ogni sezione esistente.
// Se incontra una sezione che non riconosce si ferma con un errore, invece di indovinare.
// Uso: node templates/mammano/tools/import-prototype.mjs [cartella-html (default: reference/)] [cartella-content]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlDir = path.resolve(process.argv[2] ?? path.join(ROOT, 'tools/reference'));
const contentDir = path.resolve(process.argv[3] ?? path.join(ROOT, 'content'));
const PAGES = ['index', 'servizi', 'traslochi-privati', 'traslochi-aziendali', 'traslochi-internazionali', 'deposito-sgomberi-imballaggi', 'chi-siamo', 'preventivo', 'contatti'];
const site = JSON.parse(fs.readFileSync(path.join(contentDir, 'site.json'), 'utf8'));
const ch = site.company.channels;

// Valori del prototipo che stavano nel JS o nel CSS e non nell'HTML.
const params = {
  channels: { phone: ch.phone.number, mobile: ch.mobile.number, whatsapp: ch.whatsapp.number, email: ch.email.address },
  displays: { phone: ch.phone.display, mobile: ch.mobile.display, email: ch.email.address },
  companyZones: site.company.zones.map((z) => z.it),
  // fx.js: anteprima foto che segue il cursore sull'elenco servizi
  previews: { 'traslochi-privati.html': 'trasloco-mammano.jpg', 'traslochi-aziendali.html': 'operai-traslochi.jpg', 'traslochi-internazionali.html': 'traslochi-europa.jpg', 'deposito-sgomberi-imballaggi.html': 'elevatore-lugano.jpg', 'servizi.html#noleggio': 'traslochi-paradiso.jpg' },
  // style.css: object-position dell'hero (desktop e mobile)
  heroFocal: { focal: { x: 62, y: 25 }, focalMobile: { x: 70, y: 20 } },
  // fx.js: parola verticale della CTA
  ctaWord: 'Traslochi',
};

// Eseguita nel browser, con JS disattivato: legge il DOM così com'è nel file.
function extract(pageFile, P) {
  const pageKey = pageFile === 'index' ? 'home' : pageFile;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const T = (s) => { const v = norm(s ?? ''); return v ? { it: v } : undefined; };
  const put = (o, k, v) => { if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) o[k] = v; return o; };
  const pageOf = (h) => (h === 'index' ? 'home' : h);

  const hrefToLink = (href) => {
    if (href.startsWith('tel:')) { const n = href.slice(4); const k = ['phone', 'mobile'].find((c) => P.channels[c] === n); if (k) return { type: 'channel', channel: k }; return { type: 'url', url: href }; }
    if (href.startsWith('mailto:')) return href.slice(7) === P.channels.email ? { type: 'channel', channel: 'email' } : { type: 'url', url: href };
    const wa = href.match(/^https:\/\/wa\.me\/(\d+)/); if (wa) return '+' + wa[1] === P.channels.whatsapp ? { type: 'channel', channel: 'whatsapp' } : { type: 'url', url: href };
    if (/^https?:/.test(href)) return { type: 'url', url: href };
    if (href === '#') return { type: 'page', page: 'privacy' };            // segnaposto del prototipo: l'informativa privacy non esiste ancora
    if (href.startsWith('#')) return { type: 'anchor', anchor: href.slice(1) };
    const m = href.match(/^([\w-]+)\.html(?:#([\w-]+))?$/);
    if (m) return put({ type: 'page', page: pageOf(m[1]) }, 'anchor', m[2]);
    throw new Error(`link non riconosciuto: ${href}`);
  };
  const linkHref = (l) => (l.type === 'page' ? `page:${l.page}${l.anchor ? '#' + l.anchor : ''}` : l.type === 'channel' ? `channel:${l.channel}` : l.type === 'anchor' ? `#${l.anchor}` : l.url);

  // Testo con formattazione ammessa (a, strong, em, br); tutto il resto si appiattisce.
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ser = (n) => [...n.childNodes].map((c) => {
    if (c.nodeType === 3) return esc(c.textContent);
    if (c.nodeType !== 1) return '';
    const inner = ser(c); const t = c.tagName;
    if (t === 'A') return `<a href="${linkHref(hrefToLink(c.getAttribute('href')))}">${inner}</a>`;
    if (t === 'STRONG' || t === 'EM') return `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>`;
    if (t === 'BR') return '<br>';
    return inner;
  }).join('');
  const inl = (el) => (el ? T(ser(el)) : undefined);
  const lines = (el) => ({ it: [...el.childNodes].map((c) => (c.tagName === 'BR' ? '\n' : c.textContent)).join('').split('\n').map(norm).join('\n') });

  const focalOf = (img) => { const m = (img.getAttribute('style') || '').match(/object-position:\s*(\d+)%\s+(\d+)%/); return m ? { x: +m[1], y: +m[2] } : undefined; };
  const image = (img, extra = {}) => put(put({ src: img.getAttribute('src').replace(/^assets\/img\//, ''), alt: T(img.getAttribute('alt') || img.getAttribute('data-alt') || '') }, 'focal', extra.focal ?? focalOf(img)), 'focalMobile', extra.focalMobile);

  const button = (a) => {
    const cls = a.className; const link = hrefToLink(a.getAttribute('href'));
    const style = /btn--primary/.test(cls) ? 'primary' : /btn--secondary/.test(cls) ? 'secondary' : /btn--inverse/.test(cls) ? 'inverse' : /btn--wa/.test(cls) ? 'whatsapp' : (() => { throw new Error(`stile pulsante sconosciuto: ${cls}`); })();
    let label = norm(a.textContent);
    if (link.type === 'channel' && label === P.displays[link.channel]) label = '';   // il valore del canale è già il default
    return put({ link, style }, 'label', T(label));
  };
  const buttons = (root) => [...root.querySelectorAll('.btn-row > .btn')].map(button);

  const header = (wrap) => {
    const eyebrow = wrap.querySelector(':scope > .eyebrow'); const head = wrap.querySelector(':scope > .head');
    if (!eyebrow && !head) return undefined;
    const h = head?.querySelector('h2, h3, h4');
    const o = {}; put(o, 'eyebrow', T(eyebrow?.textContent)); put(o, 'title', T(h?.textContent));
    if (h && h.tagName !== 'H2') o.level = h.tagName.toLowerCase();
    put(o, 'text', inl(head?.querySelector(':scope > p')));
    return o;
  };
  const cols = (el) => +(el.className.match(/grid--(\d)/)?.[1] ?? 3);
  const contactItems = (ul) => [...ul.querySelectorAll(':scope > li')].map((li) => {
    const a = li.querySelector(':scope > a'); const box = a ?? li.querySelector('.item');
    const label = T(box.querySelector('small').textContent); let value = norm(box.querySelector('strong').textContent);
    if (!a) return { label, value: T(value) };
    const link = hrefToLink(a.getAttribute('href'));
    if (link.type === 'channel' && value === P.displays[link.channel]) value = '';
    return put({ label, link }, 'value', T(value));
  });
  const specTable = (t) => ({ caption: T(t.querySelector('caption').textContent), rows: [...t.querySelectorAll('tbody tr')].map((tr) => ({ label: T(tr.querySelector('th').textContent), value: T(tr.querySelector('td').textContent) })) });

  const section = (el) => {
    const surface = el.dataset.surface; const anchor = el.id || undefined;
    const base = (type, more) => ({ type, surface, ...(anchor && { anchor }), ...more });
    const wrap = el.querySelector(':scope > .wrap');
    const cls = el.className;

    if (cls.includes('hero')) {
      const badge = el.querySelector('.badge');
      return base('hero', {
        image: image(el.querySelector('.hero__media img'), P.heroFocal),
        titleLine1: T(el.querySelector('.hero__l1').textContent), titleLine2: T(el.querySelector('.hero__l2').textContent),
        claim: lines(el.querySelector('.hero__claim')),
        badge: { ring: el.querySelector('.badge textPath').textContent.split('·').map(T).filter(Boolean), label: T(badge.getAttribute('aria-label')), link: hrefToLink(badge.getAttribute('href')) },
      });
    }
    if (cls.includes('facts-strip')) return base('facts', { label: T(el.getAttribute('aria-label')), items: [...el.querySelectorAll('.facts-strip__grid > div')].map((d) => ({ value: T(d.querySelector('dd').textContent), label: T(d.querySelector('dt').textContent) })) });
    if (cls.includes('gallery')) return base('gallery', { label: T(el.getAttribute('aria-label')), items: [...el.querySelectorAll('figure')].map((f) => ({ image: image(f.querySelector('img')), caption: T(f.querySelector('figcaption').textContent) })) });
    if (cls.includes('cta')) {
      const o = { title: T(wrap.querySelector('h2').textContent) };
      put(o, 'text', inl(wrap.querySelector(':scope > div > p'))); o.buttons = buttons(wrap); o.word = T(P.ctaWord);
      return base('cta', o);
    }
    if (cls.includes('intro')) {
      const side = wrap.querySelector('.intro__side');
      const o = { title: T(wrap.querySelector('h1').textContent), lead: inl(wrap.querySelector('.lead')) };
      put(o, 'summary', inl(wrap.querySelector('.tldr p:not(.tldr__title)'))); put(o, 'buttons', side ? buttons(side) : []);
      return base('page-intro', o);
    }
    if (!cls.split(/\s+/).includes('section')) throw new Error(`sezione non riconosciuta: ${cls}`);

    // ----- sezioni di contenuto -----
    if (wrap.classList.contains('split')) {
      const kids = [...wrap.children]; const mediaEl = kids.find((k) => k.classList.contains('split__media') || k.tagName === 'FIGURE'); const textEl = kids.find((k) => k !== mediaEl);
      const mediaFirst = kids.indexOf(mediaEl) === 0; const reverse = wrap.classList.contains('split--reverse');
      const o = {};
      put(o, 'eyebrow', T(textEl.querySelector('.eyebrow')?.textContent)); o.title = T(textEl.querySelector('h2').textContent);
      const ps = [...textEl.querySelectorAll(':scope > p:not(.eyebrow)')]; if (ps.length) o.body = { it: ps.map((p) => `<p>${inl(p).it}</p>`).join('') };
      o.mediaSide = reverse ? 'right' : mediaFirst ? 'left' : 'right'; o.mobileMedia = mediaFirst ? 'top' : 'bottom';
      o.media = mediaEl.tagName === 'FIGURE'
        ? { type: 'quote', image: image(mediaEl.querySelector('img')), quote: T(mediaEl.querySelector('blockquote').textContent), author: T(mediaEl.querySelector('figcaption').textContent) }
        : { type: 'image', image: image(mediaEl.querySelector('img')) };
      const list = textEl.querySelector('ul.list'); const table = textEl.querySelector('table.spec'); const arrow = textEl.querySelector('a.arrow');
      if (list) o.extra = { type: 'list', items: [...list.children].map((li) => { const s = li.querySelector('strong'); const it = {}; if (s) { it.label = T(s.textContent); s.remove(); } it.text = inl(li); return it; }) };
      else if (table) o.extra = { type: 'table', table: specTable(table) };
      if (arrow) o.action = { label: T(arrow.textContent), link: hrefToLink(arrow.getAttribute('href')) };
      return base('split', o);
    }
    if (wrap.classList.contains('layout-form')) {
      const form = wrap.querySelector('form'); const fields = [];
      for (const d of form.querySelectorAll('.form-grid > *')) {
        const ctl = d.querySelector('input, select, textarea'); const btn = d.querySelector('button');
        if (btn) continue;
        if (d.querySelector('label.check')) { fields.push({ name: 'privacy', type: 'consent', label: inl(d.querySelector('label.check span')), required: ctl.required, width: 'full' }); continue; }
        const lab = d.querySelector('label').cloneNode(true); lab.querySelectorAll('.opt').forEach((x) => x.remove());
        const f = { name: ctl.name, type: ctl.tagName === 'SELECT' ? 'select' : ctl.tagName === 'TEXTAREA' ? 'textarea' : ctl.type, label: T(lab.textContent), required: ctl.required };
        put(f, 'placeholder', T(ctl.getAttribute('placeholder'))); if (ctl.getAttribute('autocomplete')) f.autocomplete = ctl.getAttribute('autocomplete'); if (d.classList.contains('full')) f.width = 'full';
        if (ctl.tagName === 'SELECT') f.options = [...ctl.options].filter((op) => op.value !== '').map((op) => T(op.text));
        fields.push(f);
      }
      const aside = wrap.querySelector('aside .contact-big');
      const o = { label: T(form.getAttribute('aria-label')), fields, submitLabel: T(form.querySelector('button[type=submit]').textContent), successMessage: T(form.querySelector('.form-success').textContent) };
      put(o, 'note', inl(form.querySelector('.form-note'))); if (aside) o.aside = { items: contactItems(aside) };
      o.delivery = { recipients: [P.channels.email], subject: form.getAttribute('aria-label') };
      return base('form', o);
    }
    if (wrap.querySelector(':scope iframe.map')) {
      const q = new URL(wrap.querySelector('iframe.map').src).searchParams.get('q');
      const o = { items: contactItems(wrap.querySelector('ul.contact-big')), map: { query: q, title: T(wrap.querySelector('iframe.map').getAttribute('title')) } };
      return base('contacts', o);
    }

    const h = header(wrap); const o = {}; put(o, 'header', h);
    const points = wrap.querySelector(':scope > .grid > .point'); const cards = wrap.querySelector(':scope > .grid > article.card');
    const steps = wrap.querySelector(':scope > ol.steps'); const rows = wrap.querySelector(':scope > ul.index-list'); const zones = wrap.querySelector(':scope > ul.zones');
    const faq = wrap.querySelector(':scope > .faq'); const spec = wrap.querySelector(':scope > table.spec');
    if (points) {
      const grid = points.parentElement; o.layout = 'points'; o.columns = cols(grid); o.numbered = !!grid.querySelector('.point__n');
      o.items = [...grid.querySelectorAll(':scope > .point')].map((p) => put({ title: T(p.querySelector('h3').textContent) }, 'text', inl(p.querySelector('p'))));
      return base('items', o);
    }
    if (cards) {
      const grid = cards.parentElement; o.layout = 'cards'; o.columns = cols(grid);
      o.items = [...grid.querySelectorAll(':scope > article.card')].map((c) => { const a = c.querySelector('h2 a, h3 a'); return put(put({ title: T(a.textContent), link: hrefToLink(a.getAttribute('href')), image: image(c.querySelector('.card__media img')) }, 'text', inl(c.querySelector(':scope > p'))), 'linkLabel', T(c.querySelector('.arrow')?.textContent)); });
      return base('items', o);
    }
    if (steps) { o.layout = 'steps'; o.items = [...steps.querySelectorAll(':scope > li')].map((li) => put({ title: T(li.querySelector('h3').textContent) }, 'text', inl(li.querySelector('p')))); return base('items', o); }
    if (rows) {
      o.layout = 'rows';
      o.items = [...rows.querySelectorAll(':scope > li > a')].map((a) => {
        const href = a.getAttribute('href'); const title = T(a.querySelector('.t').textContent); const it = { title, link: hrefToLink(href) };
        put(it, 'text', T(a.querySelector('.d')?.textContent));
        if (P.previews[href]) it.previewImage = { src: 'sito-attuale/' + P.previews[href], alt: title };
        return it;
      });
      return base('items', o);
    }
    if (zones) {
      const items = [...zones.querySelectorAll(':scope > li')].map((li) => norm(li.textContent));
      if (JSON.stringify(items) === JSON.stringify(P.companyZones)) o.source = 'company'; else { o.source = 'custom'; o.items = items.map(T); }
      return base('zones', o);
    }
    if (faq) { o.firstOpen = faq.querySelector('details')?.hasAttribute('open') ?? false; o.items = [...faq.querySelectorAll(':scope > details')].map((d) => ({ question: T(d.querySelector('summary').textContent), answer: inl(d.querySelector('p')) })); return base('faq', o); }
    if (spec) { o.table = specTable(spec); return base('spec-table', o); }
    throw new Error(`sezione di contenuto non riconosciuta in ${pageKey}: ${wrap.className} > ${[...wrap.children].map((c) => c.tagName + '.' + c.className).join(', ')}`);
  };

  const blocks = [];
  for (const el of document.querySelector('main').children) {
    if (el.classList.contains('marquee')) blocks.push({ type: 'marquee', surface: el.dataset.surface, items: [...el.querySelector('.marquee__group').querySelectorAll('span')].map((s) => T(s.textContent)) });
    else if (el.classList.contains('wide-media')) { const img = el.querySelector('img'); blocks.push({ type: 'wide-image', image: image(img) }); }
    else blocks.push(section(el));
  }

  const crumbs = [...document.querySelectorAll('.crumbs li')];
  const parentLink = crumbs.length === 3 ? crumbs[1].querySelector('a') : null;
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content;
  // Slug per lingua: ultimo segmento del percorso in <link rel="alternate" hreflang> (gli URL sono gerarchici e tradotti).
  const slug = {};
  for (const l of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    const code = l.getAttribute('hreflang'); if (code === 'x-default') continue;
    const segs = new URL(l.href).pathname.split('/').filter(Boolean).filter((s) => s !== code || s.length > 2);
    slug[code] = code === 'it' ? (segs.at(-1) ?? '') : (segs.filter((s) => s !== code).at(-1) ?? '');
  }
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  const svc = ld.find((x) => x['@type'] === 'Service');
  return {
    key: pageKey, status: 'published', slug,
    ...(svc ? { service: { name: T(svc.name), areaServed: T(svc.areaServed) } } : {}),
    ...(parentLink ? { parent: pageOf(parentLink.getAttribute('href').replace('.html', '')) } : {}),
    name: T(crumbs.length ? crumbs[crumbs.length - 1].textContent : 'Home'),
    title: T(document.title), description: T(meta('description')), blocks,
  };
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--allow-file-access-from-files'] });
const pages = [];
try {
  for (const f of PAGES) {
    const p = await browser.newPage();
    await p.setJavaScriptEnabled(false);
    await p.goto(`file://${path.join(htmlDir, f + '.html')}`, { waitUntil: 'load' });
    pages.push(await p.evaluate(extract, f, params).catch((e) => { throw new Error(`${f}: ${e.message}`); }));
    await p.close();
  }
} finally { await browser.close(); }

// Nastro identico in tutte le pagine → blocco condiviso.
const shared = {};
const sig = (b) => JSON.stringify([b.surface, b.items]);
const marquees = pages.flatMap((pg) => pg.blocks.filter((b) => b.type === 'marquee'));
if (marquees.length && marquees.every((m) => sig(m) === sig(marquees[0]))) {
  shared['marquee-servizi'] = { id: 'marquee-servizi', ...marquees[0] };
}

// Id dei blocchi: <pagina>-<n>-<tipo>.
for (const pg of pages) {
  pg.blocks = pg.blocks.map((b, i) => {
    if (b.type === 'marquee' && shared['marquee-servizi']) return { id: `${pg.key}-${i + 1}-marquee`, type: 'shared', ref: 'marquee-servizi' };
    return { id: `${pg.key}-${i + 1}-${b.type}`, ...b };
  });
}

fs.mkdirSync(path.join(contentDir, 'pages'), { recursive: true });
for (const pg of pages) fs.writeFileSync(path.join(contentDir, 'pages', `${pg.key}.json`), JSON.stringify(pg, null, 2) + '\n');
fs.writeFileSync(path.join(contentDir, 'shared.json'), JSON.stringify(shared, null, 2) + '\n');
console.log(`${pages.length} pagine, ${pages.reduce((n, p) => n + p.blocks.length, 0)} blocchi, ${Object.keys(shared).length} blocchi condivisi → ${path.relative(process.cwd(), contentDir) || '.'}`);
