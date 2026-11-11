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

// Formularul de contact pe site-ul static: nu există server care să primească mesajul, așa că la trimitere se deschide
// aplicația de email a vizitatorului, cu subiectul și mesajul gata completate.
document.querySelectorAll('form[data-mailto]').forEach(form => form.addEventListener('submit', e => {
  e.preventDefault();
  const v = n => form.elements[n]?.value.trim() ?? '';
  const body = [`Nume: ${v('name')}`, `Email: ${v('email')}`, ...(v('phone') ? [`Telefon: ${v('phone')}`] : []), '', v('message')].join('\n');
  window.location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(v('subject'))}&body=${encodeURIComponent(body)}`;
  const note = form.querySelector('.form-note');
  if (note) note.hidden = false;
}));

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

// Tutorialul animat: o scenă pe rând, în ritmul narațiunii (data-dur, în secunde). Pornește doar la cerere,
// se oprește singur când iese din ecran și reia când revine. Merge și cu „mișcare redusă”: scenele apar direct în starea finală.
document.querySelectorAll('[data-tutorial]').forEach(root => {
  const scenes = [...root.querySelectorAll('.tut-scene')];
  if (!scenes.length) return;
  const $ = s => root.querySelector(s);
  const main = $('.tut-main'), list = $('.tut-chapters'), playBtn = $('.tut-play'), counter = $('.tut-n');
  const segs = [...root.querySelectorAll('.tut-segs i')], chapters = [...list.children];
  const durs = scenes.map(s => (parseFloat(s.dataset.dur) || 6) * 1000);
  let i = 0, t = 0, playing = false, last = 0, raf = 0, idle = 0, autoPaused = false;

  root.classList.add('is-player');
  $('.tut-over').hidden = false;
  list.hidden = false;

  const paint = () => segs.forEach((s, k) => s.style.setProperty('--p', k < i ? 1 : k > i ? 0 : Math.min(1, t / durs[i])));
  function show(n, animate = true) {
    i = Math.max(0, Math.min(scenes.length - 1, n));
    t = 0;
    scenes.forEach((s, k) => { s.classList.toggle('cur', k === i); s.classList.remove('on'); });
    // Clasa `on` pornește mișcarea scenei; scoasă și pusă la loc, o ia de la capăt.
    if (animate) { void scenes[i].offsetWidth; scenes[i].classList.add('on'); }
    chapters.forEach((c, k) => {
      c.classList.toggle('on', k === i); c.classList.toggle('done', k < i);
      const b = c.querySelector('button');
      if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    if (counter) counter.textContent = `${i + 1} / ${scenes.length}`;
    // Pasul curent rămâne vizibil în listă, fără să miște pagina.
    const c = chapters[i];
    list.scrollTo({top: c.offsetTop - list.clientHeight / 2 + c.offsetHeight / 2, left: c.offsetLeft - list.clientWidth / 2 + c.offsetWidth / 2, behavior: 'smooth'});
    paint();
  }
  function tick(now) {
    t += now - last; last = now;
    if (t >= durs[i]) {
      if (i < scenes.length - 1) show(i + 1);
      else { t = durs[i]; paint(); root.classList.add('ended'); return setPlaying(false); }
    }
    paint();
    raf = requestAnimationFrame(tick);
  }
  function setPlaying(p) {
    playing = p;
    root.classList.toggle('playing', p);
    root.classList.toggle('paused', !p);
    playBtn.setAttribute('aria-label', p ? 'Pauză' : root.classList.contains('ended') ? 'Reia de la început' : 'Pornește');
    cancelAnimationFrame(raf);
    if (p) { last = performance.now(); raf = requestAnimationFrame(tick); wake(); }
  }
  function play() {
    if (!root.classList.contains('started') || root.classList.contains('ended')) { root.classList.add('started'); root.classList.remove('ended'); show(0); }
    setPlaying(true);
  }
  const go = n => { root.classList.add('started'); root.classList.remove('ended'); show(n); setPlaying(true); };
  // Bara de control se retrage cât rulează și nimeni nu mișcă mouse-ul; revine la orice atingere.
  function wake() { root.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => { if (playing && !main.querySelector('.tut-bar:focus-within')) root.classList.add('idle'); }, 2600); }

  $('.tut-big').addEventListener('click', () => { play(); playBtn.focus({preventScroll: true}); });
  playBtn.addEventListener('click', () => playing ? setPlaying(false) : play());
  $('.tut-prev').addEventListener('click', () => go(t > 1500 ? i : i - 1));
  $('.tut-next').addEventListener('click', () => go(i + 1));
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.go))));
  root.querySelectorAll('.tut-art').forEach(a => a.addEventListener('click', () => root.classList.contains('started') && (playing ? setPlaying(false) : play())));
  main.addEventListener('pointermove', wake);
  main.addEventListener('focusin', wake);
  root.addEventListener('keydown', e => {
    if (e.target.closest('.tut-chapters, .tut-segs') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    else if ((e.key === 'k' || e.key === ' ') && e.target.tagName !== 'BUTTON') { e.preventDefault(); playing ? setPlaying(false) : play(); }
  });

  const full = $('.tut-full');
  const request = main.requestFullscreen ?? main.webkitRequestFullscreen;
  if (!request) full.hidden = true;
  else full.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : request.call(main));

  // Lista pașilor are înălțimea player-ului.
  new ResizeObserver(() => root.style.setProperty('--tut-h', `${main.offsetHeight}px`)).observe(main);
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting && playing) { autoPaused = true; setPlaying(false); }
    else if (e.isIntersecting && autoPaused) { autoPaused = false; setPlaying(true); }
  }, {threshold: .25}).observe(main);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) { autoPaused = true; setPlaying(false); }
    else if (!document.hidden && autoPaused) { autoPaused = false; setPlaying(true); }
  });

  show(0, false);
  root.classList.remove('paused');
});

// Mișcarea paginii. Fără biblioteci: IntersectionObserver, un singur ascultător de derulare,
// WebGL pentru picătura din hero și canvas 2D pentru drumul apei. Cu „mișcare redusă” nu pornește nimic din toate astea.
(() => {
  const root = document.documentElement;
  window.__fx = true;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) { root.classList.add('fx-still'); return; }
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Rulează `tick` doar cât elementul e în ecran.
  function whileVisible(el, tick) {
    let on = false, raf = 0, last = 0;
    const loop = now => { if (!on) return; tick(now / 1000, Math.min(.05, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
    new IntersectionObserver(([e]) => {
      on = e.isIntersecting && !document.hidden;
      cancelAnimationFrame(raf);
      if (on) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }, {rootMargin: '80px'}).observe(el);
  }

  // Titlul: cuvintele urcă pe rând.
  $$('[data-split]').forEach(h => {
    let i = 0;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 1) return walk(n);
      if (n.nodeType !== 3 || !n.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part.trim()) return frag.append(part);
        const w = document.createElement('span'), inner = document.createElement('span');
        w.className = 'fx-w'; w.style.setProperty('--i', i++); inner.textContent = part; w.append(inner); frag.append(w);
      });
      n.replaceWith(frag);
    });
    walk(h);
    h.classList.add('ready');
    requestAnimationFrame(() => requestAnimationFrame(() => h.classList.add('in')));
  });

  // Cifrele numără până la valoarea lor (doar cele cu un singur număr întreg, de pildă „11.000 L”).
  const fmt = new Intl.NumberFormat('ro-RO');
  function countUp(el) {
    const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/.exec(el.textContent.trim());
    if (!m) return;
    const to = Number(m[1].replace(/\./g, '')), t0 = performance.now(), dur = 1600;
    el.style.fontVariantNumeric = 'tabular-nums';
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt.format(Math.round(to * e)) + m[2];
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Apariții la derulare; copiii unui [data-stagger] vin pe rând.
  $$('[data-stagger]').forEach(g => [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 8))));
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    $$('[data-count]', e.target).forEach(countUp);
    io.unobserve(e.target);
  }), {rootMargin: '0px 0px -8% 0px'});
  $$('[data-reveal]').forEach(el => io.observe(el));

  // Derularea: bara de progres și paralaxa.
  const bar = document.querySelector('.fx-progress');
  const par = $$('[data-parallax]').map(el => ({el, k: parseFloat(el.dataset.parallax)}));
  const onScrollFns = [];
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const vh = window.innerHeight;
    bar?.style.setProperty('--p', clamp(window.scrollY / Math.max(1, root.scrollHeight - vh), 0, 1).toFixed(4));
    for (const {el, k} of par) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      el.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * k).toFixed(1)}px`);
    }
    onScrollFns.forEach(f => f(vh));
  };
  const queue = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
  window.addEventListener('scroll', queue, {passive: true});
  window.addEventListener('resize', queue);

  // Axa pașilor: se umple până la linia de citire, iar punctele trecute se aprind.
  $$('.timeline[data-progress]').forEach(list => {
    const items = [...list.children];
    onScrollFns.push(vh => {
      const r = list.getBoundingClientRect(), line = vh * .62;
      if (r.bottom < -100 || r.top > vh + 100) return;
      list.style.setProperty('--p', clamp((line - r.top - 28) / Math.max(1, r.height - 84), 0, 1).toFixed(4));
      items.forEach(li => li.classList.toggle('on', li.getBoundingClientRect().top + 28 < line));
    });
  });

  // Zonele care se înclină după cursor: --mx și --my între −1 și 1, netezite.
  $$('[data-zone]').forEach(zone => {
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const run = () => {
      x += (tx - x) * .08; y += (ty - y) * .08;
      zone.style.setProperty('--mx', x.toFixed(3)); zone.style.setProperty('--my', y.toFixed(3));
      zone._m = [x, y];
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .002 ? requestAnimationFrame(run) : 0;
    };
    const set = (nx, ny) => { tx = nx; ty = ny; if (!raf) raf = requestAnimationFrame(run); };
    zone.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = zone.getBoundingClientRect();
      set(clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1), clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1));
    });
    zone.addEventListener('pointerleave', () => set(0, 0));
  });

  // Pata de lumină de pe carduri.
  $$('[data-spot]').forEach(card => card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--x', `${e.clientX - r.left}px`); card.style.setProperty('--y', `${e.clientY - r.top}px`);
  }));

  // Banda de test: padul ales își arată parametrul; până o atinge cineva, trece singură de la unul la altul.
  $$('.fx-strip-wrap').forEach(wrap => {
    const pads = $$('button', wrap), name = wrap.querySelector('.fx-strip-out strong'), info = wrap.querySelector('.fx-strip-out span');
    let cur = 0, auto = true, visible = false;
    const show = i => {
      cur = i;
      pads.forEach((p, k) => p.setAttribute('aria-pressed', String(k === i)));
      name.textContent = pads[i].dataset.name; info.textContent = pads[i].dataset.info;
    };
    pads.forEach((p, i) => ['pointerenter', 'focus', 'click'].forEach(ev => p.addEventListener(ev, () => { auto = false; show(i); })));
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(wrap);
    setInterval(() => { if (auto && visible && !document.hidden) show((cur + 1) % pads.length); }, 2400);
  });

  // Scenele din felii: peticul de sub fiecare felie ascunde figura din imaginea de bază. Culoarea lui vine din imagine:
  // pornind de la marginea peticului, culorile fundalului se întind lin spre interior (medie cu vecinii, repetată),
  // pe o copie de patru ori mai mică. Până e gata, sau dacă nu reușește, rămân peticele simple puse de server.
  $$('.fx-scene').forEach(async svg => {
    const group = svg.querySelector('.fx-patches'), polys = group ? $$('polygon', group) : [];
    if (!polys.length) return;
    const [, , W, H] = svg.getAttribute('viewBox').split(/\s+/).map(Number), k = 4, w = Math.ceil(W / k), h = Math.ceil(H / k);
    const img = new Image();
    img.src = svg.querySelector('image').getAttribute('href');
    try { await img.decode(); } catch { return; }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', {willReadFrequently: true});
    g.drawImage(img, 0, 0, w, h);
    const src = g.getImageData(0, 0, w, h).data;
    // Masca: peticele, lărgite cu câțiva pixeli, ca marginea lor să cadă pe fundal, nu pe conturul figurii.
    g.clearRect(0, 0, w, h);
    g.lineWidth = 8 / k; g.lineJoin = 'round';
    for (const poly of polys) {
      const pts = poly.getAttribute('points').trim().split(/\s+/).map(p => p.split(',').map(Number));
      g.beginPath();
      pts.forEach(([x, y], i) => i ? g.lineTo(x / k, y / k) : g.moveTo(x / k, y / k));
      g.closePath(); g.fill(); g.stroke();
    }
    const mask = g.getImageData(0, 0, w, h).data, inside = [];
    for (let i = 0; i < w * h; i++) if (mask[i * 4 + 3] > 127) inside.push(i);
    const d = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) d[i * 3 + c] = src[i * 4 + c];
    for (let it = 0; it < 500; it++) for (const i of inside) {
      const x = i % w, l = x ? i - 1 : i, r = x < w - 1 ? i + 1 : i, u = i >= w ? i - w : i, b = i < w * (h - 1) ? i + w : i;
      for (let c = 0; c < 3; c++) d[i * 3 + c] += 1.7 * ((d[l * 3 + c] + d[r * 3 + c] + d[u * 3 + c] + d[b * 3 + c]) / 4 - d[i * 3 + c]);
    }
    const out = g.createImageData(w, h);
    for (const i of inside) { for (let c = 0; c < 3; c++) out.data[i * 4 + c] = clamp(d[i * 3 + c], 0, 255); out.data[i * 4 + 3] = 255; }
    g.putImageData(out, 0, 0);
    const patch = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    patch.setAttribute('href', cv.toDataURL()); patch.setAttribute('width', W); patch.setAttribute('height', H);
    patch.setAttribute('filter', polys[0].getAttribute('filter'));
    group.replaceChildren(patch);
  });

  // Scenele decupate (în picătura din hero): fundalul iese din imagine după luminozitate. Ce e mai deschis decât `key[0]`
  // devine transparent, ce e mai închis decât `key[1]` rămâne întreg; zonele din `skip` (forme de fundal închise la culoare)
  // dispar cu totul. Toate copiile imaginii din scenă primesc apoi varianta fără fundal.
  $$('.fx-cutout').forEach(async svg => {
    const cfg = JSON.parse(svg.dataset.key), images = $$('image', svg), img = new Image();
    img.src = images[0].getAttribute('href');
    try { await img.decode(); } catch { return svg.classList.add('ready'); }
    const cv = document.createElement('canvas'), w = cv.width = img.naturalWidth, h = cv.height = img.naturalHeight;
    const g = cv.getContext('2d', {willReadFrequently: true});
    for (const poly of cfg.skip ?? []) {
      const pts = poly.trim().split(/\s+/).map(p => p.split(',').map(Number));
      g.beginPath();
      pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      g.closePath(); g.fill();
    }
    const skip = g.getImageData(0, 0, w, h).data;
    g.clearRect(0, 0, w, h);
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, w, h), d = px.data, [from, to] = cfg.key;
    for (let i = 0; i < d.length; i += 4) {
      const k = clamp((from - (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11)) / (from - to), 0, 1);
      d[i + 3] = skip[i + 3] ? 0 : Math.round(255 * k * k * (3 - 2 * k));
    }
    g.putImageData(px, 0, 0);
    const url = cv.toDataURL();
    images.forEach(el => el.setAttribute('href', url));
    svg.classList.add('ready');
  });

  // Picătura 3D din hero: un câmp de distanțe (o sferă care unduiește, plus picături mici care se desprind și se reunesc), trasat în shader.
  (() => {
    const cv = document.querySelector('.fx-drop');
    if (!cv) return;
    const stage = cv.parentElement, zone = cv.closest('[data-zone]');
    const gl = cv.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power'});
    const fail = () => stage.classList.add('no-gl');
    if (!gl) return fail();
    const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = `precision highp float;
uniform vec2 R;uniform float T;uniform vec2 M;uniform sampler2D S;uniform float K;
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float map(vec3 p){
  float d=length(p)-1.;
  d+=.045*sin(2.6*p.x+T*.9)*sin(2.9*p.y-T*.7)*sin(2.3*p.z+T*1.1);
  for(int i=0;i<3;i++){
    float f=float(i),a=T*(.3+.07*f)+f*2.094;
    vec3 c=vec3(cos(a)*1.3,sin(a)*1.3,.3*sin(T*.5+f*1.7));
    d=smin(d,length(p-c)-(.19+.05*sin(T*.6+f*2.)),.42);
  }
  return smin(d,length(p-vec3(M*1.4,.2))-.15,.5);
}
vec3 nrm(vec3 p){vec2 e=vec2(.003,-.003);return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));}
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-R)/min(R.x,R.y);
  vec3 ro=vec3(0.,0.,4.),rd=normalize(vec3(uv*.46,-1.));
  float b=dot(ro,rd),h=b*b-(16.-3.24);
  if(h<0.){gl_FragColor=vec4(0.);return;}
  h=sqrt(h);
  float t=-b-h,tm=-b+h,md=9.;bool hit=false;
  for(int i=0;i<40;i++){float d=map(ro+rd*t);md=min(md,d);if(d<.003){hit=true;break;}t+=d*.95;if(t>tm)break;}
  vec3 deep=vec3(.12,.34,.74);
  if(hit){
    vec3 p=ro+rd*t,n=nrm(p),v=-rd;
    float f=1.-max(dot(n,v),0.);
    vec3 col=mix(vec3(.91,.96,1.),vec3(1.),n.y*.5+.5);
    col=mix(col,vec3(.40,.80,.98),smoothstep(.42,.78,f));
    col=mix(col,deep,smoothstep(.74,1.,f));
    if(K>0.){
      // Semnul din picătură: o placă în planul z=0, văzută prin apă (raza refractată la suprafață), care se leagănă ușor.
      vec3 r=refract(rd,n,.75);
      vec3 q=p+r*(-p.z/min(r.z,-.05));
      vec2 u=(q.xy+vec2(.025*sin(T*.55),.02*sin(T*.8))+vec2(.04,-.03))/1.1+.5;
      float a=texture2D(S,vec2(u.x,1.-u.y)).a*step(0.,u.x)*step(u.x,1.)*step(0.,u.y)*step(u.y,1.);
      col=mix(col,mix(vec3(.10,.29,.62),vec3(.16,.45,.82),u.y),a*K*.8*(1.-smoothstep(.45,.9,f)));
    }
    float s1=pow(max(dot(reflect(-normalize(vec3(-.55,.75,.6)),n),v),0.),80.);
    float s2=pow(max(dot(reflect(-normalize(vec3(.7,.25,.5)),n),v),0.),26.)*.22;
    float g=pow(max(dot(n,normalize(vec3(.5,-.72,.3))),0.),3.)*smoothstep(.3,.75,f)*.6;
    col+=vec3(s1+s2)+vec3(.7,.95,1.)*g;
    gl_FragColor=vec4(min(col,1.),1.);
  }else{
    float e=smoothstep(.016,0.,md),g=exp(-md*9.)*.14*(1.-e);
    gl_FragColor=vec4(deep*e+vec3(.04,.73,.94)*g,e+g);
  }
}`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return fail();
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail();
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'R'), uT = gl.getUniformLocation(prog, 'T'), uM = gl.getUniformLocation(prog, 'M'), uK = gl.getUniformLocation(prog, 'K');
    // Lebăda din logo (data-mark): partea de sus a imaginii, până la primul rând gol, decupată și centrată într-un pătrat.
    // Apare treptat după încărcare; dacă logo-ul nu se poate citi, picătura rămâne goală.
    let mark = 0, markOn = 0;
    if (cv.dataset.mark) {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d', {willReadFrequently: true});
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, w, h).data, row = y => { for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 24) return true; return false; };
        let top = 0; while (top < h && !row(top)) top++;
        let bottom = top; while (bottom < h && row(bottom)) bottom++;
        let left = w, right = 0;
        for (let y = top; y < bottom; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 24) { if (x < left) left = x; if (x > right) right = x; }
        if (right <= left) return;
        const N = 512, side = Math.max(right - left, bottom - top) * 1.08, sq = document.createElement('canvas');
        sq.width = sq.height = N;
        const k = N / side, sg = sq.getContext('2d');
        sg.drawImage(c, left, top, right - left, bottom - top, (N - (right - left) * k) / 2, (N - (bottom - top) * k) / 2, (right - left) * k, (bottom - top) * k);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sq);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        mark = 1;
      };
      img.src = cv.dataset.mark;
    }
    // Rezoluția scade singură dacă placa video nu ține pasul.
    const budget = () => Math.sqrt(420000 / Math.max(1, cv.clientWidth * cv.clientHeight));
    let scale = Math.min(window.devicePixelRatio || 1, 1.25, budget()), slow = 0;
    const size = () => {
      const w = Math.round(cv.clientWidth * scale), h = Math.round(cv.clientHeight * scale);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    };
    new ResizeObserver(size).observe(cv);
    cv.addEventListener('webglcontextlost', fail);
    whileVisible(cv, (t, dt) => {
      if (dt > .024 && scale > .4 && ++slow > 24) { scale *= .85; slow = 0; }
      size();
      const m = zone?._m ?? [0, 0];
      // Cursorul trage o picătură mică spre el; în repaus, ea stă ascunsă în picătura mare.
      gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, t); gl.uniform2f(uM, m[0] * .95, -m[1] * .95);
      markOn += (mark - markOn) * Math.min(1, dt * 1.5); gl.uniform1f(uK, markOn);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  })();

  // Drumul apei: particulele curg de la stânga la dreapta; fiecare etapă le oprește pe ale ei.
  $$('.fx-flow').forEach(section => {
    const n = JSON.parse(section.dataset.flow).stages;
    const band = section.querySelector('.fx-flow-band'), cv = band.querySelector('canvas'), g = cv.getContext('2d');
    const steps = $$('.fx-flow-steps li', section), rail = section.querySelector('.fx-flow-rail');
    if (!g || !n) return;
    section.classList.add('is-live');
    const COLORS = ['#d7a45f', '#c3e66b', '#f08fb0', '#b79cf2'];
    let W = 0, H = 0, parts = [], step = 0, glow = 0;
    const gate = i => W * (i + 1) / (n + 1);
    const spawn = (p, fresh) => {
      const r = Math.random();
      p.kind = r < .5 ? -1 : Math.floor((r - .5) * 2 * n);
      p.r = p.kind < 0 ? 1.4 + Math.random() * 1.4 : (7 / (p.kind * 1.1 + 1)) * (.75 + Math.random() * .5);
      p.x = fresh ? Math.random() * W : -20 - Math.random() * 60;
      // O particulă nu apare dincolo de etapa care o oprește.
      if (fresh && p.kind >= 0) p.x = Math.random() * (gate(p.kind) - p.r - 6);
      p.y = H * (.1 + Math.random() * .8); p.v = 38 + Math.random() * 46; p.ph = Math.random() * 6.28; p.a = 1; p.stuck = 0;
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = band.clientWidth; H = band.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = clamp(Math.round(W * H / 2600), 70, 260);
      parts = Array.from({length: count}, () => { const p = {}; spawn(p, true); return p; });
    };
    new ResizeObserver(resize).observe(band);

    onScrollFns.push(vh => {
      const r = section.getBoundingClientRect(), p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
      const s = Math.min(steps.length - 1, Math.floor(p * steps.length));
      rail?.style.setProperty('--p', p.toFixed(4));
      if (s !== step) { step = s; steps.forEach((li, i) => li.classList.toggle('is-on', i === s)); }
    });
    queue();

    whileVisible(band, (t, dt) => {
      g.clearRect(0, 0, W, H);
      // Zonele: tot mai limpede spre dreapta.
      for (let i = 0; i <= n; i++) {
        const x0 = i ? gate(i - 1) : 0, x1 = i < n ? gate(i) : W, k = i / n;
        g.fillStyle = `rgba(${Math.round(215 - 204 * k)},${Math.round(164 + 23 * k)},${Math.round(95 + 144 * k)},${.07 + .05 * k})`;
        g.fillRect(x0, 0, x1 - x0, H);
      }
      // Lumina urmărește pasul curent.
      const fx = step < n ? gate(step) : (gate(n - 1) + W) / 2;
      glow += (fx - glow) * Math.min(1, dt * 4);
      const rad = g.createRadialGradient(glow, H / 2, 0, glow, H / 2, Math.max(H, W * .22));
      rad.addColorStop(0, 'rgba(11,187,239,.30)'); rad.addColorStop(1, 'rgba(11,187,239,0)');
      g.fillStyle = rad; g.fillRect(0, 0, W, H);
      // Membranele: pori tot mai fini.
      for (let i = 0; i < n; i++) {
        const sp = Math.max(7, 16 / (i * 1.2 + 1)), on = i === step;
        g.fillStyle = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.38)';
        for (let c = -1; c <= 1; c++) for (let y = sp / 2 + (c ? sp / 2 : 0); y < H; y += sp) {
          g.beginPath(); g.arc(gate(i) + c * sp * .8, y, sp * .2, 0, 6.28); g.fill();
        }
      }
      for (const p of parts) {
        if (p.stuck) { p.stuck += dt; p.x -= dt * 14; p.a = 1 - p.stuck / 1.4; if (p.a <= 0) spawn(p); }
        else {
          p.x += p.v * dt; p.y += Math.sin(t * 1.3 + p.ph) * 9 * dt;
          if (p.kind >= 0 && p.x + p.r >= gate(p.kind) - 6) p.stuck = .001;
          else if (p.x > W + 20) spawn(p);
        }
        const pure = p.kind < 0 && p.x > gate(n - 1);
        g.globalAlpha = clamp(p.a, 0, 1) * (p.kind < 0 ? (pure ? .95 : .6) : .9);
        g.fillStyle = p.kind < 0 ? (pure ? '#d9f6ff' : '#5fcdf7') : COLORS[p.kind % COLORS.length];
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.fill();
      }
      g.globalAlpha = 1;
    });
  });

  onScroll();
})();
