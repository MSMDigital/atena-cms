/* Starter — comportamento dei moduli: comparsa allo scroll, scene della copertina, slider.
   Il gate della pagina protetta (verifica vera, lato server) è in assets/js/gate.js. */
(function () {
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var shot = params.has('shot');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');
  if (shot) root.classList.add('shot');
  if (params.get('vh')) root.style.setProperty('--full', parseInt(params.get('vh'), 10) + 'px');

  /* Menu a hamburger dell'header: apre e chiude l'elenco; si chiude con Esc, con un clic su una voce o allargando lo schermo */
  var toggle = document.querySelector('.menu-toggle');
  var head = toggle && toggle.closest('.site-header');
  if (toggle && head) {
    var setOpen = function (open) { head.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', function () { setOpen(!head.classList.contains('is-open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    head.addEventListener('click', function (e) { if (e.target.closest('.site-header__nav a')) setOpen(false); });
    window.addEventListener('resize', function () { if (getComputedStyle(toggle).display === 'none') setOpen(false); });
  }

  /* Comparse allo scroll */
  var targets = document.querySelectorAll('.rv, .lines, .unveil');
  if (shot || reduce || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* Hero: le scene (slides) si alternano */
  var slides = document.querySelectorAll('.hs__slide');
  var idx = document.querySelectorAll('.hs__scenes li');
  if (slides.length) {
    var cur = 0, timer;
    var go = function (n) {
      slides[cur].classList.remove('is-on'); if (idx[cur]) idx[cur].classList.remove('is-on');
      cur = (n + slides.length) % slides.length;
      slides[cur].classList.add('is-on');
      if (idx[cur]) { void idx[cur].offsetWidth; idx[cur].classList.add('is-on'); }   /* riavvia la barra dell'indice */
    };
    var play = function () { clearInterval(timer); if (!shot && !reduce) timer = setInterval(function () { go(cur + 1); }, 6000); };
    idx.forEach(function (li, i) { li.addEventListener('click', function () { go(i); play(); }); });
    play();
  }

  /* Slider condiviso (partner oltre i 5 / da mobile, galleria a scorrimento): scorrimento nativo con scroll-snap
     (swipe su mobile "gratis", nessun JS di trascinamento). Un punto per SCHERMATA (quante immagini stanno insieme
     nella vista, 3 su desktop/1 su mobile per la galleria), non per immagine: altrimenti con 3 immagini visibili
     insieme un punto per immagine non corrisponderebbe a un vero avanzamento. Le frecce avanzano di una schermata
     intera, con loop; autoplay facoltativo (data-slider-autoplay); ricalcola tutto al resize (desktop/mobile hanno
     un numero diverso di elementi per schermata). */
  document.querySelectorAll('[data-slider]').forEach(function (el) {
    var track = el.querySelector('[data-slider-track]');
    if (!track) return;
    var items = Array.prototype.slice.call(track.children);
    var n = items.length;
    if (!n) return;
    var prevBtn = el.querySelector('[data-slider-prev]');
    var nextBtn = el.querySelector('[data-slider-next]');
    var dotsWrap = el.querySelector('[data-slider-dots]');
    var autoplay = el.hasAttribute('data-slider-autoplay');
    var interval = parseInt(el.getAttribute('data-slider-interval'), 10) || 5000;
    var perView = 1, pages = 1, cur = 0, timer, dots = [];

    var measure = function () {
      var w = items[0].offsetWidth || 1;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;   /* con lo spazio tra le immagini: (W + g) / (w + g) */
      perView = Math.max(1, Math.round((track.clientWidth + gap) / (w + gap)));
      pages = Math.max(1, Math.ceil(n / perView));
      if (cur >= pages) cur = pages - 1;
      el.classList.toggle('is-static', pages <= 1);   /* niente da scorrere: frecce e punti spariscono */
    };
    // L'ultima pagina può avere meno elementi delle altre: il bersaglio "naturale" (offsetLeft dell'elemento) a
    // volte supera lo scroll massimo possibile, che il browser taglia da solo. Si limita qui al massimo raggiungibile,
    // così la pagina rilevata dopo lo scorrimento (sync più sotto) corrisponde davvero a dove si è finiti.
    var maxScroll = function () { return Math.max(0, track.scrollWidth - track.clientWidth); };
    var pageLeft = function (p) { return Math.min(items[Math.min(p * perView, n - 1)].offsetLeft, maxScroll()); };

    var syncDots = function () { dots.forEach(function (d, i) { d.classList.toggle('is-on', i === cur); }); };
    var buildDots = function () {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      dots = [];
      if (pages <= 1) return;
      for (var i = 0; i < pages; i++) {
        (function (p) {
          var d = document.createElement('button');
          d.type = 'button';
          d.setAttribute('aria-label', 'Vai alla schermata ' + (p + 1));
          d.addEventListener('click', function () { goTo(p); restart(); });
          dotsWrap.appendChild(d);
          dots.push(d);
        })(i);
      }
      syncDots();
    };

    var goTo = function (p) {
      cur = (p + pages) % pages;
      track.scrollTo({ left: pageLeft(cur), behavior: 'smooth' });
      syncDots();
    };
    var restart = function () {
      clearInterval(timer);
      if (autoplay && pages > 1 && !shot && !reduce) timer = setInterval(function () { goTo(cur + 1); }, interval);
    };
    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(cur - 1); restart(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(cur + 1); restart(); });

    /* Durante lo swipe manuale (tocco/trackpad) si aggiorna "cur" alla schermata più vicina, per tenere i punti giusti. */
    var t;
    track.addEventListener('scroll', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var best = 0, bestDist = Infinity;
        for (var i = 0; i < pages; i++) { var d = Math.abs(pageLeft(i) - track.scrollLeft); if (d < bestDist) { bestDist = d; best = i; } }
        cur = best;
        syncDots();
      }, 100);
    }, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { var before = pages; measure(); if (pages !== before) buildDots(); }, 150);
    });

    measure();
    buildDots();
    restart();
  });
})();
