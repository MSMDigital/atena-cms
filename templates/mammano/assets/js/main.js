const header = document.querySelector('.header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.getElementById('nav');

// Menu mobile
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? toggle.dataset.labelClose : toggle.dataset.labelOpen);
  });
}

// Header trasparente sulla foto della home, bianco dopo lo scroll
if (header && header.classList.contains('header--overlay')) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}
