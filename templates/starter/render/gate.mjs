// Schermata della pagina protetta (campo pagina "protected"): al posto dei blocchi reali nell'HTML statico.
// assets/js/gate.js verifica la password lato server (/api/private-access/<chiave>) e, se è corretta, sostituisce questa schermata con la pagina vera.
// I testi sono fissi, in italiano: per un sito in un'altra lingua vanno cambiati qui e in assets/js/gate.js.
import { html } from '@cms/kit';

export function renderGate(ctx, page) {
  const sign = ctx.site.brand?.sign;
  return html`<section class="mod gate-screen" data-surface="dark" aria-labelledby="gate-title">
  <div class="gate-screen__frame">
    <form class="gate" data-gate data-key="${page.key}" autocomplete="off">
      ${sign ? html`<img class="gate__icon rv" src="${ctx.assetImg(sign)}" alt="">` : ''}
      <p class="label rv">Area riservata</p>
      <h1 id="gate-title" class="lines"><span class="l"><span>Solo su invito.</span></span></h1>
      <p class="rv" data-d="1">Inserisci la password che ti è stata comunicata.</p>
      <label class="sr-only" for="gate-key">Password</label>
      <div class="gate__field rv" data-d="2"><input id="gate-key" name="key" type="password" placeholder="Password" autocomplete="off" required></div>
      <button class="btn btn--primary rv" data-d="2" type="submit">Entra</button>
      <p class="gate__msg" role="status" aria-live="polite"></p>
      <p class="gate__alt rv" data-d="3"><a href="${ctx.pathOf('home')}">Torna al sito</a></p>
    </form>
  </div>
</section>`;
}
