/* Daria Benedetto: menu a hamburger, comparsa allo scroll, conteggio del numero, ombra dell'header. Il gate della pagina protetta
   (verifica vera, lato server) è in assets/js/gate.js. Tutto si disattiva con «riduci movimento» e senza JavaScript la pagina è già completa. */
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shot = new URLSearchParams(location.search).has('shot');   // ?shot: tutto già visibile (per le schermate)
  root.classList.add('js');

  /* Menu a hamburger: apre e chiude l'elenco; si chiude con Esc, con un clic su una voce o allargando lo schermo */
  var toggle = document.querySelector('.menu-toggle');
  var head = toggle && toggle.closest('.site-header');
  if (toggle && head) {
    var setOpen = function (open) { head.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', function () { setOpen(!head.classList.contains('is-open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    head.addEventListener('click', function (e) { if (e.target.closest('.site-header__nav a')) setOpen(false); });
    window.addEventListener('resize', function () { if (getComputedStyle(toggle).display === 'none') setOpen(false); });
  }

  /* Voce di menu della pagina corrente */
  document.querySelectorAll('.site-header__nav a').forEach(function (a) {
    if (a.pathname === location.pathname && a.hostname === location.hostname) a.setAttribute('aria-current', 'page');
  });

  /* Ombra sotto l'header quando la pagina scorre */
  if (head) {
    var onScroll = function () { head.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Comparsa allo scroll: ogni elemento entra con un piccolo ritardo rispetto ai fratelli (--i), una volta sola */
  var SELECTORS = '.hero-p__text > *, .hero-p__media, .head, .statement__in > *, .steps__list > li, .steps__note, .pts > li, .tags > li, .col, .tl > li, .timeline__lead, .feat__media, .feat__text > *, .logos__title, .review, .reviews__rating, .cta__in > *, .callout__in > *, .form__box, .profile > *, .post-card, .chips, .points__intro, .points__note, .tiles > li, .points__aside, .booking__head > *, .booking__text > *, .partners__box > *, .site-footer__top > *';
  var targets = Array.prototype.slice.call(document.querySelectorAll(SELECTORS));
  var counters = Array.prototype.slice.call(document.querySelectorAll('.statement__fig'));
  if (shot || reduce || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('rv', 'in'); });
    return;
  }
  var seen = new Map();
  targets.forEach(function (el) {
    var p = el.parentElement; var n = seen.get(p) || 0; seen.set(p, n + 1);
    el.style.setProperty('--i', Math.min(n, 6));
    el.classList.add('rv');
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
      if (e.target.classList.contains('statement__fig')) count(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  targets.forEach(function (el) { io.observe(el); });

  /* Il numero grande conta fino al suo valore (solo se è un numero intero) */
  function count(el) {
    var end = parseInt(el.textContent, 10);
    if (!isFinite(end) || String(end) !== el.textContent.trim()) return;
    var t0 = null; var dur = 1100;
    var step = function (t) { if (t0 === null) t0 = t; var k = Math.min(1, (t - t0) / dur); el.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
    el.textContent = '0'; requestAnimationFrame(step);
  }
  counters.forEach(function (el) { io.observe(el); });
})();
