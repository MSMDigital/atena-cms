// Consenso ai contenuti di terzi (per ora la mappa di Google): niente si carica prima del consenso.
// Due modi, scelti in Dati del sito → Consenso (site.consent.provider):
//  - "builtin": un riquadro con il pulsante "Mostra la mappa"; l'iframe si carica solo dopo il clic (nessun cookie, nessun servizio esterno);
//  - "iubenda": banner e blocco preventivo li fa iubenda (blocco manuale: classe _iub_cs_activate, suppressedsrc, data-iub-purposes,
//    vedi https://www.iubenda.com/en/help/1229-manual-tagging-blocking-cookies/). La mappa è nella categoria 3 "Esperienza".
// Funzioni pure: il codice di iubenda si costruisce solo con i due numeri validati dallo schema, mai con codice incollato dall'admin.
import { html, raw } from './html.mjs';

// Con iubenda ma senza i due numeri si ricade sull'integrata: mai un banner a metà.
export const providerOf = (ctx) => { const c = ctx.site.consent; return c?.provider === 'iubenda' && c.iubendaSiteId && c.iubendaCookiePolicyId ? 'iubenda' : 'builtin'; };
const MAPS_PURPOSE = '3';

// Nell'<head>, prima di ogni altro script (iubenda lo chiede per poter bloccare in anticipo). L'attributo data-cms-consent serve all'anteprima
// dell'admin per toglierli: lì il banner non deve comparire né impostare cookie.
export function consentHead(ctx) {
  if (providerOf(ctx) !== 'iubenda') return '';
  const { iubendaSiteId, iubendaCookiePolicyId } = ctx.site.consent;
  const conf = JSON.stringify({ siteId: Number(iubendaSiteId), cookiePolicyId: Number(iubendaCookiePolicyId), lang: ctx.locale, storage: { useSiteId: true } }).replace(/</g, '\\u003c');
  return html`<script data-cms-consent>var _iub = _iub || []; _iub.csConfiguration = ${raw(conf)};</script>
  <script data-cms-consent src="https://cdn.iubenda.com/cs/iubenda_cs.js" charset="UTF-8" async></script>
  `;
}

// Link "Preferenze cookie" nel footer: con iubenda riapre le preferenze (la classe la gestisce iubenda).
export function preferencesLink(ctx) {
  return providerOf(ctx) === 'iubenda'
    ? html` · <a href="#" class="iubenda-cs-preferences-link">${ctx.t(ctx.site.strings.cookiePreferences)}</a>`
    : '';
}

export function mapEmbed(ctx, map) {
  const provider = providerOf(ctx);
  const s = ctx.site.strings;
  const q = encodeURIComponent(map.query).replace(/%20/g, '+');
  const embed = `https://www.google.com/maps?q=${q}&output=embed`;
  const open = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const title = ctx.t(map.title);
  const frame = provider === 'iubenda'
    ? html`<iframe class="map _iub_cs_activate" data-iub-purposes="${MAPS_PURPOSE}" title="${title}" referrerpolicy="no-referrer-when-downgrade" suppressedsrc="${embed}" src="about:blank" hidden></iframe>`
    : html`<iframe class="map" title="${title}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" data-src="${embed}" hidden></iframe>`;
  const action = provider === 'iubenda'
    ? html`<button type="button" class="btn btn--secondary iubenda-cs-preferences-link">${ctx.t(s.mapManageButton)}</button>`
    : html`<button type="button" class="btn btn--secondary" data-map-show>${ctx.t(s.mapShowButton)}</button>`;
  return html`<div class="map-consent" data-map-consent="${provider}">
    <div class="map-consent__box" data-map-box>
      <p>${ctx.t(s.mapConsentText)}</p>
      <div class="map-consent__actions">${action}<a href="${open}" target="_blank" rel="noopener noreferrer">${ctx.t(s.mapOpenLink)}</a></div>
    </div>
    ${frame}
  </div>`;
}
