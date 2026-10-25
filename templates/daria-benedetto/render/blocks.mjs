// I blocchi del template Daria Benedetto. Ogni funzione riceve (ctx, blocco) e restituisce HTML. Il testo dei campi va SEMPRE tramite html``
// (escapa da solo): solo i testi ricchi passano da ctx.rich(), che li sanifica.
import { html, attr, raw, el } from '@cms/kit';
import { surface, anchor, pad, img, button, newTab } from './common.mjs';
import { arrow, check, network, icon, external } from './icons.mjs';

const num = (n) => String(n + 1).padStart(2, '0');
const lines = (s) => String(s).split('\n').flatMap((l, i) => (i ? [raw('<br>'), l] : [l]));
const sec = (b, cls, inner) => html`<section class="${cls}"${surface(b)}${anchor(b)}${pad(b)}>${inner}</section>`;

// Cornice dell'immagine: «arch» = ritratto (PNG ritagliato) su un arco colorato, «rounded» = foto con angoli morbidi, «plain» = così com'è.
const SPARK = '<svg class="frame__spark" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.7 5.6 3 8.4 9.5 10.5-6.5 2.1-8.8 4.9-9.5 10.5-.7-5.6-3-8.4-9.5-10.5C9 9.9 11.3 7.1 12 1.5z" fill="currentColor"/></svg>';
const frame = (ctx, im, shape = 'arch', { priority = false, decor = 'dots' } = {}) => html`<div class="frame frame--${shape}">
    ${shape === 'arch' ? raw(decor === 'sparkles' ? `<span class="frame__arch"></span><span class="frame__spark-a">${SPARK}</span><span class="frame__spark-b">${SPARK}</span>` : '<span class="frame__arch"></span><span class="frame__dot frame__dot--a"></span><span class="frame__dot frame__dot--b"></span>') : ''}
    ${shape === 'arch-photo' ? raw('<span class="frame__back"></span><span class="frame__dot frame__dot--b"></span>') : ''}
    ${img(ctx, im, { priority })}
  </div>`;

const head = (ctx, h, id) => {
  if (!h) return '';
  const lvl = h.level ?? 'h2';
  return html`<header class="head">
    ${h.eyebrow ? html`<p class="eyebrow"><span class="eyebrow__bar"></span><span>${ctx.t(h.eyebrow)}</span></p>` : ''}
    ${el(lvl, id ? { id } : {}, ctx.rich(h.title))}
    ${h.text ? html`<p class="lead">${ctx.rich(h.text)}</p>` : ''}
  </header>`;
};
const actions = (ctx, list) => ((list ?? []).length ? html`<div class="actions">${list.map((x) => button(ctx, x))}</div>` : '');
const logoImg = (ctx, im, cls = 'logo') => html`<img class="${cls}" src="${ctx.assetImg(im.src)}" alt="${ctx.t(im.alt)}" loading="lazy">`;
const maybeLink = (ctx, l, inner, cls = '') => (l ? html`<a${attr('class', cls)} href="${ctx.link(l)}">${inner}</a>` : inner);

// ---- copertina ---------------------------------------------------------------------------------------------------------------------------

const heroPortrait = (ctx, b) => sec(b, `hero-p${b.image ? ' hero-p--img' : ''}${b.split && !b.image ? ' hero-p--split' : ''}`, html`<div class="wrap hero-p__in">
  <div class="hero-p__text">
    ${b.eyebrow ? html`<p class="eyebrow"><span class="eyebrow__bar"></span><span>${ctx.rich(b.eyebrow)}</span></p>` : ''}
    <h1>${ctx.rich(b.title)}</h1>
    ${b.lead ? html`<div class="hero-p__lead prose">${ctx.rich(b.lead)}</div>` : ''}
    ${(b.buttons ?? []).length || b.platform ? html`<div class="actions">${(b.buttons ?? []).map((x) => button(ctx, x))}${b.platform ? html`<a class="btn btn--platform" href="${ctx.link(b.platform.link)}"${newTab(b.platform.link)}><span>${ctx.t(b.platform.label)}</span>${b.platform.logo ? html`<img src="${ctx.assetImg(b.platform.logo.src)}" alt="${ctx.t(b.platform.logo.alt)}" loading="lazy">` : ''}${external()}</a>` : ''}</div>` : ''}
    ${b.brands ? html`<div class="brands"><p class="brands__label">${ctx.t(b.brands.label)}</p><div class="brands__list">${b.brands.items.map((x) => maybeLink(ctx, x.link, logoImg(ctx, x.image, 'brands__logo')))}</div></div>` : ''}
  </div>
  ${b.image ? html`<div class="hero-p__media">${frame(ctx, b.image, b.shape ?? 'arch', { priority: true, decor: b.decor })}</div>` : ''}
</div>`);

const statement = (ctx, b) => sec(b, 'statement', html`<div class="wrap statement__in">
  <p class="statement__fig" aria-hidden="true">${ctx.t(b.figure)}</p>
  <p class="statement__text"><span class="sr-only">${ctx.t(b.figure)} </span>${ctx.rich(b.text)}</p>
</div>`);

// ---- percorso a passi / punti / colonne -----------------------------------------------------------------------------------------

const steps = (ctx, b) => sec(b, `section steps steps--${b.layout ?? 'row'}${b.headerSplit ? ' steps--split' : ''}${b.titleCaps ? ' steps--caps' : ''}`, html`<div class="wrap">
  ${head(ctx, b.header, `${b.id}-t`)}
  <ol class="steps__list">${b.items.map((s, i) => html`<li><span class="steps__n">${String(i + 1)}</span><div><h3>${ctx.t(s.title)}</h3>${s.text ? html`<p>${ctx.rich(s.text)}</p>` : ''}</div></li>`)}</ol>
  ${b.note ? html`<p class="steps__note">${ctx.rich(b.note)}</p>` : ''}
</div>`);

// Riquadri («tiles»): schede con icona e/o numero, titolo e testo. `featured` = scheda grande (prima riga), `tone` = colore della scheda.
const tile = (ctx, it, i, showNumbers) => html`<li class="tile tile--${it.tone ?? 'default'}${it.featured ? ' tile--lg' : ''}">
    ${it.featured ? raw('<span class="tile__dot" aria-hidden="true"></span>') : ''}
    ${it.icon || showNumbers ? html`<span class="tile__top">${it.icon ? html`<span class="tile__ic">${icon(it.icon, it.featured ? 30 : 26)}</span>` : ''}${showNumbers ? html`<span class="tile__n">${num(i)}</span>` : ''}</span>` : ''}
    ${it.title ? html`<h3>${ctx.t(it.title)}</h3>` : ''}
    ${it.text ? html`<p>${ctx.rich(it.text)}</p>` : ''}
  </li>`;

const tiles = (ctx, b) => {
  const showNumbers = b.showNumbers !== false;
  const min = Math.min(480, Math.max(160, Math.round(Number(b.tileMin)) || 260));
  const all = b.items.map((it, i) => ({ it, i }));
  const big = all.filter((x) => x.it.featured);
  const rest = all.filter((x) => !x.it.featured);
  return html`${big.length ? html`<ul class="tiles tiles--lg">${big.map((x) => tile(ctx, x.it, x.i, showNumbers))}</ul>` : ''}${rest.length ? html`<ul class="tiles" style="--tile-min:${String(min)}px">${rest.map((x) => tile(ctx, x.it, x.i, showNumbers))}</ul>` : ''}`;
};

const points = (ctx, b) => {
  const layout = b.layout ?? 'numbered';
  const cols = Math.min(4, Math.max(1, Number(b.columns) || 2));
  const body = (it) => html`${it.kicker ? html`<span class="pts__kicker">${ctx.t(it.kicker)}</span>` : ''}${it.title ? html`<h3>${ctx.t(it.title)}</h3>` : ''}${it.text ? html`<p>${ctx.rich(it.text)}</p>` : ''}`;
  const list = layout === 'tags'
    ? html`<ul class="tags">${b.items.map((it) => html`<li>${ctx.t(it.title ?? it.text)}</li>`)}</ul>`
    : layout === 'tiles' ? tiles(ctx, b)
    : html`<ul class="pts pts--${layout} pts--c${String(cols)}">${b.items.map((it, i) => (layout === 'links' && it.link
      ? html`<li><a class="pts__a" href="${ctx.link(it.link)}"><span>${body(it)}</span><span class="pts__go">${arrow()}</span></a></li>`
      : layout === 'numbered' ? html`<li><span class="pts__n">${num(i)}</span><div>${body(it)}</div></li>`
      : layout === 'checks' ? html`<li><span class="pts__ck">${check()}</span><div>${body(it)}</div></li>`
      : html`<li class="${it.tone && it.tone !== 'default' ? `pts__li--${it.tone}` : ''}">${body(it)}</li>`))}</ul>`;
  const aside = b.aside ? html`<div class="points__aside"><span class="points__aside-dot" aria-hidden="true"></span><p class="points__aside-fig">${ctx.t(b.aside.figure)}</p><p class="points__aside-text">${ctx.rich(b.aside.text)}</p></div>` : '';
  return sec(b, `section points points--${layout}${aside ? ' points--aside' : ''}`, html`<div class="wrap">
    ${aside
      ? html`<div class="points__split"><div class="points__side">${head(ctx, b.header, `${b.id}-t`)}${aside}</div><div class="points__main">${list}</div></div>`
      : html`${head(ctx, b.header, `${b.id}-t`)}
    ${b.intro ? html`<p class="points__intro">${ctx.rich(b.intro)}</p>` : ''}
    ${list}
    ${b.note ? html`<p class="points__note">${ctx.rich(b.note)}</p>` : ''}`}
  </div>`);
};

const columns = (ctx, b) => sec(b, 'section cols', html`<div class="wrap">
  ${head(ctx, b.header, `${b.id}-t`)}
  <div class="cols__grid cols__grid--${String(b.items.length)}">${b.items.map((c) => html`<div class="col col--${c.style ?? 'plain'}">
    ${c.eyebrow ? html`<p class="eyebrow"><span class="eyebrow__bar"></span><span>${ctx.t(c.eyebrow)}</span></p>` : ''}
    <h3>${ctx.rich(c.title)}</h3>
    ${c.content ? html`<div class="prose">${ctx.rich(c.content)}</div>` : ''}
    ${(c.tags ?? []).length ? html`<ul class="tags">${c.tags.map((t) => html`<li>${ctx.t(t)}</li>`)}</ul>` : ''}
    ${(c.steps ?? []).length ? html`<ol class="mini-steps">${c.steps.map((s, i) => html`<li><span>${String(i + 1)}</span><p><strong>${ctx.t(s.title)}</strong>${s.text ? html` ${ctx.rich(s.text)}` : ''}</p></li>`)}</ol>` : ''}
  </div>`)}</div>
</div>`);

const timeline = (ctx, b) => sec(b, 'section timeline', html`<div class="wrap">
  ${b.lead ? html`<p class="timeline__lead">${ctx.rich(b.lead)}</p>` : ''}
  <ol class="tl">${b.items.map((it) => html`<li><span class="tl__l">${ctx.t(it.label)}</span><span class="tl__t">${ctx.t(it.text)}</span></li>`)}</ol>
</div>`);

// ---- progetti, loghi, recensioni, inviti --------------------------------------------------------------------------------------------

const feature = (ctx, b) => {
  const wide = b.variant === 'wide';
  const banner = b.variant === 'banner';
  const side = b.side ?? 'right';
  const cls = `section feat feat--${side}${banner ? ' feat--banner' : ''}${wide ? ` feat--wide feat--${b.palette ?? 'teal'}` : ''}`;
  const heading = wide ? html`<h2 id="${b.id}-t">${ctx.rich(b.title)}</h2>` : el(b.level ?? 'h2', { id: `${b.id}-t` }, ctx.rich(b.title));
  const frameCls = wide ? ` frame--${b.palette ?? 'teal'} frame--${side}` : '';
  return sec(b, cls, html`<div class="wrap feat__in">
  <div class="feat__media">${banner ? img(ctx, b.image) : wide ? html`<div class="frame frame--arch${frameCls}"><span class="frame__arch"></span><span class="frame__dot frame__dot--a"></span><span class="frame__dot frame__dot--b"></span>${img(ctx, b.image)}</div>` : frame(ctx, b.image, b.shape ?? 'arch')}</div>
  <div class="feat__text">
    ${wide && b.logo ? logoImg(ctx, b.logo, 'feat__logo') : ''}
    ${b.kicker ? html`<p class="feat__kicker">${ctx.t(b.kicker)}</p>` : ''}
    ${!wide && b.logo ? logoImg(ctx, b.logo, 'feat__logo') : ''}
    ${b.eyebrow ? html`<p class="eyebrow"><span class="eyebrow__bar"></span><span>${ctx.t(b.eyebrow)}</span></p>` : ''}
    ${heading}
    ${b.body ? html`<div class="prose">${ctx.rich(b.body)}</div>` : ''}
    ${(b.tags ?? []).length ? html`<ul class="tags">${b.tags.map((t) => html`<li>${ctx.t(t)}</li>`)}</ul>` : ''}
    ${b.button ? actions(ctx, [b.button]) : ''}
  </div>
</div>`);
};

const logos = (ctx, b) => {
  const group = (hidden) => html`<div class="logos__group"${hidden ? raw(' aria-hidden="true"') : ''}>${b.items.map((x) => html`<span class="logos__item">${hidden ? logoImg(ctx, { src: x.image.src, alt: { it: '' } }, 'logos__img') : maybeLink(ctx, x.link, logoImg(ctx, x.image, 'logos__img'))}</span>`)}</div>`;
  return sec(b, 'logos', html`<div class="wrap">${b.title ? html`<h2 class="logos__title">${ctx.t(b.title)}${b.accent ? html` <em>${ctx.t(b.accent)}</em>` : ''}</h2>` : ''}</div>
  <div class="logos__marquee"><div class="logos__track">${group(false)}${group(true)}</div></div>`);
};

const stars = () => raw('<span class="stars" role="img" aria-label="5 / 5">★★★★★</span>');
const reviews = (ctx, b) => {
  const [score, ...rest] = b.rating ? ctx.t(b.rating).split(' · ') : [];
  const h = b.header ?? {};
  return sec(b, 'section reviews', html`<div class="wrap">
  <div class="reviews__top">
    <header class="head">
      ${h.eyebrow ? html`<p class="eyebrow"><span class="eyebrow__bar"></span><span>${ctx.t(h.eyebrow)}</span></p>` : ''}
      <h2 id="${b.id}-t">${ctx.t(h.title)}${b.accent ? html` <em>${ctx.t(b.accent)}</em>` : ''}</h2>
    </header>
    ${b.rating ? html`<p class="reviews__rating">${stars()}<span><strong>${score}</strong>${rest.length ? ` · ${rest.join(' · ')}` : ''}</span></p>` : ''}
  </div>
  <div class="reviews__grid">${b.items.map((r, i) => { const n = ctx.t(r.name); return html`<figure class="review">
    ${stars()}
    <blockquote>“${ctx.t(r.quote)}”</blockquote>
    <figcaption><span class="review__av" aria-hidden="true">${/^[\p{L}\p{N}]/u.test(n) ? n.charAt(0) : String.fromCharCode(65 + i)}</span><span><strong>${n}</strong>${r.role ? html`<span>${ctx.t(r.role)}</span>` : ''}</span></figcaption>
  </figure>`; })}</div>
  ${b.button ? actions(ctx, [b.button]) : ''}
</div>`);
};

const cta = (ctx, b) => sec(b, 'cta', html`<div class="wrap cta__in"><p class="cta__text">${ctx.rich(b.text)}</p>${actions(ctx, b.buttons)}</div>`);

const callout = (ctx, b) => {
  const lay = b.layout ?? 'center';
  const btn = b.button ? actions(ctx, [b.button]) : '';
  const eyebrow = b.eyebrow ? html`<p class="eyebrow"><span class="eyebrow__bar"></span><span>${ctx.t(b.eyebrow)}</span></p>` : '';
  const title = html`<h2>${ctx.rich(b.title)}</h2>`;
  const text = b.text ? html`<p class="lead">${ctx.rich(b.text)}</p>` : '';
  const inner = lay === 'row'
    ? html`<div class="callout__main">${eyebrow}${title}${text}</div>${btn}`
    : lay === 'duo' ? html`<div class="callout__head">${eyebrow}${title}</div><div class="callout__body">${text}${btn}</div>`
    : html`${eyebrow}${title}${text}${btn}`;
  return sec(b, `section callout callout--${lay}${b.box ? ' callout--box' : ''}`, html`<div class="wrap"><div class="callout__in">${inner}</div></div>`);
};

// ---- prenotazione online e partner ----------------------------------------------------------------------------------------------

// Pillola con etichetta: pallino (prenotazione) o icona (partner).
const pill = (ctx, label, ic) => html`<span class="pill">${ic ? icon(ic, 16, 2) : raw('<span class="pill__dot"></span>')}${ctx.t(label)}</span>`;

// Prenotazione online: schede che aprono il calendario esterno. Con un elenco di punti (`checks`) il testo sta a sinistra e la scheda a destra.
const bookingCard = (ctx, c) => html`<a class="bk bk--${c.tone ?? 'sky'}" href="${ctx.link(c.link)}"${newTab(c.link)}>
    ${c.tone === 'night' ? raw('<span class="bk__orb" aria-hidden="true"></span>') : ''}
    <span class="bk__top">${c.icon ? html`<span class="bk__ic">${icon(c.icon, 26)}</span>` : ''}${c.duration ? html`<span class="bk__dur">${icon('clock', 18, 1.8)}${ctx.t(c.duration)}</span>` : ''}</span>
    ${c.kicker ? html`<span class="bk__kicker">${ctx.t(c.kicker)}</span>` : ''}
    <span class="bk__title">${ctx.t(c.title)}</span>
    ${c.highlight ? html`<span class="bk__hl">${c.highlight.icon ? icon(c.highlight.icon, 30) : ''}<span><span class="bk__hl-l">${ctx.t(c.highlight.label)}</span><span class="bk__hl-v">${ctx.t(c.highlight.value)}</span></span></span>` : ''}
    ${c.text ? html`<span class="bk__text">${ctx.t(c.text)}</span>` : ''}
    <span class="bk__go">${ctx.t(c.label)} ${arrow()}</span>
  </a>`;

const booking = (ctx, b) => {
  const split = (b.checks ?? []).length > 0;
  const headBlock = html`${b.eyebrow ? pill(ctx, b.eyebrow) : ''}<h2 id="${b.id}-t">${ctx.rich(b.title)}</h2>`;
  return sec(b, `booking${split ? ' booking--split' : ''}`, html`<span class="booking__orb" aria-hidden="true"></span><div class="wrap booking__in">
    ${split
      ? html`<div class="booking__text">${headBlock}${b.text ? html`<p>${ctx.rich(b.text)}</p>` : ''}<ul class="booking__checks">${b.checks.map((t) => html`<li>${check()}<span>${ctx.t(t)}</span></li>`)}</ul></div>
        <div class="booking__cards">${b.items.map((c) => bookingCard(ctx, c))}</div>`
      : html`<div class="booking__head"><div class="booking__title">${headBlock}</div>${b.text ? html`<p class="booking__lead">${ctx.rich(b.text)}</p>` : ''}</div>
        <div class="booking__cards">${b.items.map((c) => bookingCard(ctx, c))}</div>`}
  </div>`);
};

// Schede progetto: ritratto in arco in alto, poi logo, testo e pulsante.
const projectCards = (ctx, b) => sec(b, 'section pcards', html`<div class="wrap">
  ${head(ctx, b.header, `${b.id}-t`)}
  <div class="pcards__grid">${b.items.map((c) => html`<article class="pcard pcard--${c.palette ?? 'teal'}">
    <div class="pcard__media"><span class="pcard__arch"></span><span class="pcard__dot"></span>${img(ctx, c.image)}</div>
    <div class="pcard__body">
      ${c.logo ? logoImg(ctx, c.logo, 'pcard__logo') : ''}
      ${c.kicker ? html`<p class="feat__kicker">${ctx.t(c.kicker)}</p>` : ''}
      <h3>${ctx.rich(c.title)}</h3>
      ${c.body ? html`<div class="prose">${ctx.rich(c.body)}</div>` : ''}
      ${(c.tags ?? []).length ? html`<ul class="tags">${c.tags.map((t) => html`<li>${ctx.t(t)}</li>`)}</ul>` : ''}
      ${c.button ? actions(ctx, [c.button]) : ''}
    </div>
  </article>`)}</div>
</div>`);

// Riquadro con testo e loghi di partner o piattaforme (per esempio il welfare aziendale).
const partners = (ctx, b) => sec(b, 'partners', html`<div class="wrap"><div class="partners__box">
    <div class="partners__text">
      ${b.eyebrow ? pill(ctx, b.eyebrow, b.icon) : ''}
      <h2 id="${b.id}-t">${ctx.rich(b.title)}</h2>
      ${b.text ? html`<p>${ctx.rich(b.text)}</p>` : ''}
    </div>
    <div class="partners__logos">${b.items.map((x) => {
      const h = Math.min(96, Math.max(16, Math.round(Number(x.height)) || 44));
      return html`<a class="partners__logo" href="${ctx.link(x.link)}"${newTab(x.link)} aria-label="${ctx.t(x.image.alt)}"><img src="${ctx.assetImg(x.image.src)}" alt="${ctx.t(x.image.alt)}" loading="lazy" style="height:${String(h)}px"></a>`;
    })}</div>
  </div></div>`);

// ---- testo e modulo ---------------------------------------------------------------------------------------------------------------

const text = (ctx, b) => sec(b, 'section text', html`<div class="wrap prose">${ctx.rich(b.content)}</div>`);
const richText = (ctx, b) => sec(b, 'section text', html`<div class="wrap prose${b.width === 'wide' ? ' prose--wide' : ''}">${ctx.rich(b.content)}</div>`);

// Il modulo segue il «contratto» con il motore: form[data-form][data-endpoint][data-locale], .form-grid, .form-success, .form-error.
// Lo script del motore (/assets/cms/cms.js) aggiunge invio, anti-bot e messaggi; il server valida di nuovo tutto.
const form = (ctx, b) => {
  const id = (f) => `${b.id}-${f.name}`;
  const cell = (f) => {
    const req = attr('required', f.required);
    const common = html`${attr('id', id(f))}${attr('name', f.name)}`;
    const control = f.type === 'select'
      ? html`<select${common}${req}><option value="">${ctx.t(ctx.site.strings.selectPlaceholder)}</option>${f.options.map((o) => html`<option>${ctx.t(o)}</option>`)}</select>`
      : f.type === 'textarea' ? html`<textarea${common}${req}${attr('placeholder', f.placeholder && ctx.t(f.placeholder))}></textarea>`
      : html`<input${common}${f.type === 'text' ? '' : attr('type', f.type)}${attr('autocomplete', f.autocomplete)}${req}>`;
    return html`<div class="field${f.width === 'full' ? ' full' : ''}"><label for="${id(f)}">${ctx.rich(f.label)}${f.required ? '' : html` <span class="opt">${ctx.t(ctx.site.strings.optionalSuffix)}</span>`}</label>${control}</div>`;
  };
  const p = b.profile;
  const profile = p ? html`<aside class="profile">
    <h1>${ctx.rich(p.title)}</h1>
    ${p.lead ? html`<div class="prose">${ctx.rich(p.lead)}</div>` : ''}
    ${p.image ? html`<div class="profile__card"><div class="profile__img">${img(ctx, p.image, { priority: true })}</div><div><p class="profile__name">${p.name ? ctx.t(p.name) : ''}</p>${p.role ? html`<p class="profile__role">${lines(ctx.t(p.role))}</p>` : ''}</div></div>` : ''}
    ${(p.socials ?? []).length ? html`<ul class="socials">${p.socials.map((s) => html`<li><a href="${ctx.link(s.link)}" aria-label="${ctx.t(s.label)}">${network(s.network)}</a></li>`)}</ul>` : ''}
  </aside>` : '';
  return sec(b, `section form${b.headSplit ? ' form--head-split' : ''}`, html`<div class="wrap${p ? ' form__split' : ''}">
    ${profile}
    ${b.headSplit ? html`<div class="form__head">${head(ctx, b.header, `${b.id}-t`)}</div>` : ''}
    <div class="form__box">
    ${b.headSplit ? '' : head(ctx, b.header, `${b.id}-t`)}
    <form data-form="${b.id}" data-endpoint="${ctx.site.formsEndpoint ?? '/api/forms'}" data-locale="${ctx.locale}" aria-label="${ctx.t(b.label)}">
      <div class="form-grid">
        ${b.fields.map((f) => (f.type === 'consent'
          ? html`<div class="full"><label class="check${f.cssClass ? ` ${f.cssClass}` : ''}"${attr('title', f.title ? ctx.t(f.title) : null)}><input type="checkbox"${attr('name', f.name)}${attr('required', f.required)}> <span>${raw(f.target === '_blank' ? ctx.richStr(ctx.t(f.label)).replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ') : ctx.richStr(ctx.t(f.label)))}</span></label></div>`
          : cell(f)))}
        <div class="full"><button class="btn btn--primary" type="submit">${ctx.t(b.submitLabel)}</button></div>
      </div>
      <p class="form-success" role="status" tabindex="-1" hidden>${ctx.t(b.successMessage)}</p>
      <p class="form-error" role="alert" tabindex="-1" hidden>${ctx.t(ctx.site.strings.formError)}</p>
      ${b.note ? html`<p class="form-note">${ctx.rich(b.note)}</p>` : ''}
    </form>
    </div>
  </div>`);
};

// Blocco del motore (non del template): codice HTML incollato così com'è, senza sanificazione (solo un admin lo scrive o lo cambia).
const htmlBlock = (ctx, b) => html`<section class="html-block" data-surface="${b.surface}" id="${b.anchor ?? b.id}">${raw(b.html ?? '')}</section>`;

// ---- blog («Pensiero») ------------------------------------------------------------------------------------------------------------

const postDate = (ctx, d) => (d ? ctx.formatDate(d) : '');
export { postDate };
const postsList = (ctx, b) => {
  const posts = ctx.posts({ category: b.category, tag: b.tag, author: b.author, limit: b.limit ?? 12 });
  const cats = b.showCategoryNav ? ctx.categories() : [];
  const card = (p) => html`<article class="post-card">
        ${b.showImage !== false && p.image ? html`<a class="post-card__media" href="${p.path}" tabindex="-1" aria-hidden="true">${img(ctx, p.image)}</a>` : ''}
        <div class="post-card__body">
          ${b.showCategories !== false && p.categories.length ? html`<p class="post-card__cats">${p.categories.map((c) => html`<a href="${c.path}">${ctx.t(c.name)}</a>`)}</p>` : ''}
          <h3><a href="${p.path}">${ctx.t(p.title)}</a></h3>
          ${b.showTags && p.tags.length ? html`<p class="post-card__tags">${p.tags.map((c) => html`<a href="${c.path}">#${ctx.t(c.name)}</a>`)}</p>` : ''}
          ${b.showExcerpt !== false && p.excerpt ? html`<p class="post-card__excerpt">${ctx.t(p.excerpt)}</p>` : ''}
          ${b.showDate !== false ? html`<p class="post-card__meta"><time datetime="${p.date}">${postDate(ctx, p.date)}</time>${p.author ? (p.authorPath ? html` · <a href="${p.authorPath}">${p.author}</a>` : html` · ${p.author}`) : ''}</p>` : ''}
          ${b.readMore ? html`<a class="more" href="${p.path}">${ctx.t(b.readMore)} ${arrow()}</a>` : ''}
        </div>
      </article>`;
  return sec(b, 'section posts', html`<div class="wrap">
    ${b.eyebrow || b.title ? head(ctx, { eyebrow: b.eyebrow, title: b.title ?? '' }, `${b.id}-t`) : ''}
    ${cats.length ? html`<p class="chips"><a href="${ctx.pathOf('blog') ?? '#'}"${!b.category ? raw(' aria-current="true"') : ''}>Tutti</a>${cats.map((c) => html`<a href="${c.path}"${b.category === c.key ? raw(' aria-current="true"') : ''}>${ctx.t(c.name)}</a>`)}</p>` : ''}
    ${posts.length ? html`<div class="posts__grid posts__grid--${b.layout ?? 'cards'}">${posts.map(card)}</div>` : html`<p class="muted">Nessun contenuto per ora.</p>`}
  </div>`);
};

export const blocks = {
  'hero-portrait': heroPortrait,
  statement,
  steps,
  feature,
  logos,
  reviews,
  timeline,
  points,
  columns,
  booking,
  partners,
  'project-cards': projectCards,
  cta,
  callout,
  text,
  'rich-text': richText,
  form,
  'posts-list': postsList,
  html: htmlBlock,
};
