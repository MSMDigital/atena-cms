// L'API che il MOTORE offre ai template: i template la importano come '@cms/kit' (vedi lib/template-kit.mjs) e non importano altro del motore.
// Tutto qui è puro (nessun accesso a file, rete o database): gira anche nel processo isolato in cui si esegue l'HTML dei template.
export { html, raw, attr, el, esc, toString } from './html.mjs';
export { sanitizeRich, HREF_OK } from './sanitize.mjs';
export { mapEmbed, consentHead, preferencesLink, providerOf } from './consent.mjs';
export { isSafeLogical } from './images.mjs';

import { raw } from './html.mjs';
// Il tag dello script del motore (moduli e consenso). Va messo a fine <body>.
export const engineScript = () => raw('<script src="/assets/cms/cms.js" defer></script>');
