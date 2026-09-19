// Script del MOTORE per ogni sito: invio dei moduli e consenso alla mappa. I template lo caricano con <script src="/assets/cms/cms.js" defer>
// (l'helper engineScript() del kit) e devono produrre il markup previsto: form[data-form][data-endpoint][data-locale] con .form-grid,
// .form-success, .form-error; [data-map-consent] con [data-map-box], [data-map-show] e l'iframe (vedi render/consent.mjs e docs/template.md).
// Moduli: invio all'indirizzo indicato in data-endpoint (di norma /api/forms/<id>, sullo stesso dominio).
// Il server valida di nuovo tutto; qui si aggiungono un campo esca nascosto e il tempo di compilazione, che servono contro gli automatismi.
document.querySelectorAll('form[data-form]').forEach((form) => {
  const opened = performance.now();
  const trap = document.createElement('input');
  trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1; trap.autocomplete = 'off'; trap.setAttribute('aria-hidden', 'true');
  trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
  form.appendChild(trap);
  const ok = form.querySelector('.form-success');
  const fail = form.querySelector('.form-error');
  const button = form.querySelector('button[type=submit]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity() || form.getAttribute('aria-busy') === 'true') return;
    const fields = {};
    for (const el of form.elements) {
      if (!el.name || el === trap) continue;
      fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    form.setAttribute('aria-busy', 'true');
    if (button) button.disabled = true;
    if (fail) fail.hidden = true;
    let sent = false;
    try {
      const res = await fetch(`${form.dataset.endpoint.replace(/\/$/, '')}/${encodeURIComponent(form.dataset.form)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, website: trap.value, _t: Math.round(performance.now() - opened), locale: form.dataset.locale }),
      });
      sent = res.ok;
    } catch { /* rete assente: si mostra l'errore */ }
    form.removeAttribute('aria-busy');
    if (button) button.disabled = false;
    if (sent) {
      form.querySelector('.form-grid')?.setAttribute('hidden', '');
      form.reset();
      if (ok) { ok.hidden = false; ok.focus(); }
    } else if (fail) { fail.hidden = false; fail.focus(); }
  });
});

// Mappa con consenso: l'iframe non ha indirizzo finché non c'è il consenso, quindi Google non riceve nulla prima.
//  - integrata: il clic su "Mostra la mappa" assegna l'indirizzo;
//  - iubenda: è iubenda a dare l'indirizzo all'iframe dopo il consenso; qui basta accorgersene e mostrare la mappa al posto del riquadro.
document.querySelectorAll('[data-map-consent]').forEach((box) => {
  const frame = box.querySelector('iframe');
  const notice = box.querySelector('[data-map-box]');
  if (!frame || !notice) return;
  const reveal = () => { notice.hidden = true; frame.hidden = false; };
  if (box.dataset.mapConsent === 'builtin') {
    box.querySelector('[data-map-show]')?.addEventListener('click', () => { frame.src = frame.dataset.src; reveal(); });
    return;
  }
  const check = () => { const src = frame.getAttribute('src'); if (src && src !== 'about:blank') reveal(); };
  new MutationObserver(check).observe(frame, { attributes: true, attributeFilter: ['src'] });
  check();
});
