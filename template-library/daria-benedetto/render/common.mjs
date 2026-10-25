// Pezzi comuni ai blocchi (blocks.mjs e mm-blocks.mjs).
import { html, attr, raw } from '@cms/kit';

export const surface = (b) => (b.surface ? attr('data-surface', b.surface) : '');
export const anchor = (b) => attr('id', b.anchor);

// Spaziatura della sezione (campo "padding"): non si scrive CSS libero, si sceglie una misura tra poche; il CSS la traduce in
// una lunghezza che si adatta allo schermo (assets/css/modules.css). Il valore standard non produce nessun attributo.
const PAD = [['top', 'pt', 'md'], ['bottom', 'pb', 'md'], ['left', 'pl', 'none'], ['right', 'pr', 'none']];
export const pad = (b) => PAD.map(([k, a, std]) => { const v = b.padding?.[k]; return v && v !== std ? attr(`data-${a}`, v) : ''; });

// Angoli delle immagini (campo "corners"): classe sul contenitore di ogni immagine. `std` = valore del blocco se il campo manca.
export const media = (b, std = 'square') => `media media--${b.corners ?? std}`;

// priority/eager: immagine visibile subito (cover, sfondo contatto), senza lazy-load.
export function img(ctx, im, { priority = false, eager = false } = {}) {
  const size = ctx.imageSize(im.src);
  const pos = [im.focal && `--pos:${im.focal.x}% ${im.focal.y}%`, im.focalMobile && `--pos-m:${im.focalMobile.x}% ${im.focalMobile.y}%`].filter(Boolean).join(';');
  return html`<img src="${ctx.assetImg(im.src)}" alt="${ctx.t(im.alt)}"${priority || eager ? '' : raw(' loading="lazy"')}${size ? raw(` width="${size.width}" height="${size.height}"`) : ''}${priority ? raw(' fetchpriority="high"') : ''}${attr('style', pos)}>`;
}

// I link a un altro sito (indirizzi http/https) si aprono in una nuova scheda, come nel sito originale.
export const isExternal = (l) => l?.type === 'url' && /^https?:/i.test(l.url ?? '');
export const newTab = (l) => (isExternal(l) ? raw(' target="_blank" rel="noopener"') : '');

// Pulsante: stile primary/secondary/inverse/whatsapp (schema common.button). Con un link a un canale e senza etichetta si usa il valore del canale.
export function button(ctx, b, extra = '') {
  const l = b.link;
  const label = b.label ? ctx.t(b.label) : l.type === 'channel' ? ctx.channel(l.channel).display : '';
  return html`<a class="btn btn--${b.style}${extra}" href="${ctx.link(l)}"${newTab(l)}>${label}</a>`;
}
