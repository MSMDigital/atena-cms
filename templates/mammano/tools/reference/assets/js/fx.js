// Sezioni dinamiche, comuni alle varianti chiara e nero.
// Tutto è progressivo: senza JS la pagina resta completa e leggibile.
const imgBase = new URL('../img/sito-attuale/', document.currentScript.src);

// Modalità screenshot (?shot, solo per le anteprime statiche): tutto già "acceso", niente animazioni
const params = new URLSearchParams(location.search);
const shot = params.has('shot');
if (shot) {
  document.documentElement.classList.add('is-shot');
  if (params.get('vh')) document.documentElement.style.setProperty('--shot-vh', `${params.get('vh')}px`);
}
const reduced = shot || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Scie di luce nell'hero
const hero = document.querySelector('.hero');
if (hero && !reduced) {
  const speed = document.createElement('div');
  speed.className = 'speed';
  speed.setAttribute('aria-hidden', 'true');
  speed.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  hero.querySelector('.hero__media').after(speed);
}

// Scritte verticali: numero e nome di ogni sezione, dall'etichetta già presente
let n = 0;
document.querySelectorAll('main > section').forEach((sec) => {
  const eb = sec.querySelector(':scope > .wrap > .eyebrow, :scope > .wrap > div > .eyebrow');
  if (!eb || sec.classList.contains('hero') || sec.classList.contains('intro')) return;
  n += 1;
  const v = document.createElement('span');
  v.className = 'vlabel';
  v.setAttribute('aria-hidden', 'true');
  v.innerHTML = `<b>${String(n).padStart(2, '0')}</b>${eb.textContent}`;
  sec.appendChild(v);
  sec.classList.add('has-vlabel'); // l'etichetta orizzontale si nasconde dove c'è quella verticale
});
const gal = document.querySelector('.gallery');
if (gal) {
  const v = document.createElement('span');
  v.className = 'vlabel';
  v.setAttribute('aria-hidden', 'true');
  v.innerHTML = '<b>—</b>Mammano al lavoro';
  gal.appendChild(v);
}

// CTA finale: parola verticale che sta tutta nell'altezza della sezione
const cta = document.querySelector('.cta');
if (cta) {
  const big = document.createElement('span');
  big.className = 'cta__vertical';
  big.setAttribute('aria-hidden', 'true');
  const word = document.createElement('span');
  word.textContent = 'Traslochi';
  big.appendChild(word);
  cta.appendChild(big);
  const fit = () => {
    big.style.fontSize = '';
    const max = parseFloat(getComputedStyle(big).fontSize);
    const ratio = (cta.clientHeight * 0.86) / word.getBoundingClientRect().height;
    big.style.fontSize = `${Math.min(max, max * ratio)}px`;
  };
  fit();
  addEventListener('resize', fit);
}

// Barra di avanzamento + leggero parallasse della foto hero
const bar = document.querySelector('.progress');
const heroImg = document.querySelector('.hero__media img');
const track = document.querySelector('.gallery__track');
const wideScreen = matchMedia('(min-width: 901px)');
const onScroll = () => {
  if (gal && track && wideScreen.matches && !reduced) {
    const r = gal.getBoundingClientRect();
    const k = Math.min(Math.max(-r.top / (gal.offsetHeight - innerHeight), 0), 1);
    track.style.transform = `translate3d(${-k * (track.scrollWidth - innerWidth)}px, 0, 0)`;
  }
  const max = document.documentElement.scrollHeight - innerHeight;
  if (bar) bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
  if (heroImg && !reduced && scrollY < innerHeight) {
    heroImg.style.transform = `scale(1.08) translate3d(0, ${scrollY * 0.12}px, 0)`;
  }
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

if (!reduced && 'IntersectionObserver' in window) {
  // Entrate allo scroll, a cascata dentro ogni gruppo
  const targets = document.querySelectorAll(
    '.head, .eyebrow, .intro h1, .intro__grid, .point, .index-list li, .card, .split > *, .faq details, .spec, .contact-big li, .cta .wrap > *'
  );
  targets.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.matches('.point, .index-list li, .card, .faq details, .contact-big li'));
    const i = siblings.indexOf(el);
    if (i > 0) el.style.setProperty('--d', `${Math.min(i, 6) * 0.07}s`);
    el.classList.add('reveal');
  });
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((el) => revealIO.observe(el));

  // Numeri dell'hero che contano
  document.querySelectorAll('.facts-strip dd').forEach((dd) => {
    const m = dd.textContent.match(/^([\d']+)(.*)$/);
    if (!m) return;
    const target = parseInt(m[1].replace(/'/g, ''), 10);
    const suffix = m[2];
    const sep = m[1].includes("'");
    const from = target > 1000 && target < 2100 ? target - 40 : 0; // l'anno parte da 1946, gli altri da zero
    const fmt = (n) => (sep ? n.toLocaleString('de-CH') : String(n)) + suffix;
    dd.textContent = fmt(from);
    const run = () => {
      const t0 = performance.now();
      const dur = 1400;
      const tick = (now) => {
        const k = Math.min(Math.max((now - t0) / dur, 0), 1);
        const eased = 1 - Math.pow(1 - k, 4);
        dd.textContent = fmt(Math.round(from + (target - from) * eased));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countIO = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { run(); countIO.disconnect(); }
    }, { threshold: 0.6 });
    countIO.observe(dd);
  });

  // Processo: gli step si accendono uno dopo l'altro
  const steps = document.querySelectorAll('.steps li');
  if (steps.length) {
    const stepIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        steps.forEach((s, i) => setTimeout(() => s.classList.add('is-lit'), i * 260));
        stepIO.disconnect();
      });
    }, { threshold: 0.4 });
    stepIO.observe(steps[0].parentElement);
  }

  // Zone: le parole si accendono in sequenza
  const zones = document.querySelectorAll('.zones li');
  if (zones.length) {
    const zoneIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        zones.forEach((z, i) => setTimeout(() => z.classList.add('is-lit'), i * 140));
        zoneIO.disconnect();
      });
    }, { threshold: 0.5 });
    zoneIO.observe(zones[0].parentElement);
  }
} else {
  document.querySelectorAll('.steps li, .zones li').forEach((el) => el.classList.add('is-lit'));
}

// Link del menu e dei bottoni: nella modalità screenshot mantengono il parametro
if (shot) document.querySelectorAll('a[href$=".html"]').forEach((a) => { a.href += location.search; });

// Anteprima foto che segue il cursore sull'elenco servizi (solo desktop)
const previews = {
  'traslochi-privati.html': 'trasloco-mammano.jpg',
  'traslochi-aziendali.html': 'operai-traslochi.jpg',
  'traslochi-internazionali.html': 'traslochi-europa.jpg',
  'deposito-sgomberi-imballaggi.html': 'elevatore-lugano.jpg',
  'servizi.html#noleggio': 'traslochi-paradiso.jpg',
};
const list = document.querySelector('.index-list');
if (list && matchMedia('(hover: hover) and (min-width: 901px)').matches) {
  const box = document.createElement('div');
  box.className = 'cursor-preview';
  box.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.alt = '';
  box.appendChild(img);
  document.body.appendChild(box);
  list.querySelectorAll('a').forEach((a) => {
    const file = previews[a.getAttribute('href')];
    if (!file) return;
    a.addEventListener('mouseenter', () => { img.src = new URL(file, imgBase).href; box.classList.add('is-on'); });
    a.addEventListener('mouseleave', () => box.classList.remove('is-on'));
    a.addEventListener('mousemove', (e) => {
      box.style.setProperty('--x', `${e.clientX + 24}px`);
      box.style.setProperty('--y', `${e.clientY - 110}px`);
    });
  });
}
