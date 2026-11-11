// Calculatorul de economii: aceeași formulă ca la server (render.mjs → calc), recalculată pe loc.
document.querySelectorAll('form[data-calc]').forEach(form => {
  const d = JSON.parse(form.dataset.calc);
  const num = n => new Intl.NumberFormat('ro-RO', {maximumFractionDigits: 0}).format(n);
  const $ = n => form.querySelector(`[name="${n}"]`);
  const out = k => form.querySelector(`[data-r="${k}"]`);
  const persons = $('persoane'), liters = $('litri'), cost = $('cost');
  let litersTouched = false, timer;
  const update = () => {
    const l = Math.max(0, parseFloat(liters.value) || 0), c = Math.max(0, parseFloat(String(cost.value).replace(',', '.')) || 0);
    const monthly = l * c - d.yearly / 12;
    const loss = monthly <= 0;
    const months = !loss && d.kit ? Math.ceil(d.kit / monthly) : null;
    const payback = months == null ? '—' : months > 60 ? 'peste 5 ani' : `${months} ${months === 1 ? 'lună' : 'luni'}`;
    out('annual').textContent = loss ? '—' : `${num(monthly * 12)} lei`;
    out('monthly').textContent = loss ? '—' : `${num(monthly)} lei`;
    out('bottles').textContent = num(l * 12 / d.bottle);
    if (out('payback')) out('payback').textContent = payback;
    form.querySelector('.calc-warn').hidden = !loss;
    clearTimeout(timer);
    timer = setTimeout(() => {
      out('summary').textContent = loss ? 'La acest consum, cartușele costă mai mult decât apa îmbuteliată.'
        : `Economisești ${num(monthly * 12)} lei pe an, adică ${num(monthly)} lei pe lună${months ? `; kitul se amortizează în ${payback}` : ''}.`;
    }, 700);
  };
  const fromPersons = () => { if (!litersTouched) liters.value = Math.round((parseInt(persons.value, 10) || 1) * d.perPersonMonth); update(); };
  persons.addEventListener('input', fromPersons);
  liters.addEventListener('input', () => { litersTouched = true; update(); });
  cost.addEventListener('input', update);
  form.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    persons.value = Math.min(15, Math.max(1, (parseInt(persons.value, 10) || 1) + Number(b.dataset.step)));
    fromPersons();
  }));
});

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
