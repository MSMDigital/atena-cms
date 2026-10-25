// I blocchi del template. Ogni funzione riceve (ctx, blocco) e restituisce HTML. Il testo dei campi va SEMPRE tramite html`` (escapa da solo):
// solo i testi ricchi passano da ctx.rich(), che li sanifica.
// Tre blocchi di base (hero, text, form) + i moduli (stile neutro che segue i token) + lo slider.
import { html, attr, raw, el } from '@cms/kit';
import { surface, anchor, pad, media, img, button } from './common.mjs';
import { mmBlocks, sectionHeader, contactList } from './mm-blocks.mjs';

// Il "segno" (icona di Dati del sito → Marchio) è facoltativo: senza, i moduli lo omettono.
const signSrc = (ctx) => ctx.site.brand?.sign ?? null;
const sign = (ctx, show) => (show !== false && signSrc(ctx) ? html`<img class="sign rv" src="${ctx.assetImg(signSrc(ctx))}" alt="">` : '');
const h2lines = (ctx, title) => el('h2', { class: 'lines' }, html`<span class="l"><span>${ctx.t(title)}</span></span>`);
const eyebrow = (ctx, t, cls = '') => (t ? html`<p class="label${cls} rv">${ctx.t(t)}</p>` : '');
const delay = (i, max = 2) => (i ? attr('data-d', String(Math.min(i, max))) : '');

// Frecce + punti dello slider (assets/js/main.js li attiva su ogni [data-slider]; nascosti dal CSS se c'è una sola schermata).
const sliderNav = ({ arrows = true, dots = true } = {}) => (arrows || dots ? html`<div class="slider__nav">
        ${arrows ? html`<button class="slider__arrow slider__arrow--prev" type="button" data-slider-prev aria-label="Precedente">‹</button>` : ''}
        ${dots ? html`<div class="slider__dots" data-slider-dots></div>` : ''}
        ${arrows ? html`<button class="slider__arrow slider__arrow--next" type="button" data-slider-next aria-label="Successivo">›</button>` : ''}
      </div>` : '');

const count = (x, d) => { const n = Math.round(Number(x)); return n >= 1 && n <= 6 ? n : d; };

// ---- blocchi di base ----------------------------------------------------------------------------------------------------------------

const hero = (ctx, b) => html`<section class="hero" data-surface="${b.surface}" id="${b.anchor ?? b.id}"${pad(b)}>
  <div class="wrap">
    <h1>${ctx.t(b.title)}</h1>
    <p class="lead">${ctx.rich(b.lead)}</p>
    ${(b.buttons ?? []).length ? html`<p class="actions">${b.buttons.map((x) => html`<a class="btn" href="${ctx.link(x.link)}">${ctx.t(x.label)}</a> `)}</p>` : ''}
  </div>
</section>`;

const text = (ctx, b) => html`<section class="text" data-surface="${b.surface}" id="${b.anchor ?? b.id}"${pad(b)}>
  <div class="wrap prose">${ctx.rich(b.content)}</div>
</section>`;

// Il modulo segue il "contratto" con il motore: form[data-form][data-endpoint][data-locale], .form-grid, .form-success, .form-error.
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
  const aside = b.aside ? html`<aside>${contactList(ctx, b.aside.items)}</aside>` : '';
  return html`<section class="form mm" data-surface="${b.surface}" id="${b.anchor ?? b.id}"${pad(b)}>
  <div class="wrap${b.aside ? ' layout-form' : ''}">
    <div>
    ${sectionHeader(ctx, b.header)}
    <form data-form="${b.id}" data-endpoint="${ctx.site.formsEndpoint ?? '/api/forms'}" data-locale="${ctx.locale}" aria-label="${ctx.t(b.label)}">
      <div class="form-grid">
        ${b.fields.map((f) => (f.type === 'consent'
          ? html`<div class="full"><label class="check${f.cssClass ? ` ${f.cssClass}` : ''}"${attr('title', f.title ? ctx.t(f.title) : null)}><input type="checkbox"${attr('name', f.name)}${attr('required', f.required)}> <span>${raw(f.target === '_blank' ? ctx.richStr(f.label).replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ') : ctx.richStr(f.label))}</span></label></div>`
          : cell(f)))}
        <div class="full"><button class="btn" type="submit">${ctx.t(b.submitLabel)}</button></div>
      </div>
      <p class="form-success" role="status" tabindex="-1" hidden>${ctx.t(b.successMessage)}</p>
      <p class="form-error" role="alert" tabindex="-1" hidden>${ctx.t(ctx.site.strings.formError)}</p>
      ${b.note ? html`<p class="form-note">${ctx.rich(b.note)}</p>` : ''}
    </form>
    </div>
    ${aside}
  </div>
</section>`;
};

// Blocco del motore (non del template): codice HTML incollato così com'è, senza sanificazione (solo un admin lo scrive o lo cambia).
const htmlBlock = (ctx, b) => html`<section class="html-block" data-surface="${b.surface}" id="${b.anchor ?? b.id}">${raw(b.html ?? '')}</section>`;

// ---- moduli ---------------------------------------------------------------------------------------------------------

const heroSlides = (ctx, b) => html`<section class="mod hs" aria-label="${ctx.t(b.titleLine1)}"${surface(b)}${anchor(b)}>
  <div class="hs__frame ${media(b)}">
    ${b.slides.map((s, i) => html`<div class="hs__slide${i === 0 ? ' is-on' : ''}" aria-hidden="true">${img(ctx, s.image, { priority: i === 0, eager: i === 0 })}</div>`)}
    <div class="hs__body">
      ${eyebrow(ctx, b.kicker, ' hs__kicker')}
      <h1 class="lines"><span class="l"><span>${ctx.t(b.titleLine1)}</span></span>${b.titleLine2 ? html`<span class="l"><span>${ctx.t(b.titleLine2)}</span></span>` : ''}</h1>
      ${b.sub ? html`<p class="hs__sub rv" data-d="1">${ctx.rich(b.sub)}</p>` : ''}
      ${b.primaryButton || b.secondaryLink ? html`<div class="hs__ctas rv" data-d="2">
        ${b.primaryButton ? button(ctx, b.primaryButton, ' btn--lg') : ''}
        ${b.secondaryLink ? html`<a class="link" href="${ctx.link(b.secondaryLink.link)}">${ctx.t(b.secondaryLink.label)}</a>` : ''}
      </div>` : ''}
    </div>
    <ol class="hs__scenes" aria-hidden="true">
      ${b.slides.map((s, i) => html`<li${i === 0 ? raw(' class="is-on"') : ''}>${ctx.t(s.caption)}</li>`)}
    </ol>
  </div>
</section>`;

const theNeed = (ctx, b) => html`<section class="mod section gap center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    ${h2lines(ctx, b.title)}
    <p class="lead rv narrow" data-d="1">${ctx.rich(b.lead)}</p>
    <figure class="gap__wide ${media(b)} unveil">${img(ctx, b.wideImage)}</figure>
    <div class="gap__cols">
      ${b.columns.map((c, i) => html`<p class="rv"${delay(i, 1)}>${ctx.rich(c)}</p>`)}
    </div>
    <blockquote class="quote rv">${ctx.t(b.quoteText)}<cite>${ctx.t(b.quoteCite)}</cite></blockquote>
  </div>
</section>`;

const manifesto = (ctx, b) => html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    <p class="letter__open rv">${ctx.rich(b.opener)}</p>
    <div class="letter">
      ${b.paragraphs.map((p, i) => html`<p class="${i === 0 ? 'letter__first' : ''} rv"${delay(i, 1)}>${ctx.rich(p)}</p>`)}
    </div>
    <div class="letter__end rv">${signSrc(ctx) ? html`<img src="${ctx.assetImg(signSrc(ctx))}" alt="">` : ''}<span>${ctx.t(b.signoff)}</span></div>
  </div>
  <div class="wrap"><figure class="letter__view"><div class="${media(b)} unveil">${img(ctx, b.image)}</div></figure></div>
</section>`;

const services = (ctx, b) => html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${sign(ctx, b.showSign)}
    ${eyebrow(ctx, b.eyebrow)}
    ${h2lines(ctx, b.title)}
    ${b.lead ? html`<p class="lead rv narrow muted" data-d="1">${ctx.rich(b.lead)}</p>` : ''}
    <ul class="services__grid"${attr('style', `--cols:${count(b.items.length, 3)}`)}>
      ${b.items.map((it, i) => html`<li class="service rv"${delay(i)}>
        <div class="${media(b, 'arch')} unveil">${img(ctx, it.image)}</div>
        <h3>${ctx.t(it.title)}</h3>
        <p>${ctx.rich(it.text)}</p>
      </li>`)}
    </ul>
  </div>
</section>`;

// Due metà affiancate (nel prototipo: inverno/estate). Composizione sempre su fondo scuro; ogni metà ha una tinta ("tone").
const seasons = (ctx, b) => html`<section class="mod seasons" data-surface="dark"${anchor(b)} aria-labelledby="${b.id}-title">
  <div class="wrap seasons__intro center">
    ${eyebrow(ctx, b.eyebrow)}
    ${el('h2', { id: `${b.id}-title`, class: 'lines' }, html`<span class="l"><span>${ctx.t(b.title)}</span></span>`)}
  </div>
  <div class="diptych">
    ${b.halves.map((h) => html`<article class="half half--${h.tone} ${media(b)}">
      ${img(ctx, h.image)}
      <div class="half__body">
        <span class="caps">${ctx.t(h.kicker)}</span>
        <h3>${ctx.t(h.title)}</h3>
        <p class="half__focus">${ctx.t(h.focus)}</p>
        <ul class="half__list">${h.items.map((x) => html`<li>${ctx.t(x)}</li>`)}</ul>
        <p class="half__where">${ctx.t(h.whereText)}</p>
      </div>
    </article>`)}
    ${signSrc(ctx) ? html`<span class="diptych__mark" aria-hidden="true"><img src="${ctx.assetImg(signSrc(ctx))}" alt=""></span>` : ''}
  </div>
  <div class="places rv">
    <p><b>${ctx.t(b.placesIntro)}</b> · ${b.placesList.map((p) => ctx.t(p)).join(' · ')}</p>
  </div>
</section>`;

const protocols = (ctx, b) => html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    ${h2lines(ctx, b.title)}
    <p class="lead rv narrow" data-d="1">${ctx.rich(b.lead)}</p>
    <div class="protocols__grid"${attr('style', `--cols:${count(b.items.length, 3)}`)}>
      ${b.items.map((it, i) => html`<div class="protocol rv"${delay(i)}>
        <div class="${media(b, 'arch')} unveil">${img(ctx, it.image)}</div>
        <span class="protocol__tag caps">${ctx.t(it.tag)}</span>
        <h3>${ctx.t(it.title)}</h3>
        <p>${ctx.rich(it.text)}</p>
        <ul>${it.points.map((p) => html`<li>${ctx.t(p)}</li>`)}</ul>
      </div>`)}
    </div>
  </div>
</section>`;

const technicalDirection = (ctx, b) => html`<section class="mod section"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap direction__grid">
    <a class="locked ${media(b, 'arch')} rv" href="${ctx.link(b.lockedLink)}">
      ${img(ctx, b.lockedImage)}
      <span class="locked__body">
        ${signSrc(ctx) ? html`<img src="${ctx.assetImg(signSrc(ctx))}" alt="">` : ''}
        <span class="caps" style="display:block;margin-bottom:.8rem">${ctx.t(b.lockedLabel)}</span>
        <p>${ctx.t(b.lockedText)}</p>
        <span class="link">${ctx.t(b.lockedLinkLabel)}</span>
      </span>
    </a>
    <div>
      ${eyebrow(ctx, b.eyebrow, ' label--left')}
      ${h2lines(ctx, b.title)}
      <p class="lead rv">${ctx.rich(b.lead)}</p>
      <p class="rv muted">${ctx.rich(b.bio)}</p>
      <div class="certs certs--2">
        ${b.certifications.map((c, i) => html`<div class="cert rv"${delay(i, 3)}><h3>${ctx.t(c.title)}</h3><p>${ctx.rich(c.text)}</p></div>`)}
      </div>
      ${b.languages ? html`<p class="langs rv">${ctx.t(b.languages)}</p>` : ''}
      <ul class="pillars">
        ${b.pillars.map((p, i) => html`<li class="rv"${i % 2 ? attr('data-d', '1') : ''}><b>${ctx.t(p.title)}</b><span>${ctx.rich(p.text)}</span></li>`)}
      </ul>
    </div>
  </div>
</section>`;

const heritage = (ctx, b) => html`<section class="mod section heritage center"${surface(b)}${anchor(b)}${pad(b)} aria-labelledby="${b.id}-title">
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    <h2 id="${b.id}-title" class="sr-only">${ctx.t(b.eyebrow ?? b.caption)}</h2>
    <figure class="heritage__img ${media(b, 'arch')} unveil">
      ${img(ctx, b.image)}
      <span class="caps">${ctx.t(b.caption)}</span>
    </figure>
    <blockquote class="rv">${ctx.t(b.quote)}</blockquote>
    <p class="heritage__text rv">${ctx.rich(b.text)}</p>
  </div>
</section>`;

const discretion = (ctx, b) => html`<section class="mod section discretion center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    <p class="lead rv narrow">${ctx.rich(b.lead)}</p>
    <p class="discretion__answer rv">${ctx.t(b.answer)}</p>
    <div class="discretion__lines">
      ${b.lines.map((l, i) => html`<p class="rv"${delay(i, 1)}>${ctx.rich(l)}</p>`)}
    </div>
  </div>
</section>`;

const faq = (ctx, b) => html`<section class="mod section faq center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    ${h2lines(ctx, b.title)}
    <div class="faq__list">
      ${b.items.map((it, i) => html`<details${attr('open', b.firstOpen !== false && i === 0)}><summary>${ctx.t(it.question)}<i aria-hidden="true"></i></summary><p>${ctx.rich(it.answer)}</p></details>`)}
    </div>
  </div>
</section>`;

const partners = (ctx, b) => {
  const isSlider = b.items.length > 5;   // oltre i 5 diventa scorrevole anche su desktop; da mobile lo è sempre (vedi CSS)
  return html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    ${h2lines(ctx, b.title)}
    <p class="lead rv narrow muted" data-d="1">${ctx.rich(b.lead)}</p>
    <div class="partners${isSlider ? ' partners--slider' : ''}" data-slider data-slider-autoplay>
      <div class="partners__row rv" data-slider-track>
        ${b.items.map((p) => html`<a class="partner" href="${p.url}" target="_blank" rel="noopener">
          <span class="partner__text"><span class="partner__mark">${ctx.t(p.name)}</span><span class="partner__url">${ctx.t(p.domainLabel)} ↗</span></span>
          ${p.logo ? html`<span class="partner__logo">${img(ctx, p.logo)}</span>` : ''}
        </a>`)}
      </div>
      ${sliderNav()}
    </div>
  </div>
</section>`;
};

const contact = (ctx, b) => html`<section class="mod contact"${anchor(b)}>
  <div class="contact__frame ${media(b)}">
    ${img(ctx, b.backgroundImage, { eager: true })}
    <div class="contact__body">
      ${sign(ctx, b.showSign)}
      ${eyebrow(ctx, b.eyebrow)}
      ${h2lines(ctx, b.title)}
      <p class="lead rv">${ctx.rich(b.lead)}</p>
      <div class="rv">${button(ctx, b.button, ' btn--lg')}</div>
      ${b.languages || (b.noteLines ?? []).length ? html`<ul class="contact__micro rv">
        ${b.languages ? html`<li>${ctx.t(b.languages)}</li>` : ''}
        ${(b.noteLines ?? []).map((l) => html`<li>${ctx.t(l)}</li>`)}
      </ul>` : ''}
    </div>
  </div>
</section>`;

const founder = (ctx, b) => html`<section class="mod founder"${surface(b)}${anchor(b)} aria-labelledby="${b.id}-name">
  <div class="wrap">
    <div class="founder__portrait ${media(b, 'arch')} unveil">${img(ctx, b.portraitImage)}</div>
    ${eyebrow(ctx, b.eyebrow)}
    <h1 id="${b.id}-name" class="founder__name lines"><span class="l"><span>${ctx.t(b.name)}</span></span></h1>
    <p class="founder__role rv">${ctx.t(b.role)}</p>
    <ul class="creds rv">${b.credentials.map((c) => html`<li>${ctx.t(c)}</li>`)}</ul>
  </div>
</section>`;

const story = (ctx, b) => html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)} aria-labelledby="${b.id}-title">
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    <h2 id="${b.id}-title" class="lines"><span class="l"><span>${ctx.t(b.title)}</span></span></h2>
    <div class="letter">
      ${b.paragraphs.map((p) => html`<p class="rv">${ctx.rich(p)}</p>`)}
      <ol class="timeline rv">
        ${b.timeline.map((t) => html`<li><b>${ctx.t(t.label)}</b><span>${ctx.t(t.text)}</span></li>`)}
      </ol>
    </div>
  </div>
</section>`;

const certificationsFull = (ctx, b) => html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)} aria-labelledby="${b.id}-title">
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    <h2 id="${b.id}-title" class="lines"><span class="l"><span>${ctx.t(b.title)}</span></span></h2>
    <p class="lead rv narrow muted" data-d="1">${ctx.rich(b.lead)}</p>
    <div class="certs">
      ${b.items.map((c, i) => html`<div class="cert rv"${delay(i, 3)}><h3>${ctx.t(c.title)}</h3><p>${ctx.rich(c.text)}</p>${c.link && c.linkLabel ? html`<a class="link" href="${ctx.link(c.link)}">${ctx.t(c.linkLabel)}</a>` : ''}</div>`)}
    </div>
  </div>
</section>`;

const bespokeServices = (ctx, b) => html`<section class="mod section center"${surface(b)}${anchor(b)}${pad(b)} aria-labelledby="${b.id}-title">
  <div class="wrap">
    ${eyebrow(ctx, b.eyebrow)}
    <h2 id="${b.id}-title" class="lines"><span class="l"><span>${ctx.t(b.title)}</span></span></h2>
    <div class="bespoke rv">
      ${b.items.map((it) => html`<div><h3>${ctx.t(it.title)}</h3><p>${ctx.rich(it.text)}</p></div>`)}
      ${b.darkItem.visible !== false ? html`<div class="bespoke__dark"><h3>${ctx.t(b.darkItem.title)}</h3><p>${ctx.rich(b.darkItem.text)}</p></div>` : ''}
    </div>
    ${b.darkItem.visible !== false ? html`<div class="gift__card rv" role="img" aria-label="${ctx.t(b.giftFrom)}">
      ${signSrc(ctx) ? html`<img src="${ctx.assetImg(signSrc(ctx))}" alt="">` : ''}
      <p>${ctx.t(b.giftFrom)}</p>
      <small>${ctx.t(b.giftSeason)}</small>
    </div>` : ''}
  </div>
</section>`;

const directLine = (ctx, b) => html`<section class="mod contact contact--plain"${anchor(b)}>
  <div class="contact__frame">
    <div class="contact__body">
      ${sign(ctx, b.showSign)}
      ${eyebrow(ctx, b.eyebrow)}
      ${h2lines(ctx, b.title)}
      <p class="lead rv">${ctx.rich(b.lead)}</p>
      <div class="rv" style="margin-top:2.5rem">${button(ctx, b.button, ' btn--lg')}</div>
      <p class="rv" style="margin-top:1.5rem"><a href="mailto:${b.email}">${b.email}</a></p>
    </div>
  </div>
</section>`;

// Slider di immagini: quante se ne vedono insieme si sceglie per desktop / tablet / mobile (variabili CSS --pv-*, vedi modules.css:
// ≥1024 px desktop, 700–1023 tablet, <700 mobile). Lo scorrimento è nativo (scroll-snap); frecce, punti e avanzamento automatico sono opzioni.
const slider = (ctx, b) => {
  const pv = b.perView ?? {};
  const vars = [`--pv-d:${count(pv.desktop, 3)}`, `--pv-t:${count(pv.tablet, 2)}`, `--pv-m:${count(pv.mobile, 1)}`, b.aspect && b.aspect !== 'auto' ? `--ar:${b.aspect}` : ''].filter(Boolean).join(';');
  const secs = Math.min(20, Math.max(2, Math.round(Number(b.interval)) || 5));
  const item = (it) => {
    const pic = html`<div class="slider__media ${media(b)}">${img(ctx, it.image)}</div>`;
    return html`<figure class="slider__item">${it.link ? html`<a href="${ctx.link(it.link)}">${pic}</a>` : pic}${it.caption ? html`<figcaption>${ctx.t(it.caption)}</figcaption>` : ''}</figure>`;
  };
  return html`<section class="mod section slider"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${b.eyebrow || b.title || b.lead ? html`<div class="slider__head center">
      ${eyebrow(ctx, b.eyebrow)}
      ${b.title ? h2lines(ctx, b.title) : ''}
      ${b.lead ? html`<p class="lead rv narrow muted" data-d="1">${ctx.rich(b.lead)}</p>` : ''}
    </div>` : ''}
    <div class="slider__view"${attr('style', vars)} data-gap="${b.gap ?? 'md'}" data-slider${b.autoplay ? raw(` data-slider-autoplay data-slider-interval="${secs * 1000}"`) : ''}>
      <div class="slider__track" data-slider-track>
        ${b.items.map(item)}
      </div>
      ${sliderNav({ arrows: b.arrows !== false, dots: b.dots !== false })}
    </div>
  </div>
</section>`;
};

// Blog: elenco di articoli (tutti, o di una categoria) a schede o in elenco. Per le pagine di categoria il motore ne mette uno da solo (campo `category`).
const postDate = (ctx, d) => (d ? ctx.formatDate(d) : '');
export { postDate };
const postsList = (ctx, b) => {
  const posts = ctx.posts({ category: b.category, tag: b.tag, author: b.author, limit: b.limit ?? 12 });
  const cats = b.showCategoryNav ? ctx.categories() : [];
  const card = (p) => html`<article class="post-card">
        ${b.showImage !== false && p.image ? html`<a class="post-card__media ${media(b)}" href="${p.path}" tabindex="-1" aria-hidden="true">${img(ctx, p.image)}</a>` : ''}
        <div class="post-card__body">
          ${b.showCategories !== false && p.categories.length ? html`<p class="post-card__cats">${p.categories.map((c) => html`<a href="${c.path}">${ctx.t(c.name)}</a>`)}</p>` : ''}
          <h3><a href="${p.path}">${ctx.t(p.title)}</a></h3>
          ${b.showTags && p.tags.length ? html`<p class="post-card__tags">${p.tags.map((c) => html`<a href="${c.path}">#${ctx.t(c.name)}</a>`)}</p>` : ''}
          ${b.showDate !== false ? html`<p class="post-card__meta"><time datetime="${p.date}">${postDate(ctx, p.date)}</time>${p.author ? (p.authorPath ? html` · <a href="${p.authorPath}">${p.author}</a>` : html` · ${p.author}`) : ''}</p>` : ''}
          ${b.showExcerpt !== false && p.excerpt ? html`<p class="post-card__excerpt">${ctx.t(p.excerpt)}</p>` : ''}
          ${b.readMore ? html`<a class="arrow-link" href="${p.path}">${ctx.t(b.readMore)}</a>` : ''}
        </div>
      </article>`;
  return html`<section class="mod section posts"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="wrap">
    ${b.eyebrow ? html`<p class="label rv">${ctx.t(b.eyebrow)}</p>` : ''}
    ${b.title ? h2lines(ctx, b.title) : ''}
    ${cats.length ? html`<p class="posts__cats"><a href="${ctx.pathOf('blog') ?? '#'}"${!b.category ? raw(' aria-current="true"') : ''}>Tutti</a>${cats.map((c) => html`<a href="${c.path}"${b.category === c.key ? raw(' aria-current="true"') : ''}>${ctx.t(c.name)} <small>${String(c.count)}</small></a>`)}</p>` : ''}
    ${posts.length ? html`<div class="posts__grid posts__grid--${b.layout ?? 'cards'}">${posts.map(card)}</div>` : html`<p class="muted">Nessun articolo per ora.</p>`}
  </div>
</section>`;
};

export const blocks = {
  'posts-list': postsList,
  ...mmBlocks,
  hero, text, form, html: htmlBlock,
  'hero-slides': heroSlides,
  'the-need': theNeed,
  manifesto,
  services,
  seasons,
  protocols,
  'technical-direction': technicalDirection,
  heritage,
  discretion,
  faq,
  partners,
  contact,
  founder,
  story,
  'certifications-full': certificationsFull,
  'bespoke-services': bespokeServices,
  'direct-line': directLine,
  slider,
};
