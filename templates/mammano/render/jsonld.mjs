// Dati strutturati (schema.org): organizzazione (home), pagina, servizio, briciole di pane, domande frequenti.
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const plain = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export function jsonLd(ctx, page, blocks) {
  const { site } = ctx;
  const c = site.company;
  const base = site.siteUrl;
  const orgId = `${base}/#organization`;
  const url = ctx.urlOf(page.key);
  const out = [];

  if (page.slug[ctx.def] === '') {
    out.push({
      '@context': 'https://schema.org', '@type': 'MovingCompany', '@id': orgId,
      name: c.name, alternateName: c.alternateNames, url: `${base}/`,
      logo: `${base}/assets/img/${c.logoImage}`, image: `${base}/assets/img/${c.image}`,
      foundingDate: String(c.founded),
      founder: c.founder && { '@type': 'Person', name: c.founder.name, jobTitle: ctx.t(c.founder.jobTitle) },
      telephone: c.channels.phone.display, email: c.channels.email.address,
      address: { '@type': 'PostalAddress', streetAddress: c.address.street, postalCode: c.address.zip, addressLocality: c.address.city, addressRegion: c.address.region, addressCountry: c.address.country },
      geo: c.geo && { '@type': 'GeoCoordinates', latitude: c.geo.lat, longitude: c.geo.lng },
      areaServed: c.areaServed?.map((a) => ({ '@type': a.type, name: a.name })),
      knowsLanguage: c.languages,
      sameAs: c.social?.map((s) => s.url),
      priceRange: c.priceRange && ctx.t(c.priceRange),
    });
  } else {
    out.push({ '@context': 'https://schema.org', '@type': 'WebPage', url, name: ctx.t(page.title), about: { '@id': orgId } });
  }

  if (page.service) {
    const name = ctx.t(page.service.name);
    out.push({ '@context': 'https://schema.org', '@type': 'Service', name, serviceType: name, provider: { '@id': orgId }, areaServed: ctx.t(page.service.areaServed), url });
  }

  if (ctx.crumbs.length > 1) {
    out.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: ctx.crumbs.map((cr, i) => ({ '@type': 'ListItem', position: i + 1, name: cr.name, item: base + cr.href })),
    });
  }

  const questions = blocks.filter((b) => b.type === 'faq').flatMap((b) => b.items);
  if (questions.length) {
    out.push({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: questions.map((q) => ({ '@type': 'Question', name: plain(ctx.t(q.question)), acceptedAnswer: { '@type': 'Answer', text: plain(ctx.t(q.answer)) } })),
    });
  }
  return out;
}
