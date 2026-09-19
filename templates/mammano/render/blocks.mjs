// Un renderer per ogni blocco del catalogo. Produce lo stesso markup del prototipo, così CSS e JS esistenti funzionano invariati.
// Firma: (ctx, blocco, { flush }) → html. `flush`: la sezione segue una sezione con la stessa superficie (niente doppio spazio).
import path from 'node:path';
import { html, raw, attr, el, mapEmbed } from '@cms/kit';
import { ICONS, CHANNEL_ICON } from './icons.mjs';

const pad = (n) => String(n).padStart(2, '0');
const bump = (level) => `h${Math.min(+level[1] + 1, 6)}`;
const surface = (b) => attr('data-surface', b.surface);
const anchor = (b) => attr('id', b.anchor);
const lines = (s) => s.split('\n').flatMap((l, i) => (i ? [raw('<br>'), l] : [l]));

// ---- pezzi comuni ---------------------------------------------------------------------------

// priority: immagine principale (fetchpriority alto). eager: visibile subito, senza caricamento differito.
export function img(ctx, im, { priority = false, eager = false } = {}) {
  const size = ctx.imageSize(im.src);
  const pos = [im.focal && `--pos:${im.focal.x}% ${im.focal.y}%`, im.focalMobile && `--pos-m:${im.focalMobile.x}% ${im.focalMobile.y}%`].filter(Boolean).join(';');
  return html`<img src="${ctx.assetImg(im.src)}" alt="${ctx.t(im.alt)}"${priority || eager ? '' : raw(' loading="lazy"')}${size ? raw(` width="${size.width}" height="${size.height}"`) : ''}${priority ? raw(' fetchpriority="high"') : ''}${attr('style', pos)}>`;
}

// Un link a un canale (telefono, WhatsApp, email) porta con sé l'icona e, senza etichetta, il valore del canale.
export function button(ctx, b, extra = '') {
  const l = b.link;
  const chan = l.type === 'channel' ? l.channel : null;
  const label = b.label ? ctx.t(b.label) : chan ? ctx.channel(chan).display : '';
  return html`<a class="btn btn--${b.style === 'whatsapp' ? 'wa' : b.style}${extra}" href="${ctx.link(l)}">${chan ? raw(ICONS[CHANNEL_ICON[chan]]) : ''}${label}</a>`;
}

const buttons = (ctx, list) => html`<div class="btn-row">${list.map((b) => button(ctx, b))}</div>`;

function sectionHeader(ctx, h) {
  if (!h) return '';
  const lvl = h.level ?? 'h2';
  return html`${h.eyebrow ? html`<p class="eyebrow">${ctx.t(h.eyebrow)}</p>` : ''}
    ${h.text ? html`<div class="head">${el(lvl, {}, ctx.t(h.title))}<p>${ctx.rich(h.text)}</p></div>` : html`<div class="head head--single">${el(lvl, {}, ctx.t(h.title))}</div>`}`;
}

// Sezione di contenuto: <section class="section"> + <div class="wrap ..."> + testata + contenuto.
const contentSection = (b, { flush, wrap = 'wrap' }, inner) => html`<section class="section${flush ? ' section--flush-top' : ''}"${surface(b)}${anchor(b)}>
  <div class="${wrap}">
    ${inner}
  </div>
</section>`;

const specTable = (ctx, tb) => html`<table class="spec">
        <caption class="sr-only">${ctx.t(tb.caption)}</caption>
        <tbody>
          ${tb.rows.map((r) => html`<tr><th scope="row">${ctx.t(r.label)}</th><td>${ctx.t(r.value)}</td></tr>`)}
        </tbody>
      </table>`;

function contactItem(ctx, it) {
  const label = ctx.t(it.label);
  const value = it.value ? ctx.t(it.value) : ctx.channel(it.link.channel).display;
  return it.link
    ? html`<li><a href="${ctx.link(it.link)}"><small>${label}</small><strong>${value}</strong></a></li>`
    : html`<li><div class="item"><small>${label}</small><strong>${value}</strong></div></li>`;
}

// ---- blocchi -------------------------------------------------------------------------------------

export const blocks = {
  hero: (ctx, b) => html`<section class="hero"${surface(b)}${anchor(b)}>
  <div class="hero__media">
    ${img(ctx, b.image, { priority: true })}
  </div>
  <div class="hero__grid">
    <h1 class="hero__title"><span class="hero__l1">${ctx.t(b.titleLine1)}</span> <span class="hero__l2">${ctx.t(b.titleLine2)}</span></h1>
    <p class="hero__claim">${lines(ctx.t(b.claim))}</p>
    <a class="badge" href="${ctx.link(b.badge.link)}" aria-label="${ctx.t(b.badge.label)}">
      <svg class="badge__ring" viewBox="0 0 200 200" aria-hidden="true">
        <defs><path id="badge-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"/></defs>
        <text><textPath href="#badge-circle">${b.badge.ring.map((r) => ctx.t(r)).join(' · ')} · </textPath></text>
      </svg>
      <span class="badge__arrow" aria-hidden="true">→</span>
    </a>
  </div>
</section>`,

  'page-intro': (ctx, b) => {
    const side = b.summary || b.buttons?.length;
    return html`<section class="intro"${surface(b)}${anchor(b)}>
  <div class="wrap">
    <nav class="crumbs" aria-label="${ctx.t(ctx.site.strings.breadcrumbLabel)}"><ol>${ctx.crumbs.map((c, i) => (i === ctx.crumbs.length - 1 ? html`<li aria-current="page">${c.name}</li>` : html`<li><a href="${c.href}">${c.name}</a></li>`))}</ol></nav>
    <h1>${ctx.t(b.title)}</h1>
    <div class="intro__grid">
      <p class="lead">${ctx.rich(b.lead)}</p>
      ${side ? html`<div class="intro__side">
        ${b.summary ? html`<div class="tldr"><p class="tldr__title">${ctx.t(ctx.site.strings.summaryTitle)}</p><p>${ctx.rich(b.summary)}</p></div>` : ''}
        ${b.buttons?.length ? buttons(ctx, b.buttons) : ''}
      </div>` : ''}
    </div>
  </div>
</section>`;
  },

  marquee: (ctx, b) => {
    const spans = b.items.map((i) => html`<span>${ctx.t(i)}</span>`);
    return html`<div class="marquee"${surface(b)}${anchor(b)}><div class="marquee__track"><div class="marquee__group">${spans}</div><div class="marquee__group" aria-hidden="true">${spans}</div></div></div>`;
  },

  facts: (ctx, b) => html`<section class="facts-strip" aria-label="${ctx.t(b.label)}"${surface(b)}${anchor(b)}>
  <dl class="wrap facts-strip__grid">
    ${b.items.map((i) => html`<div><dt>${ctx.t(i.label)}</dt><dd>${ctx.t(i.value)}</dd></div>`)}
  </dl>
</section>`,

  'wide-image': (ctx, b) => html`<div class="wide-media"${anchor(b)}>${img(ctx, b.image, { eager: true })}</div>`,

  gallery: (ctx, b) => html`<section class="gallery" aria-label="${ctx.t(b.label)}" data-vlabel="${ctx.t(b.label)}"${surface(b)}${anchor(b)}>
  <div class="gallery__track">
    ${b.items.map((i) => html`<figure>${img(ctx, i.image)}<figcaption>${ctx.t(i.caption)}</figcaption></figure>`)}
  </div>
</section>`,

  cta: (ctx, b) => html`<section class="cta"${b.word ? attr('data-word', ctx.t(b.word)) : ''}${surface(b)}${anchor(b)}>
  <div class="wrap">
    <h2>${ctx.t(b.title)}</h2>
    <div>
      ${b.text ? html`<p>${ctx.rich(b.text)}</p>` : ''}
      ${buttons(ctx, b.buttons)}
    </div>
  </div>
</section>`,

  items: (ctx, b, o) => {
    const lvl = b.header ? bump(b.header.level ?? 'h2') : 'h2';
    const text = (it, tag = 'p') => (it.text ? el(tag, {}, ctx.rich(it.text)) : '');
    let body;
    if (b.layout === 'points') {
      body = html`<div class="grid grid--${b.columns ?? 3}">
      ${b.items.map((it, i) => html`<div class="point">${b.numbered !== false ? html`<span class="point__n">${pad(i + 1)}</span>` : ''}${el(lvl, {}, ctx.t(it.title))}${text(it)}</div>`)}
    </div>`;
    } else if (b.layout === 'steps') {
      body = html`<ol class="steps">
      ${b.items.map((it) => html`<li>${el(lvl, {}, ctx.t(it.title))}${text(it)}</li>`)}
    </ol>`;
    } else if (b.layout === 'cards') {
      body = html`<div class="grid grid--${b.columns ?? 2}">
      ${b.items.map((it) => html`<article class="card">
        <div class="card__media">${img(ctx, it.image)}</div>
        ${el(lvl, {}, html`<a href="${ctx.link(it.link)}">${ctx.t(it.title)}</a>`)}
        ${text(it)}
        ${it.linkLabel ? html`<span class="arrow">${ctx.t(it.linkLabel)}</span>` : ''}
      </article>`)}
    </div>`;
    } else {
      body = html`<ul class="index-list">
      ${b.items.map((it, i) => html`<li><a href="${ctx.link(it.link)}"${attr('data-preview', it.previewImage && ctx.assetImg(it.previewImage.src))}><span class="n">${pad(i + 1)}</span>${el(lvl, { class: 't' }, ctx.t(it.title))}${it.text ? html`<span class="d">${ctx.rich(it.text)}</span>` : ''}<span class="a" aria-hidden="true">→</span></a></li>`)}
    </ul>`;
    }
    return contentSection(b, o, html`${sectionHeader(ctx, b.header)}${body}`);
  },

  split: (ctx, b, o) => {
    // Nel DOM il media viene prima del testo se su mobile sta sopra; la modifica di lato riguarda solo il desktop.
    const mediaFirst = b.mobileMedia !== 'bottom';
    const natural = mediaFirst ? 'left' : 'right';
    const mod = (b.mediaSide ?? 'left') === natural ? '' : mediaFirst ? ' split--reverse' : ' split--forward';
    const media = b.media.type === 'quote'
      ? html`<figure class="split__quote">${img(ctx, b.media.image)}<blockquote class="quote">${ctx.t(b.media.quote)}</blockquote><figcaption class="quote-by">${ctx.t(b.media.author)}</figcaption></figure>`
      : html`<div class="split__media">${img(ctx, b.media.image)}</div>`;
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
    return contentSection(b, { ...o, wrap: `wrap split${mod}` }, mediaFirst ? html`${media}${text}` : html`${text}${media}`);
  },

  zones: (ctx, b, o) => {
    const zones = b.source === 'custom' ? b.items : ctx.site.company.zones;
    return contentSection(b, o, html`${sectionHeader(ctx, b.header)}<ul class="zones">${zones.map((z) => html`<li>${ctx.t(z)}</li>`)}</ul>`);
  },

  faq: (ctx, b, o) => contentSection(b, o, html`${sectionHeader(ctx, b.header)}<div class="faq">
      ${b.items.map((it, i) => html`<details${attr('open', b.firstOpen && i === 0)}>
        <summary>${ctx.t(it.question)}</summary>
        <p>${ctx.rich(it.answer)}</p>
      </details>`)}
    </div>`),

  'spec-table': (ctx, b, o) => contentSection(b, o, html`${sectionHeader(ctx, b.header)}${specTable(ctx, b.table)}`),

  form: (ctx, b, o) => {
    const id = (f) => `${b.id}-${f.name}`;
    const optional = (f) => (f.required ? '' : html` <span class="opt">${ctx.t(ctx.site.strings.optionalSuffix)}</span>`);
    const cell = (f) => {
      const cls = `field${f.width === 'full' ? ' full' : ''}`;
      const common = raw(`${attr('id', id(f)).s}${attr('name', f.name).s}`);
      const required = attr('required', f.required);
      let control;
      if (f.type === 'select') {
        control = html`<select${common}${required}>
            <option value="">${ctx.t(ctx.site.strings.selectPlaceholder)}</option>
            ${f.options.map((op) => html`<option>${ctx.t(op)}</option>`)}
          </select>`;
      } else if (f.type === 'textarea') {
        control = html`<textarea${common}${attr('placeholder', f.placeholder && ctx.t(f.placeholder))}${required}></textarea>`;
      } else {
        control = html`<input${common}${f.type === 'text' ? '' : attr('type', f.type)}${attr('autocomplete', f.autocomplete)}${f.type === 'tel' ? raw(' inputmode="tel"') : ''}${attr('placeholder', f.placeholder && ctx.t(f.placeholder))}${required}>`;
      }
      return html`<div class="${cls}"><label for="${id(f)}">${ctx.rich(f.label)}${optional(f)}</label>${control}</div>`;
    };
    const fields = b.fields.map((f) => (f.type === 'consent'
      ? html`<div class="full"><label class="check"><input type="checkbox"${attr('name', f.name)}${attr('required', f.required)}> <span>${ctx.rich(f.label)}</span></label></div>`
      : cell(f)));
    const aside = b.aside ? html`<aside>
      <ul class="contact-big">
        ${b.aside.items.map((it) => contactItem(ctx, it))}
      </ul>
    </aside>` : '';
    return contentSection(b, { ...o, wrap: 'wrap layout-form' }, html`${sectionHeader(ctx, b.header)}<form data-form="${b.id}" data-endpoint="${ctx.site.formsEndpoint ?? '/api/forms'}" data-locale="${ctx.locale}" aria-label="${ctx.t(b.label)}">
      <div class="form-grid">
        ${fields}
        <div class="full"><button class="btn btn--primary" type="submit">${ctx.t(b.submitLabel)}</button></div>
      </div>
      <p class="form-success" role="status" tabindex="-1" hidden>${ctx.t(b.successMessage)}</p>
      <p class="form-error" role="alert" tabindex="-1" hidden>${ctx.t(ctx.site.strings.formError)}</p>
      ${b.note ? html`<p class="form-note">${ctx.rich(b.note)}</p>` : ''}
    </form>
    ${aside}`);
  },

  contacts: (ctx, b, o) => {
    const list = html`<ul class="contact-big">
        ${b.items.map((it) => contactItem(ctx, it))}
      </ul>`;
    const map = b.map ? mapEmbed(ctx, b.map) : '';
    return contentSection(b, { ...o, wrap: b.map ? 'wrap grid grid--2 contacts' : 'wrap' }, html`${sectionHeader(ctx, b.header)}${b.map ? html`<div>${list}</div>${map}` : list}`);
  },

  'rich-text': (ctx, b, o) => contentSection(b, { ...o, wrap: `wrap prose${b.width === 'wide' ? ' prose--wide' : ''}` }, ctx.rich(b.content)),
};

// Blocchi che producono <section class="section">: solo tra questi vale la regola "stessa superficie, niente doppio spazio".
export const SECTION_TYPES = new Set(['items', 'split', 'zones', 'faq', 'spec-table', 'form', 'contacts', 'rich-text']);
