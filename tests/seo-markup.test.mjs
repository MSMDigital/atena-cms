// SEO e GEO generati dal motore: robots.txt dal campo Crawling, sitemap, JSON-LD (organizzazione, pagina, FAQ, fatti), Open Graph, hreflang.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { robotsTxt, sitemapXml, seoHead, AI_BOTS } from '../render/seo.mjs';
import { buildSite } from '../render/build.mjs';
import { loadData } from '../render/context.mjs';
import { validateData } from '../schema/validate.mjs';
import { stopRenderers } from '../render/host.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TPL = path.join(ROOT, 'templates/starter');
test.after(() => stopRenderers());

const site = (crawling) => ({ siteUrl: 'https://x.ch', crawling });

test('robots.txt: di base apre tutto e indica la sitemap', () => {
  const r = robotsTxt(site(undefined));
  assert.match(r, /User-agent: \*\nAllow: \/\n/);
  assert.match(r, /Sitemap: https:\/\/x\.ch\/sitemap\.xml/);
  assert.doesNotMatch(r, /GPTBot/);
});

test('robots.txt: sito chiuso vieta tutto e non nomina i crawler AI', () => {
  const r = robotsTxt(site({ mode: 'closed', aiTraining: 'block' }));
  assert.match(r, /User-agent: \*\nDisallow: \/\n/);
  assert.doesNotMatch(r, /GPTBot/);
});

test('robots.txt: percorsi esclusi e pausa valgono per tutti, anche nei gruppi AI', () => {
  const r = robotsTxt(site({ disallowPaths: ['/riservato/'], crawlDelay: 5, aiTraining: 'block' }));
  assert.match(r, /User-agent: \*\nDisallow: \/riservato\/\nCrawl-delay: 5\n/);
  for (const b of AI_BOTS.aiTraining) assert.match(r, new RegExp(`User-agent: ${b}\\n`));
  assert.match(r, /User-agent: cohere-ai\nDisallow: \/\n/);
});

test('robots.txt: pagine «escludi AI» vietate ai crawler AI consentiti, a meno che honorNoai sia spento', () => {
  const on = robotsTxt(site({ aiSearch: 'allow' }), { noaiPaths: ['/privata/'] });
  assert.match(on, /User-agent: PerplexityBot\n(?:.*\n)*?Disallow: \/privata\//);
  assert.match(on, /User-agent: GPTBot\n(?:.*\n)*?Disallow: \/privata\//);
  const off = robotsTxt(site({ honorNoai: false }), { noaiPaths: ['/privata/'] });
  assert.doesNotMatch(off, /privata/);
});

test('sitemap: lastmod, versioni per lingua e immagine, tutto escapato', () => {
  const x = sitemapXml([{ loc: 'https://x.ch/a?b=1&c=2', lastmod: '2026-01-02', alternates: [{ lang: 'it-CH', href: 'https://x.ch/a' }, { lang: 'x-default', href: 'https://x.ch/a' }], image: 'https://x.ch/i.jpg' }]);
  assert.match(x, /<loc>https:\/\/x\.ch\/a\?b=1&amp;c=2<\/loc><lastmod>2026-01-02<\/lastmod>/);
  assert.match(x, /<xhtml:link rel="alternate" hreflang="it-CH" href="https:\/\/x\.ch\/a"\/>/);
  assert.match(x, /<image:image><image:loc>https:\/\/x\.ch\/i\.jpg<\/image:loc><\/image:image>/);
});

// ---- una pagina vera -------------------------------------------------------------------------------------------------------------------

const build = async (patch) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cms-seomk-')), 'dist');
  const d = structuredClone(loadData(TPL)); patch(d);
  assert.deepEqual(validateData(d).errors, [], 'i dati di prova devono restare validi');
  await buildSite(d, { outDir: out, assetsDir: path.join(TPL, 'assets') });
  const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
  const ld = (f) => JSON.parse(read(f).match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  return { read, ld, out };
};

test('pagina: JSON-LD con organizzazione, sito, pagina, FAQ e fatti; og:image e twitter dalla pagina o dal predefinito', async () => {
  const { read, ld } = await build((d) => {
    d.site.organization = { type: 'LocalBusiness', name: 'Studio X', phone: '+41 91 000 00 00', address: { city: 'Lugano', country: 'CH' }, hours: [{ days: ['Mo', 'Fr'], opens: '09:00', closes: '17:30' }], social: ['https://www.linkedin.com/company/x'], areaServed: ['Lugano'] };
    d.site.geo = { ...(d.site.geo ?? {}), facts: [{ label: { it: 'Fondazione' }, value: { it: '1986' } }] };
    d.site.seo.defaultOgImage = { src: 'demo-lago.jpg', alt: { it: 'Lago' } };
    const home = d.pages.find((p) => p.key === 'home');
    home.faq = [{ question: { it: 'Dove siete?' }, answer: { it: 'A Lugano.' } }];
    home.facts = [{ label: { it: 'Clienti' }, value: { it: '500' } }];
    home.dateModified = '2026-03-04';
  });
  const g = ld('index.html')['@graph'];
  const by = (t) => g.find((n) => n['@type'] === t);
  assert.equal(by('LocalBusiness').name, 'Studio X');
  assert.equal(by('LocalBusiness').openingHoursSpecification[0].dayOfWeek.join(), 'Monday,Friday');
  assert.equal(by('LocalBusiness').additionalProperty[0].value, '1986');
  assert.equal(by('WebSite').publisher['@id'], by('LocalBusiness')['@id']);
  assert.equal(by('WebPage').dateModified, '2026-03-04');
  assert.equal(by('WebPage').about.additionalProperty[0].name, 'Clienti');
  assert.equal(by('FAQPage').mainEntity[0].acceptedAnswer.text, 'A Lugano.');
  const h = read('index.html');
  assert.match(h, /<meta property="og:image" content="https:\/\/www\.esempio\.ch\/assets\/img\/demo-lago\.jpg">/);
  assert.match(h, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(h, /<meta property="og:locale" content="it_CH">/);
  assert.match(read('sitemap.xml'), /<lastmod>2026-03-04<\/lastmod>/);
  assert.match(read('sitemap.xml'), /<image:loc>https:\/\/www\.esempio\.ch\/assets\/img\/demo-lago\.jpg/);
  // nessun valore vuoto nel JSON-LD
  assert.doesNotMatch(read('index.html').match(/application\/ld\+json">(.*?)<\/script>/s)[1], /:null|:""|:\[\]|:\{\}/);
});

test('pagina senza organizzazione: nessun nodo azienda inventato, restano sito e pagina; contatti diventa ContactPage con briciole', async () => {
  const { ld } = await build((d) => { delete d.site.organization; d.pages.find((p) => p.key === 'contatti').contentType = 'contact'; });
  const home = ld('index.html')['@graph'].map((n) => n['@type']);
  assert.deepEqual(home.filter((x) => x !== 'FAQPage'), ['WebSite', 'WebPage']);
  const c = ld('contatti/index.html')['@graph'];
  assert.ok(c.find((n) => n['@type'] === 'ContactPage'));
  assert.equal(c.find((n) => n['@type'] === 'BreadcrumbList').itemListElement.length, 2);
});

test('robots.txt: «escludi AI» e Crawling dei dati del sito arrivano nel file pubblicato', async () => {
  const { read } = await build((d) => {
    d.site.crawling = { aiTraining: 'block', disallowPaths: ['/test/'] };
    d.pages.find((p) => p.key === 'contatti').noai = true;
  });
  const r = read('robots.txt');
  assert.match(r, /User-agent: GPTBot\nUser-agent: ClaudeBot/);
  assert.match(r, /User-agent: PerplexityBot\n(?:.*\n)*?Disallow: \/test\/\nDisallow: \/contatti\//);
});

test('pagina protetta: seoHead non anticipa FAQ, fatti, autore o date', () => {
  const site = { siteUrl: 'https://x.ch', seo: { siteName: 'X' }, locales: { tags: { it: 'it-CH' }, enabled: ['it'] }, strings: {} };
  const page = { key: 'p', name: { it: 'P' }, title: { it: 'P' }, description: { it: 'd' }, protected: true, faq: [{ question: { it: 'Segreto?' }, answer: { it: 'Sì' } }], facts: [{ label: { it: 'a' }, value: { it: 'b' } }], author: 'Mario', dateModified: '2026-01-01' };
  const ctx = { site, t: (v) => v.it, tag: 'it-CH', locale: 'it', def: 'it', enabled: ['it'], isLive: () => true, imageSize: () => null, assetImg: (x) => `/assets/img/${x}`, urlOf: () => 'https://x.ch/p/', pathOf: () => '/p/', byKey: { p: page } };
  const out = String(seoHead(ctx, page, { blocks: [{ type: 'faq', items: page.faq }] }));
  assert.doesNotMatch(out, /Segreto|Mario|2026-01-01|"a"/);
  assert.match(out, /WebPage/);
});
