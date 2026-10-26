// Antetul: umbră la derulare și meniul de pe mobil (aria-expanded, Escape, clic în afară).
document.documentElement.classList.add('js');
(() => {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('nav');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, {passive: true});
  if (!toggle || !nav) return;
  const set = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
    nav.classList.toggle('open', open);
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); toggle.focus(); } });
  document.addEventListener('click', e => { if (nav.classList.contains('open') && !header.contains(e.target)) set(false); });
  window.matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) set(false); });
})();
