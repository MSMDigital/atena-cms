// Script dell'anteprima dell'admin (file esterno: la politica di sicurezza dell'admin vieta gli script "inline").
// L'anteprima gira in un iframe con sandbox SENZA "allow-same-origin": il suo codice (compreso il JavaScript del template) ha un'origine
// opaca e non può toccare l'admin né i suoi cookie. Il dialogo con l'editor passa solo da messaggi:
//  - dall'editor: cms-live-style (stile dal vivo), cms-restore (posizione di scorrimento);
//  - verso l'editor: cms-ready, cms-scroll, cms-navigate (clic su un link interno). L'editor controlla chi li manda.
(function () {
  function post(m) { try { parent.postMessage(m, '*'); } catch (e) { /* nessun genitore */ } }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'cms-restore' && typeof d.y === 'number') { window.scrollTo(0, d.y); return; }
    if (d.type !== 'cms-live-style') return;
    var s = document.getElementById('live-tokens');
    if (s && typeof d.css === 'string') s.textContent = d.css;
    var f = document.getElementById('live-fonts');
    if (f && typeof d.fontsHref === 'string' && f.getAttribute('href') !== d.fontsHref) f.setAttribute('href', d.fontsHref);
    for (var k in d.htmlAttrs) if (/^[a-z-]+$/.test(k)) document.documentElement.setAttribute(k, String(d.htmlAttrs[k]));
  });
  var t;
  window.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(function () { post({ type: 'cms-scroll', y: window.scrollY }); }, 80); }, { passive: true });
  post({ type: 'cms-ready' });
  var me = document.currentScript;
  if (me && me.hasAttribute('data-intercept')) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#') return;
      e.preventDefault();
      if (h.indexOf('/admin/preview/') === 0 || h === '/admin/preview') post({ type: 'cms-navigate', href: h });
    }, true);
  }
})();
