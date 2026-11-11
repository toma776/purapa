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
  (() => {
    const cv = document.querySelector('.fx-drop');
    if (!cv) return;
    const stage = cv.parentElement, zone = cv.closest('[data-zone]');
    const gl = cv.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power'});
    const fail = () => stage.classList.add('no-gl');
    if (!gl) return fail();
    const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = `precision highp float;
uniform vec2 R;uniform float T;uniform vec2 M;
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
    const uR = gl.getUniformLocation(prog, 'R'), uT = gl.getUniformLocation(prog, 'T'), uM = gl.getUniformLocation(prog, 'M');
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
