// L'API che il MOTORE offre ai template: i template la importano come '@cms/kit' (vedi lib/template-kit.mjs) e non importano altro del motore.
// Tutto qui è puro (nessun accesso a file, rete o database): gira anche nel processo isolato in cui si esegue l'HTML dei template.
export { html, raw, attr, el, esc, toString } from './html.mjs';
export { sanitizeRich, HREF_OK } from './sanitize.mjs';
export { mapEmbed, consentHead, preferencesLink, providerOf } from './consent.mjs';
export { isSafeLogical } from './images.mjs';
export { seoHead, jsonLdNodes, organizationNode, crumbsOf } from './seo.mjs';

import { html, raw } from './html.mjs';
// Il tag dello script del motore (moduli e consenso). Va messo a fine <body>.
export const engineScript = () => raw('<script src="/assets/cms/cms.js" defer></script>');

// SEO/GEO: un solo <meta name="robots">, con i valori adatti (motori di ricerca e motori di intelligenza artificiale). Vuoto se la pagina
// non esclude nessuno dei due.
export const robotsContent = (page) => [page?.noindex && 'noindex', page?.noai && 'noai', page?.noai && 'noimageai'].filter(Boolean).join(', ');
export const robotsMeta = (page) => { const c = robotsContent(page); return c ? html`<meta name="robots" content="${c}">` : ''; };

// Analytics e script esterni (Dati del sito → Tracciamento): sempre negli stessi 4 punti della pagina, uguali per ogni template.
// Il codice lo scrive un admin (lib/content-guard.mjs esenta questi campi dal controllo sui testi): non è sanificato, va inserito così com'è.
export const trackingHead = (ctx) => raw(ctx.site?.tracking?.headCode ?? '');
export const trackingCss = (ctx) => { const css = ctx.site?.tracking?.css; return css ? raw(`<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`) : ''; };
export const trackingBodyStart = (ctx) => raw(ctx.site?.tracking?.bodyStartCode ?? '');
export const trackingBodyEnd = (ctx) => raw(ctx.site?.tracking?.bodyEndCode ?? '');
