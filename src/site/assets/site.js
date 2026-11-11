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
  window.matchMedia('(min-width: 1181px)').addEventListener('change', e => { if (e.matches) set(false); });
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

// Filtrul pe categorii din catalog: arată doar produsele categoriei alese (aria-pressed pe buton).
document.querySelectorAll('[data-filter]').forEach(bar => {
  const cards = [...bar.parentElement.querySelectorAll('.product[data-cat]')];
  bar.hidden = false;
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    bar.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    for (const c of cards) {
      c.hidden = !!b.dataset.cat && c.dataset.cat !== b.dataset.cat;
      if (!c.hidden) c.classList.add('in');
    }
  });
});

// Recenziile: după primele șase, restul se deschid la cerere.
document.querySelectorAll('.reviews-list').forEach(list => {
  const more = list.querySelector('.reviews-more');
  if (!more) return;
  list.classList.add('collapsed');
  more.hidden = false;
  more.querySelector('button').addEventListener('click', e => {
    list.classList.remove('collapsed');
    e.currentTarget.setAttribute('aria-expanded', 'true');
    more.hidden = true;
    list.querySelector('.review.more')?.querySelector('h3, blockquote')?.setAttribute('tabindex', '-1');
    list.querySelector('.review.more h3, .review.more blockquote')?.focus({preventScroll: true});
  });
});

// Trimite testul: datele de contact, fotografia benzii, apoi rezultatul. Fotografia se încarcă direct la serviciul de
// analiză (același ca în aplicația veche, render.mjs → data-api), care întoarce valorile și trimite raportul PDF pe email.
document.querySelectorAll('[data-testrapid]').forEach(root => {
  const api = JSON.parse(root.dataset.api);
  const info = JSON.parse(root.querySelector('[data-params-info]').textContent);
  const $ = s => root.querySelector(s);
  const form = $('form[data-step="1"]');
  const steps = [...root.querySelectorAll('.tr-step')];
  const dots = [...root.querySelectorAll('.tr-progress li')];
  const err = $('.tr-error[role="alert"]');
  const drop = $('[data-drop]'), preview = $('.tr-preview'), pick = $('.tr-pick'), send = $('[data-send]'), busy = $('.tr-busy');
  const optional = $('.tr-optional');
  let photo = null, previewUrl = null;

  const fail = msg => { err.textContent = msg; err.hidden = !msg; if (msg) err.scrollIntoView({block: 'nearest', behavior: 'smooth'}); };
  const show = step => {
    steps.forEach(s => { s.hidden = s.dataset.step !== String(step); });
    const n = step === 'pending' ? 3 : step;
    dots.forEach((d, i) => {
      d.classList.toggle('on', i + 1 === n); d.classList.toggle('done', i + 1 < n);
      if (i + 1 === n) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    fail('');
    const top = root.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72) - 24;
    if (Math.abs(scrollY - top) > 40) scrollTo({top, behavior: 'smooth'});
    const target = steps.find(s => !s.hidden);
    (target.classList.contains('tr-result') ? target : target.querySelector('input:not([hidden]), button.btn, [tabindex]') ?? target)?.focus?.({preventScroll: true});
  };

  // Pasul 1: aceleași reguli ca în aplicația veche (telefon românesc de mobil, email valid, acordul obligatoriu).
  const lead = () => Object.fromEntries(['name', 'email', 'phone', 'location'].map(k => [k, form.elements[k].value.trim()]));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = lead(), bad = [];
    const mark = (el, wrong) => { el.setAttribute('aria-invalid', String(!!wrong)); if (wrong) bad.push(el); };
    ['name', 'location'].forEach(k => mark(form.elements[k], !d[k]));
    mark(form.elements.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email));
    mark(form.elements.phone, !/^(07\d{8}|\+407\d{8})$/.test(d.phone.replace(/[\s\-.]/g, '')));
    mark(form.elements.gdpr, !form.elements.gdpr.checked);
    if (bad.length) {
      const msgs = [];
      if (bad.some(el => ['name', 'location'].includes(el.name))) msgs.push('Completează toate câmpurile obligatorii.');
      if (bad.includes(form.elements.email)) msgs.push('Adresa de email nu pare corectă.');
      if (bad.includes(form.elements.phone)) msgs.push('Numărul de telefon nu pare corect (de exemplu 0722 123 456).');
      if (bad.includes(form.elements.gdpr)) msgs.push('Pentru analiză avem nevoie de acordul pentru prelucrarea datelor.');
      fail(msgs.join('\n'));
      bad[0].focus();
      return;
    }
    show(2);
  });
  form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true') e.target.setAttribute('aria-invalid', 'false'); });

  // Pasul 2: fotografia. HEIC (iPhone) se convertește în JPEG în browser; peste 10 MB se micșorează până sub 5 MB.
  const OK_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'], OK_EXT = /\.(jpe?g|png|heic|heif)$/i;
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
  const shrink = (file, maxMb) => new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onerror = () => rej(new Error('img'));
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight, q = .95, n = 0;
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const round = () => {
        n++; c.width = w; c.height = h; g.drawImage(img, 0, 0, w, h);
        c.toBlob(b => {
          if (!b) return rej(new Error('blob'));
          if (b.size / 1048576 <= maxMb || n >= 20 || q <= .3) return res(new File([b], file.name.replace(/\.\w+$/, '.jpg'), {type: 'image/jpeg'}));
          if (q > .5) q -= .1; else { w *= .85; h *= .85; q = .9; }
          round();
        }, 'image/jpeg', q);
      };
      round();
    };
    img.src = url;
  });
  const choose = async file => {
    if (!file) return;
    fail('');
    if (/\.dng$/i.test(file.name) || /dng/i.test(file.type) || !(OK_TYPES.includes(file.type.toLowerCase()) || OK_EXT.test(file.name))) {
      fail('Format incompatibil. Încarcă o imagine JPG, PNG sau HEIC (nu DNG/RAW).');
      return;
    }
    send.disabled = true;
    try {
      let f = file;
      if (/\.(heic|heif)$/i.test(f.name) || /hei[cf]/i.test(f.type)) {
        send.textContent = 'Se convertește imaginea (HEIC)...';
        if (!window.heic2any) await loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
        const out = await window.heic2any({blob: f, toType: 'image/jpeg', quality: .8});
        f = new File([Array.isArray(out) ? out[0] : out], f.name.replace(/\.(heic|heif)$/i, '.jpg'), {type: 'image/jpeg'});
      }
      if (f.size / 1048576 > 10) f = await shrink(f, 5);
      photo = f;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(f);
      preview.querySelector('img').src = previewUrl;
      preview.querySelector('[data-fname]').textContent = file.name;
      preview.hidden = false; pick.hidden = true; optional.hidden = false;
      drop.classList.add('has');
    } catch {
      fail('Nu am putut citi imaginea. Încearcă din nou sau alege altă fotografie.');
    } finally {
      send.innerHTML = send.dataset.label;
      send.disabled = !photo;
    }
  };
  send.dataset.label = send.innerHTML;
  const clear = () => {
    photo = null; preview.hidden = true; pick.hidden = false; optional.hidden = true; drop.classList.remove('has'); send.disabled = true;
    root.querySelectorAll('input[type=file]').forEach(i => { i.value = ''; });
  };
  root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => $(b.dataset.pick === 'camera' ? '[data-camera]' : '[data-file]').click()));
  root.querySelectorAll('input[type=file]').forEach(i => i.addEventListener('change', () => choose(i.files[0])));
  $('[data-clear]').addEventListener('click', clear);
  $('[data-back]').addEventListener('click', () => show(1));
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => choose(e.dataTransfer.files[0]));

  // Interpretarea unei valori: pragul parametrului (testrapid.mjs) sau, dacă nu-l găsim, culoarea după eticheta primită.
  const details = name => info.find(p => p.name === name) ?? info.find(p => p.name.startsWith(name) || p.name.includes(`(${name})`));
  const colorOf = status => {
    const s = String(status ?? '').toLowerCase();
    if (!s) return 'green';
    if (s.includes('sub') || s.includes('ușor') || s.includes('la limită') || s.includes('urmărit') || s === 'ridicat' || s.includes('prezenți')) return 'orange';
    if (s.includes('peste') || s.includes('foarte ridicat') || s.includes('problematic') || s.includes('valori mari') || s.includes('critic')) return 'red';
    return 'green';
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
  const result = data => {
    const params = (Array.isArray(data.parameters) ? data.parameters : []).map(p => {
      const d = details(p.name), raw = p.estimated_value ?? p.value ?? '';
      const v = parseFloat(String(raw).replace(',', '.').replace('~', '').trim());
      const tier = d && !isNaN(v) ? d.tiers.find(t => t.max == null || v <= t.max) ?? d.tiers.at(-1) : null;
      return {name: (d?.name ?? p.name).replace(/\s*\((?!.*\().*\)$/, ''), unit: p.unit ?? d?.units?.replace(/\s*\(.*\)$/, ''), range: d?.units,
        value: raw, status: tier?.label ?? p.status, color: tier?.color ?? p.statusColor ?? colorOf(p.status),
        text: tier?.text ?? p.interpretation ?? '', short: p.interpretationShort ?? ''};
    });
    const count = c => params.filter(p => p.color === c).length;
    $('[data-summary]').innerHTML = [['green', 'în limite'], ['orange', 'de urmărit'], ['red', 'peste limite']]
      .filter(([c]) => count(c)).map(([c, l]) => `<span class="${c}">${count(c)} ${l}</span>`).join('');
    const box = (sel, text) => { const b = $(sel); b.hidden = !text; b.querySelector('p').textContent = text ?? ''; };
    box('[data-conclusion]', data.summary || data.overall_conclusion || '');
    box('[data-reco]', data.general_recommendation || (Array.isArray(data.recommendations) ? data.recommendations.join('\n') : ''));
    $('[data-params]').innerHTML = params.map(p => `<li class="tr-param ${p.color}"><details><summary>
      <span class="bar" aria-hidden="true"></span><span class="name"><strong>${esc(p.name)}</strong><small>${esc(p.unit)}</small></span>
      <span class="val"><b>${esc(p.value)}</b>${p.status ? `<span class="tr-status">${esc(p.status)}</span>` : ''}</span></summary>
      <div class="more"><p>${esc(p.text || p.short || 'Nu există informații detaliate pentru acest parametru.')}</p>${p.range ? `<p>Domeniul testului: ${esc(p.range)}</p>` : ''}</div></details></li>`).join('');
    show(3);
  };

  send.addEventListener('click', async () => {
    if (!photo) return;
    fail('');
    const msg = $('[data-msg]');
    busy.hidden = false; busy.classList.remove('analyzing'); msg.textContent = 'Se încarcă fotografia...';
    const auth = {apikey: api.key, Authorization: `Bearer ${api.key}`};
    try {
      const path = `inputs/${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`}.jpg`;
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', photo);
      const up = await fetch(`${api.url}/storage/v1/object/${api.bucket}/${path}`, {method: 'POST', headers: {...auth, 'x-upsert': 'false'}, body});
      if (!up.ok) throw new Error('Nu am putut încărca fotografia. Încearcă din nou.');
      msg.textContent = 'Analizăm cei 16 parametri...'; busy.classList.add('analyzing');
      const r = await fetch(`${api.url}/functions/v1/${api.fn}`, {method: 'POST', headers: {...auth, 'Content-Type': 'application/json'},
        body: JSON.stringify({imagePath: path, lead: {...lead(), note: (optional.querySelector('input').value || '').trim(),
          gdpr: form.elements.gdpr.checked, consentContact: form.elements.consentContact.checked}})});
      if (!(r.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Eroare de server. Încearcă din nou peste câteva momente.');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'A apărut o eroare la analiză. Încearcă din nou.');
      if (data.pendingRetry) { clear(); show('pending'); return; }
      if (data.imageQualityIssue) {
        clear();
        throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Nu am putut analiza fotografia. Încearcă din nou cu o imagine mai clară:\n• banda trebuie să fie vizibilă și în focus;\n• fotografia, făcută în lumină bună;\n• toți cei 16 indicatori, vizibili;\n• banda, paralelă cu scala de culori.');
      }
      result(data);
    } catch (e) {
      fail(e instanceof TypeError ? 'Nu s-a putut trimite fotografia. Verifică conexiunea și încearcă din nou.' : e.message);
    } finally {
      busy.hidden = true;
    }
  });
  root.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', () => { clear(); show(2); }));
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

  // Picătura 3D din hero: un câmp de distanțe (o sferă care unduiește, plus picături mici care se desprind și se reunesc), trasat în shader.
  const drop = () => {
    const cv = document.querySelector('.fx-drop');
    if (!cv) return;
    const stage = cv.parentElement, zone = cv.closest('[data-zone]');
    const gl = cv.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power'});
    const fail = () => stage.classList.add('no-gl');
    if (!gl) return fail();
    // Fără placă video adevărată (randare în software), shader-ul ar ține procesorul ocupat: picătura rămâne statică.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info && /swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) return fail();
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
    let scale = Math.min(window.devicePixelRatio || 1, 1.25, budget()), slow = 0, shown = false;
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
      if (!shown) { shown = true; cv.classList.add('on'); }
    });
  };
  // Pornește după ce pagina s-a încărcat și browserul e liber: compilarea shader-ului nu mai întârzie primul ecran.
  const idle = window.requestIdleCallback ?? (f => setTimeout(f, 200));
  const later = () => idle(drop, {timeout: 1500});
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, {once: true});

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
