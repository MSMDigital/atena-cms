// Moduli interni di Starter: blocchi con immagine, numeri, passi e zone; ogni blocco ogni blocco sta in un <div class="mm"> e il suo CSS
// (assets/css/mm.css) è tutto sotto ".mm", così non tocca gli altri moduli né i blocchi di base.
// Note: la copertina si chiama "hero-image" (in Starter "hero" è quella di solo testo), niente icone dei
// canali nei pulsanti, le zone si scrivono sempre a mano (nessun elenco nei dati del sito), le FAQ sono il blocco "faq" dei moduli.
import { html, raw, attr, el, mapEmbed } from '@cms/kit';
import { surface, anchor, pad, media, img, button } from './common.mjs';

const num = (n) => String(n).padStart(2, '0');
const bump = (level) => `h${Math.min(+level[1] + 1, 6)}`;
const lines = (s) => s.split('\n').flatMap((l, i) => (i ? [raw('<br>'), l] : [l]));
const wrapMm = (inner) => html`<div class="mm">${inner}</div>`;

const buttons = (ctx, list) => html`<div class="btn-row">${list.map((b) => button(ctx, b))}</div>`;

// Testata di sezione (campo "header"): etichetta, titolo e testo a due colonne.
export function sectionHeader(ctx, h) {
  if (!h) return '';
  const lvl = h.level ?? 'h2';
  return html`${h.eyebrow ? html`<p class="eyebrow">${ctx.t(h.eyebrow)}</p>` : ''}
    ${h.text ? html`<div class="head">${el(lvl, {}, ctx.t(h.title))}<p>${ctx.rich(h.text)}</p></div>` : html`<div class="head head--single">${el(lvl, {}, ctx.t(h.title))}</div>`}`;
}

// Sezione di contenuto: <section class="section"> + <div class="wrap ..."> + testata + contenuto.
const contentSection = (b, { flush, wrap = 'wrap' }, inner) => wrapMm(html`<section class="section${flush ? ' section--flush-top' : ''}"${surface(b)}${anchor(b)}${pad(b)}>
  <div class="${wrap}">
    ${inner}
  </div>
</section>`);

const specTable = (ctx, tb) => html`<table class="spec">
        <caption class="sr-only">${ctx.t(tb.caption)}</caption>
        <tbody>
          ${tb.rows.map((r) => html`<tr><th scope="row">${ctx.t(r.label)}</th><td>${ctx.t(r.value)}</td></tr>`)}
        </tbody>
      </table>`;

export function contactItem(ctx, it) {
  const label = ctx.t(it.label);
  const value = it.value ? ctx.t(it.value) : ctx.channel(it.link.channel).display;
  return it.link
    ? html`<li><a href="${ctx.link(it.link)}"><small>${label}</small><strong>${value}</strong></a></li>`
    : html`<li><div class="item"><small>${label}</small><strong>${value}</strong></div></li>`;
}

export const contactList = (ctx, items) => html`<ul class="contact-big">
        ${items.map((it) => contactItem(ctx, it))}
      </ul>`;

// I blocchi che producono <section class="section">: solo tra questi vale la regola "stessa superficie, niente doppio spazio".
export const SECTION_TYPES = new Set(['items', 'split', 'zones', 'spec-table', 'contacts', 'rich-text']);

export const mmBlocks = {
  'hero-image': (ctx, b) => wrapMm(html`<section class="himg"${surface(b)}${anchor(b)}>
  <div class="himg__media ${media(b)}">
    ${img(ctx, b.image, { priority: true })}
  </div>
  <div class="himg__grid">
    <h1 class="himg__title"><span class="himg__l1">${ctx.t(b.titleLine1)}</span> <span class="himg__l2">${ctx.t(b.titleLine2)}</span></h1>
    <p class="himg__claim">${lines(ctx.t(b.claim))}</p>
    <a class="badge" href="${ctx.link(b.badge.link)}" aria-label="${ctx.t(b.badge.label)}">
      <svg class="badge__ring" viewBox="0 0 200 200" aria-hidden="true">
        <defs><path id="${b.id}-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"/></defs>
        <text><textPath href="#${b.id}-circle">${b.badge.ring.map((r) => ctx.t(r)).join(' · ')} · </textPath></text>
      </svg>
      <span class="badge__arrow" aria-hidden="true">→</span>
    </a>
  </div>
</section>`),

  'page-intro': (ctx, b) => {
    const side = b.summary || b.buttons?.length;
    const s = ctx.site.strings;
    return wrapMm(html`<section class="intro"${surface(b)}${anchor(b)}>
  <div class="wrap">
    <nav class="crumbs" aria-label="${ctx.t(s.breadcrumbLabel ?? { it: 'Percorso' })}"><ol>${(ctx.crumbs ?? []).map((c, i, a) => (i === a.length - 1 ? html`<li aria-current="page">${c.name}</li>` : html`<li><a href="${c.href}">${c.name}</a></li>`))}</ol></nav>
    <h1>${ctx.t(b.title)}</h1>
    <div class="intro__grid">
      <p class="lead">${ctx.rich(b.lead)}</p>
      ${side ? html`<div class="intro__side">
        ${b.summary ? html`<div class="tldr"><p class="tldr__title">${ctx.t(s.summaryTitle ?? { it: 'In breve' })}</p><p>${ctx.rich(b.summary)}</p></div>` : ''}
        ${b.buttons?.length ? buttons(ctx, b.buttons) : ''}
      </div>` : ''}
    </div>
  </div>
</section>`);
  },

  marquee: (ctx, b) => {
    const spans = b.items.map((i) => html`<span>${ctx.t(i)}</span>`);
    return wrapMm(html`<div class="marquee"${surface(b)}${anchor(b)}><div class="marquee__track"><div class="marquee__group">${spans}</div><div class="marquee__group" aria-hidden="true">${spans}</div></div></div>`);
  },

  facts: (ctx, b) => wrapMm(html`<section class="facts-strip" aria-label="${ctx.t(b.label)}"${surface(b)}${anchor(b)}>
  <dl class="wrap facts-strip__grid">
    ${b.items.map((i) => html`<div><dt>${ctx.t(i.label)}</dt><dd>${ctx.t(i.value)}</dd></div>`)}
  </dl>
</section>`),

  'wide-image': (ctx, b) => wrapMm(html`<div class="wide-media ${media(b)}"${anchor(b)}>${img(ctx, b.image, { eager: true })}</div>`),

  gallery: (ctx, b) => wrapMm(html`<section class="gallery" aria-label="${ctx.t(b.label)}"${surface(b)}${anchor(b)}>
  <div class="gallery__track">
    ${b.items.map((i) => html`<figure class="${media(b)}">${img(ctx, i.image)}<figcaption>${ctx.t(i.caption)}</figcaption></figure>`)}
  </div>
</section>`),

  cta: (ctx, b) => wrapMm(html`<section class="cta"${b.word ? attr('data-word', ctx.t(b.word)) : ''}${surface(b)}${anchor(b)}>
  <div class="wrap">
    <h2>${ctx.t(b.title)}</h2>
    <div>
      ${b.text ? html`<p>${ctx.rich(b.text)}</p>` : ''}
      ${buttons(ctx, b.buttons)}
    </div>
  </div>
</section>`),

  items: (ctx, b, o) => {
    const lvl = b.header ? bump(b.header.level ?? 'h2') : 'h2';
    const text = (it, tag = 'p') => (it.text ? el(tag, {}, ctx.rich(it.text)) : '');
    let body;
    if (b.layout === 'points') {
      body = html`<div class="grid grid--${b.columns ?? 3}">
      ${b.items.map((it, i) => html`<div class="point">${b.numbered !== false ? html`<span class="point__n">${num(i + 1)}</span>` : ''}${el(lvl, {}, ctx.t(it.title))}${text(it)}</div>`)}
    </div>`;
    } else if (b.layout === 'steps') {
      body = html`<ol class="steps">
      ${b.items.map((it) => html`<li>${el(lvl, {}, ctx.t(it.title))}${text(it)}</li>`)}
    </ol>`;
    } else if (b.layout === 'cards') {
      body = html`<div class="grid grid--${b.columns ?? 2}">
      ${b.items.map((it) => html`<article class="card">
        <div class="card__media ${media(b)}">${img(ctx, it.image)}</div>
        ${el(lvl, {}, html`<a href="${ctx.link(it.link)}">${ctx.t(it.title)}</a>`)}
        ${text(it)}
        ${it.linkLabel ? html`<span class="arrow">${ctx.t(it.linkLabel)}</span>` : ''}
      </article>`)}
    </div>`;
    } else {
      body = html`<ul class="index-list">
      ${b.items.map((it, i) => html`<li><a href="${ctx.link(it.link)}"${attr('data-preview', it.previewImage && ctx.assetImg(it.previewImage.src))}><span class="n">${num(i + 1)}</span>${el(lvl, { class: 't' }, ctx.t(it.title))}${it.text ? html`<span class="d">${ctx.rich(it.text)}</span>` : ''}<span class="a" aria-hidden="true">→</span></a></li>`)}
    </ul>`;
    }
    return contentSection(b, o, html`${sectionHeader(ctx, b.header)}${body}`);
  },

  split: (ctx, b, o) => {
    // Nel DOM il media viene prima del testo se su mobile sta sopra; la modifica di lato riguarda solo il desktop.
    const mediaFirst = b.mobileMedia !== 'bottom';
    const natural = mediaFirst ? 'left' : 'right';
    const mod = (b.mediaSide ?? 'left') === natural ? '' : mediaFirst ? ' split--reverse' : ' split--forward';
    const pic = b.media.type === 'quote'
      ? html`<figure class="split__quote"><div class="${media(b)}">${img(ctx, b.media.image)}</div><blockquote class="quote">${ctx.t(b.media.quote)}</blockquote><figcaption class="quote-by">${ctx.t(b.media.author)}</figcaption></figure>`
      : html`<div class="split__media ${media(b)}">${img(ctx, b.media.image)}</div>`;
    const x = b.extra;
    const extra = !x ? '' : x.type === 'list'
      ? html`<ul class="list">
        ${x.items.map((it) => {
          const t = it.text ? ctx.rich(it.text) : '';
          const sep = it.label && it.text && !/^[,.;:!?)]/.test(ctx.t(it.text)) ? ' ' : '';
          return html`<li>${it.label ? html`<strong>${ctx.t(it.label)}</strong>` : ''}${sep}${t}</li>`;
        })}
      </ul>`
      : specTable(ctx, x.table);
    const text = html`<div>
      ${b.eyebrow ? html`<p class="eyebrow">${ctx.t(b.eyebrow)}</p>` : ''}
      ${el(b.level ?? 'h2', {}, ctx.t(b.title))}
      ${b.body ? raw(ctx.richStr(ctx.t(b.body)).replace(/<p>/g, '<p class="muted">')) : ''}
      ${extra}
      ${b.action ? html`<a class="arrow" href="${ctx.link(b.action.link)}">${ctx.t(b.action.label)}</a>` : ''}
    </div>`;
    return contentSection(b, { ...o, wrap: `wrap split${mod}` }, mediaFirst ? html`${pic}${text}` : html`${text}${pic}`);
  },

  zones: (ctx, b, o) => contentSection(b, o, html`${sectionHeader(ctx, b.header)}<ul class="zones">${b.items.map((z) => html`<li>${ctx.t(z)}</li>`)}</ul>`),

  'spec-table': (ctx, b, o) => contentSection(b, o, html`${sectionHeader(ctx, b.header)}${specTable(ctx, b.table)}`),

  contacts: (ctx, b, o) => {
    const list = contactList(ctx, b.items);
    const map = b.map ? mapEmbed(ctx, b.map) : '';
    return contentSection(b, { ...o, wrap: b.map ? 'wrap grid grid--2 contacts' : 'wrap' }, html`${sectionHeader(ctx, b.header)}${b.map ? html`<div>${list}</div>${map}` : list}`);
  },

  'rich-text': (ctx, b, o) => contentSection(b, { ...o, wrap: `wrap prose${b.width === 'wide' ? ' prose--wide' : ''}` }, ctx.rich(b.content)),
};
