/* Comportamento dei moduli interni (galleria fissata, numeri che contano, passi e zone che si accendono,
   parola verticale della CTA, anteprima sull'elenco a righe). Tutto è progressivo: senza JS la pagina resta completa.
   Lavora solo dentro ".mm": se la pagina non ha moduli interni non fa nulla. */
(function () {
  if (!document.querySelector('.mm')) return;
  var params = new URLSearchParams(location.search);
  var shot = params.has('shot');
  var reduced = shot || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* CTA finale: parola verticale che sta tutta nell'altezza della sezione */
  var cta = document.querySelector('.mm .cta[data-word]');
  if (cta) {
    var big = document.createElement('span');
    big.className = 'cta__vertical';
    big.setAttribute('aria-hidden', 'true');
    var word = document.createElement('span');
    word.textContent = cta.getAttribute('data-word');
    big.appendChild(word);
    cta.appendChild(big);
    var fit = function () {
      big.style.fontSize = '';
      var max = parseFloat(getComputedStyle(big).fontSize);
      var ratio = (cta.clientHeight * 0.86) / word.getBoundingClientRect().height;
      big.style.fontSize = Math.min(max, max * ratio) + 'px';
    };
    fit();
    addEventListener('resize', fit);
  }

  /* Galleria su schermo largo: la sezione si fissa e la fila scorre in orizzontale mentre si scende (1,8 volte più veloce della pagina). */
  var gal = document.querySelector('.mm .gallery');
  var track = gal && gal.querySelector('.gallery__track');
  var wide = matchMedia('(min-width: 901px)');
  var SPEED = 1.8;
  var pin = function () {
    if (!gal || !track) return;
    var on = wide.matches && !reduced;
    gal.classList.toggle('is-pinned', on);
    track.style.transform = '';
    gal.style.height = '';
    if (!on) return;
    var travel = Math.max(0, track.scrollWidth - innerWidth);
    gal.style.height = (innerHeight + travel / SPEED) + 'px';
  };
  var onScroll = function () {
    if (gal && track && gal.classList.contains('is-pinned')) {
      var r = gal.getBoundingClientRect();
      var k = Math.min(Math.max(-r.top / Math.max(1, gal.offsetHeight - innerHeight), 0), 1);
      track.style.transform = 'translate3d(' + (-k * (track.scrollWidth - innerWidth)) + 'px, 0, 0)';
    }
  };
  if (gal) {
    pin(); onScroll();
    addEventListener('resize', function () { pin(); onScroll(); });
    addEventListener('scroll', onScroll, { passive: true });
  }

  var lightAll = function () { document.querySelectorAll('.mm .steps li, .mm .zones li').forEach(function (el) { el.classList.add('is-lit'); }); };
  if (reduced || !('IntersectionObserver' in window)) { lightAll(); return; }

  /* Numeri che contano */
  document.querySelectorAll('.mm .facts-strip dd').forEach(function (dd) {
    var m = dd.textContent.match(/^([\d']+)(.*)$/);
    if (!m) return;
    var target = parseInt(m[1].replace(/'/g, ''), 10);
    var suffix = m[2];
    var sep = m[1].indexOf("'") >= 0;
    var from = target > 1000 && target < 2100 ? target - 40 : 0;   /* un anno parte poco prima, gli altri da zero */
    var fmt = function (n) { return (sep ? n.toLocaleString('de-CH') : String(n)) + suffix; };
    dd.textContent = fmt(from);
    var run = function () {
      var t0 = performance.now();
      var tick = function (now) {
        var k = Math.min(Math.max((now - t0) / 1400, 0), 1);
        dd.textContent = fmt(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 4))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { run(); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(dd);
  });

  /* Passi e zone: si accendono in sequenza */
  [['.mm .steps li', 260, 0.4], ['.mm .zones li', 140, 0.5]].forEach(function (cfg) {
    var items = document.querySelectorAll(cfg[0]);
    if (!items.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        items.forEach(function (el, i) { setTimeout(function () { el.classList.add('is-lit'); }, i * cfg[1]); });
        io.disconnect();
      });
    }, { threshold: cfg[2] });
    io.observe(items[0].parentElement);
  });

  /* Anteprima foto che segue il cursore sull'elenco a righe (solo desktop) */
  var list = document.querySelector('.mm .index-list');
  if (list && matchMedia('(hover: hover) and (min-width: 901px)').matches) {
    var box = document.createElement('div');
    box.className = 'cursor-preview';
    box.setAttribute('aria-hidden', 'true');
    var im = document.createElement('img');
    im.alt = '';
    box.appendChild(im);
    document.body.appendChild(box);
    list.querySelectorAll('a').forEach(function (a) {
      var preview = a.getAttribute('data-preview');
      if (!preview) return;
      a.addEventListener('mouseenter', function () { im.src = preview; box.classList.add('is-on'); });
      a.addEventListener('mouseleave', function () { box.classList.remove('is-on'); });
      a.addEventListener('mousemove', function (e) {
        box.style.setProperty('--x', (e.clientX + 24) + 'px');
        box.style.setProperty('--y', (e.clientY - 110) + 'px');
      });
    });
  }
})();
