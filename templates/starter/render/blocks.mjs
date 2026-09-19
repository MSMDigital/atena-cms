// I tre blocchi del template. Ogni funzione riceve (ctx, blocco) e restituisce HTML. Il testo dei campi va SEMPRE tramite html`` (escapa da solo):
// solo i testi ricchi passano da ctx.rich(), che li sanifica.
import { html, attr } from '@cms/kit';

const hero = (ctx, b) => html`<section class="hero" data-surface="${b.surface}" id="${b.anchor ?? b.id}">
  <div class="wrap">
    <h1>${ctx.t(b.title)}</h1>
    <p class="lead">${ctx.rich(b.lead)}</p>
    ${(b.buttons ?? []).length ? html`<p class="actions">${b.buttons.map((x) => html`<a class="btn" href="${ctx.link(x.link)}">${ctx.t(x.label)}</a> `)}</p>` : ''}
  </div>
</section>`;

const text = (ctx, b) => html`<section class="text" data-surface="${b.surface}" id="${b.anchor ?? b.id}">
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
  return html`<section class="form" data-surface="${b.surface}" id="${b.anchor ?? b.id}">
  <div class="wrap">
    <form data-form="${b.id}" data-endpoint="${ctx.site.formsEndpoint ?? '/api/forms'}" data-locale="${ctx.locale}" aria-label="${ctx.t(b.label)}">
      <div class="form-grid">
        ${b.fields.map((f) => (f.type === 'consent'
          ? html`<div class="full"><label class="check"><input type="checkbox"${attr('name', f.name)}${attr('required', f.required)}> <span>${ctx.rich(f.label)}</span></label></div>`
          : cell(f)))}
        <div class="full"><button class="btn" type="submit">${ctx.t(b.submitLabel)}</button></div>
      </div>
      <p class="form-success" role="status" tabindex="-1" hidden>${ctx.t(b.successMessage)}</p>
      <p class="form-error" role="alert" tabindex="-1" hidden>${ctx.t(ctx.site.strings.formError)}</p>
    </form>
  </div>
</section>`;
};

export const blocks = { hero, text, form };
