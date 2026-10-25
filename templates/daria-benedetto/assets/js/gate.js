/* Pagina protetta (campo pagina "protected"): verifica vera della password lato server, mai nel browser.
   Se il cookie di sblocco (impostato dopo una password corretta) è già valido, la pagina reale sostituisce
   subito questa schermata. Server: app/api/private-access/[key]/route.js, lib/page-access.mjs. */
(function () {
  var gate = document.querySelector('[data-gate]');
  if (!gate) return;
  var key = gate.getAttribute('data-key');
  var endpoint = '/api/private-access/' + encodeURIComponent(key);
  var msg = gate.querySelector('.gate__msg');
  var input = gate.querySelector('#gate-key');
  var button = gate.querySelector('button[type="submit"]');

  var MESSAGES = {
    invalid: 'Password non riconosciuta.',
    locked: 'Troppi tentativi. Riprova tra qualche minuto.',
    busy: 'Servizio occupato. Riprova tra un attimo.',
    unset: 'L'accesso non è ancora configurato. Contattaci.',
  };

  function swapIn(html) {
    document.open();
    document.write(html);
    document.close();
  }

  function tryCookie() {
    fetch(endpoint, { credentials: 'same-origin' }).then(function (r) {
      if (r.ok) return r.text().then(swapIn);
    }).catch(function () {});
  }

  gate.addEventListener('submit', function (e) {
    e.preventDefault();
    gate.classList.remove('is-err');
    if (msg) msg.textContent = '';
    if (button) button.disabled = true;
    fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data.ok) return fetch(endpoint, { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(swapIn);
        gate.classList.add('is-err');
        if (msg) msg.textContent = MESSAGES[data.reason] || MESSAGES.invalid;
        if (button) button.disabled = false;
        input.focus();
      })
      .catch(function () {
        if (msg) msg.textContent = 'Errore di connessione. Riprova.';
        if (button) button.disabled = false;
      });
  });

  tryCookie();
})();
