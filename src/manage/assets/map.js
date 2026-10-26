// Harta legăturilor (§2.4): tipurile → membrii unui tip → o entitate; traseul, sănătatea, „Toate legăturile”.
// Starea stă în adresă (#tip:produse, #produse:12, #traseu…), deci butonul Înapoi și linkurile funcționează.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
  const NS = 'http://www.w3.org/2000/svg';
  const canvas = $('#map'), panel = $('#map-panel'), crumbs = $('#map-crumbs');
  const state = {layers: new Set(['texte']), statuses: new Set(['confirmed', 'inferred', 'unverified']), overview: null};

  const get = async url => {
    const r = await fetch(url, {headers: {accept: 'application/json'}, credentials: 'same-origin'});
    if (r.status === 401) { location.href = `/manage/login/?next=${encodeURIComponent(location.pathname)}`; throw new Error('Autentificare necesară'); }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `Eroare ${r.status}`);
    return j;
  };
  const layersQ = () => `straturi=${['relatii', ...state.layers].join(',')}`;
  const pct = c => c == null ? '' : ` ${Math.round(c * 100)}%`;
  const STATUS = {confirmed: 'confirmată', inferred: 'dedusă', unverified: 'neverificată'};
  const showPanel = html => { panel.innerHTML = html; panel.hidden = !html; };
  const setCrumbs = parts => { crumbs.innerHTML = parts.map(([l, h]) => h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`).join('<span aria-hidden="true">›</span>'); };
  const selectTool = tool => $$('[data-tool]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tool === tool)));

  // „Drumul tău”: ultimele entități deschise (doar în acest browser).
  const trailKey = 'purapa-map-trail';
  const readTrail = () => { try { return JSON.parse(localStorage.getItem(trailKey) ?? '[]'); } catch { return []; } };
  function pushTrail(node) {
    const t = [{key: node.key, id: node.id, title: node.title}, ...readTrail().filter(x => !(x.key === node.key && x.id === node.id))].slice(0, 12);
    try { localStorage.setItem(trailKey, JSON.stringify(t)); } catch { /* fără stocare: doar nu ținem minte */ }
    renderTrail();
  }
  function renderTrail() {
    const t = readTrail(), box = $('#map-trail');
    box.hidden = !t.length;
    $('.trail', box).innerHTML = t.map(x => `<a href="#${x.key}:${x.id}">${esc(x.title)}</a>`).join('');
  }

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    parent?.appendChild(n);
    return n;
  }
  const text = (parent, x, y, s, attrs = {}) => { const t = el('text', {x, y, ...attrs}, parent); t.textContent = s; return t; };
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  // Nivelul 1: tipurile, în coloane pe categorii; legăturile mai groase unde sunt mai multe (grosime ∝ √n).
  async function overview() {
    selectTool('harta');
    setCrumbs([['Tipuri']]);
    const data = state.overview = await get(`/api/manage/graph/overview?${layersQ()}`);
    const BW = 180, BH = 48, GX = 120, GY = 18, TOP = 34;
    const pos = {};
    data.categories.forEach((c, ci) => {
      data.types.filter(t => t.category === c).forEach((t, i) => { pos[t.key] = {x: 16 + ci * (BW + GX), y: TOP + i * (BH + GY), t}; });
    });
    const W = 16 + data.categories.length * (BW + GX), H = TOP + Math.max(...Object.values(pos).map(p => p.y)) + BH + 24;
    const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Harta tipurilor și a legăturilor dintre ele'});
    data.categories.forEach((c, ci) => text(svg, 16 + ci * (BW + GX), 18, c, {class: 'g-cat'}));
    const edges = el('g', {}, svg);
    for (const r of data.relations) {
      const a = pos[r.source], b = pos[r.target];
      if (!a || !b) continue;
      const x1 = a.x + BW, y1 = a.y + BH / 2;
      let d;
      if (r.source === r.target) d = `M${x1} ${y1 - 8} C${x1 + 50} ${y1 - 40}, ${x1 + 50} ${y1 + 40}, ${x1} ${y1 + 8}`;
      else if (b.x > a.x) d = `M${x1} ${y1} C${x1 + GX / 2} ${y1}, ${b.x - GX / 2} ${b.y + BH / 2}, ${b.x} ${b.y + BH / 2}`;
      else if (b.x < a.x) d = `M${a.x} ${y1} C${a.x - GX / 2} ${y1}, ${b.x + BW + GX / 2} ${b.y + BH / 2}, ${b.x + BW} ${b.y + BH / 2}`;
      else d = `M${x1} ${y1} C${x1 + 70} ${y1}, ${x1 + 70} ${b.y + BH / 2}, ${x1} ${b.y + BH / 2}`;
      const p = el('path', {d, class: `g-edge ${r.layer}${r.possible ? ' possible' : ''}`, 'stroke-width': r.possible ? 1 : (1 + Math.sqrt(r.count) * 1.3).toFixed(1),
        'data-src': r.source, 'data-tgt': r.target, 'data-id': r.id}, edges);
      el('title', {}, p).textContent = `${a.t.label} ${r.verb} ${b.t.label}: ${r.count} legături${r.unconfirmed ? `, ${r.unconfirmed} de verificat` : ''}${r.broken ? `, ${r.broken} rupte` : ''}${r.possible ? ' (posibilă, nefolosită)' : ''}`;
      p.addEventListener('click', () => relationPanel(r));
    }
    for (const {x, y, t} of Object.values(pos)) {
      const g = el('g', {class: 'g-type', tabindex: 0, role: 'button', 'data-key': t.key, 'aria-label': `${t.label}: ${t.count}`}, svg);
      el('rect', {x, y, width: BW, height: BH, rx: 10}, g);
      el('rect', {x, y, width: 6, height: BH, rx: 3, fill: t.color, stroke: 'none'}, g);
      text(g, x + 16, y + 21, clip(t.label, 22));
      text(g, x + 16, y + 38, `${t.count} ${t.hub ? '' : '· componentă'}`, {class: 'n'});
      const hi = on => {
        svg.classList.toggle('dim', on);
        $$('.hi', svg).forEach(n => n.classList.remove('hi'));
        if (!on) return;
        g.classList.add('hi');
        $$(`.g-edge[data-src="${t.key}"], .g-edge[data-tgt="${t.key}"]`, svg).forEach(e => {
          e.classList.add('hi');
          $(`.g-type[data-key="${e.dataset.src === t.key ? e.dataset.tgt : e.dataset.src}"]`, svg)?.classList.add('hi');
        });
      };
      g.addEventListener('mouseenter', () => hi(true));
      g.addEventListener('mouseleave', () => hi(false));
      g.addEventListener('focus', () => hi(true));
      g.addEventListener('blur', () => hi(false));
      const open = () => { location.hash = `tip:${t.key}`; };
      g.addEventListener('click', open);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    canvas.replaceChildren(svg);
    showPanel(`<h2>Cum se citește</h2><p class="small">Fiecare dreptunghi e un tip, cu numărul de înregistrări. O linie mai groasă înseamnă mai multe legături.
      Liniile punctate sunt relații declarate, dar încă nefolosite. Treci cu mouse-ul peste un tip ca să-i vezi legăturile; dă clic ca să-i vezi membrii; dă clic pe o linie ca să vezi relația.</p>`);
  }

  async function relationPanel(r) {
    if (!r.id.includes('.') || r.id.includes('~')) {
      return showPanel(`<h2>${esc(r.source)} → ${esc(r.target)}</h2><p>${r.count} trimiteri din texte${r.broken ? `, <strong>${r.broken} rupte</strong>` : ''}.</p>`);
    }
    const x = await get(`/api/manage/graph/relation/${r.id}`);
    showPanel(`<h2>${esc(x.sourceLabel)} ${x.sensitive ? '🔒' : ''}<br><span class="muted">${esc(x.verb)}</span><br>${esc(x.targetLabel)}</h2>
      <dl><dt>Stocare</dt><dd><code>${esc(x.storage)}</code></dd><dt>Cardinalitate</dt><dd>${esc(x.cardinality)}${x.required ? ', obligatorie' : ''}</dd>
      <dt>Văzută invers</dt><dd>${esc(x.inverseLabel)}</dd><dt>Legături</dt><dd>${x.links} (${x.sources} surse → ${x.targets} ținte)</dd>
      <dt>De verificat</dt><dd>${x.unconfirmed}</dd><dt>Rupte</dt><dd>${x.broken}</dd><dt>Obligatorie goală</dt><dd>${x.requiredEmpty}</dd>
      <dt>Se editează din</dt><dd>${esc(x.editedFrom)}</dd><dt>La ștergere</dt><dd>${esc(x.onDelete)}</dd></dl>
      ${x.examples.length ? `<h3>Exemple</h3><ul class="plain small">${x.examples.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="muted">Nicio legătură încă.</p>'}`);
  }

  // Nivelul 2: membrii unui tip, cei mai conectați primii.
  async function members(key, q = '', page = 1) {
    selectTool('harta');
    const data = await get(`/api/manage/graph/members/${key}?q=${encodeURIComponent(q)}&pagina=${page}`);
    setCrumbs([['Tipuri', '#'], [data.label]]);
    canvas.innerHTML = `<div style="padding:12px"><input type="search" id="mf" placeholder="Filtrează ${esc(data.label.toLowerCase())}…" value="${esc(q)}" aria-label="Filtrează">
      <p class="muted small">${data.total} înregistrări, ordonate după numărul de legături.</p>
      <ul class="members">${data.items.map(m => `<li><button data-go="${key}:${m.id}"><span>${esc(m.title)}${m.status === 'published' ? '' : ` <span class="badge warn">${m.status === 'draft' ? 'ciornă' : 'arhivat'}</span>`}</span>
        <span class="muted">${m.degree}</span></button></li>`).join('')}</ul>
      ${data.pages > 1 ? `<p class="actions">${Array.from({length: data.pages}, (_, i) => `<button class="btn small${i + 1 === page ? '' : ' secondary'}" data-page="${i + 1}">${i + 1}</button>`).join('')}</p>` : ''}</div>`;
    let timer;
    $('#mf').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => members(key, e.target.value, 1).then(() => { const f = $('#mf'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }), 250); });
    canvas.onclick = e => {
      const go = e.target.closest('[data-go]'); if (go) location.hash = go.dataset.go;
      const pg = e.target.closest('[data-page]'); if (pg) members(key, $('#mf').value, Number(pg.dataset.page));
    };
    showPanel(`<p><a href="/manage/entitati/${key}/">Lista din Entități →</a></p>`);
  }

  // Nivelul 3: o entitate; intrările în stânga, ieșirile în dreapta; clic pe un vecin mută harta pe el.
  async function entity(key, id) {
    selectTool('harta');
    const data = await get(`/api/manage/graph/neighbors/${key}/${id}?${layersQ()}`);
    const n = data.node;
    setCrumbs([['Tipuri', '#'], [n.type, `#tip:${key}`], [n.title]]);
    pushTrail(n);
    const keep = it => state.statuses.has(it.status);
    const left = data.incoming.flatMap(g => g.items.filter(keep));
    const right = data.outgoing.flatMap(g => g.items.filter(keep));
    const ROW = 30, W = 900, CX = W / 2, LX = 190, RX = W - 190;
    const H = Math.max(240, (Math.max(left.length, right.length) + 1) * ROW + 40);
    const CY = H / 2;
    const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Legăturile entității ${n.title}`});
    text(svg, LX, 18, `Trimit spre ea (${left.length})`, {class: 'g-cat', 'text-anchor': 'end'});
    text(svg, RX, 18, `Trimite spre (${right.length})`, {class: 'g-cat'});
    const draw = (list, side) => list.forEach((it, i) => {
      const y = 44 + i * ROW + (H - 44 - list.length * ROW) / 2;
      const x = side === 'left' ? LX : RX;
      const path = el('path', {d: `M${side === 'left' ? x + 8 : x - 8} ${y} C${(x + CX) / 2} ${y}, ${(x + CX) / 2} ${CY}, ${side === 'left' ? CX - 14 : CX + 14} ${CY}`,
        class: `g-link ${it.status}`}, svg);
      el('title', {}, path).textContent = `${it.rel} · ${STATUS[it.status] ?? it.status}${pct(it.confidence)}${it.note ? ` · ${it.note}` : ''}${it.created_by ? ` · de ${it.created_by}` : ''}`;
      if (it.status !== 'confirmed') el('circle', {cx: (x + CX) / 2, cy: (y + CY) / 2, r: 4, class: 'dot-bad'}, svg);
      const g = el('g', {class: 'g-node', tabindex: 0, role: 'button', 'aria-label': `${it.type}: ${it.title}`}, svg);
      el('circle', {cx: x, cy: y, r: 7, fill: it.color}, g);
      const anchor = side === 'left' ? 'end' : 'start', dx = side === 'left' ? -12 : 12;
      text(g, x + dx, y + 4, `${it.sensitive ? '🔒 ' : ''}${clip(it.title, 30)}`, {'text-anchor': anchor});
      text(g, x + dx, y + 17, `${it.type} · ${it.rel}${it.broken ? ' · rupt' : ''}`, {'text-anchor': anchor, class: 'sub'});
      const go = () => { location.hash = `${it.key}:${it.id}`; };
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
    draw(left, 'left');
    draw(right, 'right');
    const c = el('g', {class: 'g-center'}, svg);
    el('circle', {cx: CX, cy: CY, r: 14, fill: n.color}, c);
    text(c, CX, CY - 22, clip(n.title, 46), {'text-anchor': 'middle'});
    canvas.replaceChildren(svg);
    const unverified = [...left, ...right].filter(i => i.status !== 'confirmed');
    showPanel(`<p class="kicker" style="--c:${n.color}">${esc(n.type)}</p><h2>${esc(n.title)}</h2>
      <p class="actions"><a class="btn small" href="/manage/entitati/${key}/${id}/">Deschide</a><a class="btn small secondary" href="/manage/entitati/${key}/${id}/relatii/">Relații</a>
      <a class="btn small secondary" href="/manage/entitati/${key}/${id}/unde-apare/">Unde apare</a><a class="btn small secondary" href="/manage/entitati/${key}/${id}/surse/">Surse</a></p>
      ${unverified.length ? `<p><span class="badge warn">${unverified.length} de verificat</span> <a href="/manage/surse/legaturi/">Legături de verificat →</a></p>` : ''}
      <h3>Pagini care o afișează (${data.pages.length})</h3>
      ${data.pages.length ? `<ul class="plain small">${data.pages.map(p => `<li><a href="${esc(p.path)}" target="_blank" rel="noopener"><code>${esc(p.path)}</code></a>
        <ul>${p.uses.map(u => `<li>${esc(u.label)}</li>`).join('')}</ul></li>`).join('')}</ul>` : '<p class="muted small">Nu apare în nicio pagină publică.</p>'}`);
  }

  // Traseul cel mai scurt între două entități.
  function pathTool() {
    selectTool('traseu');
    setCrumbs([['Tipuri', '#'], ['Traseu']]);
    canvas.innerHTML = `<div style="padding:12px"><p class="muted">Cel mai scurt drum între două entități, prin legăturile confirmate (cel mult 6 pași, fără imagini ca intermediar).</p>
      <div class="form wide"><label>De la <span class="map-search"><input type="search" data-pick="de" autocomplete="off"><div class="results" hidden></div></span></label>
      <label>La <span class="map-search"><input type="search" data-pick="la" autocomplete="off"><div class="results" hidden></div></span></label></div>
      <div id="path-out" style="margin-top:16px"></div></div>`;
    const picked = {};
    $$('[data-pick]', canvas).forEach(input => attachSearch(input, input.nextElementSibling, r => {
      input.value = r.title;
      picked[input.dataset.pick] = `${r.key}:${r.id}`;
      if (picked.de && picked.la) showPath(picked.de, picked.la);
    }));
    showPanel('');
  }
  async function showPath(a, b) {
    const {steps} = await get(`/api/manage/graph/path?de=${a}&la=${b}`);
    $('#path-out').innerHTML = steps ? `<p>${steps.length - 1} ${steps.length === 2 ? 'pas' : 'pași'}:</p><div class="path">${steps.map((s, i) =>
      `${i ? `<span class="via">→ ${esc(s.via)} →</span>` : ''}<a class="step" href="#${s.key}:${s.id}"><span class="swatch" style="background:${s.color}"></span> ${esc(s.title)} <span class="muted small">${esc(s.type)}</span></a>`).join('')}</div>`
      : '<p class="empty">Nu există drum în cel mult 6 pași.</p>';
  }

  async function healthTool() {
    selectTool('sanatate');
    setCrumbs([['Tipuri', '#'], ['Sănătatea hărții']]);
    const h = await get('/api/manage/graph/health');
    const block = (title, list, fmt) => `<section class="panel"><h2>${esc(title)} <span class="badge ${list.length ? 'warn' : 'ok'}">${list.length}</span></h2>
      ${list.length ? `<ul class="plain">${list.map(fmt).join('')}</ul>` : '<p class="muted">Nimic.</p>'}</section>`;
    const link = (key, id, title) => `<a href="/manage/entitati/${key}/${id}/">${esc(title)}</a>`;
    canvas.innerHTML = `<div style="padding:12px">
      ${block('Trimiteri rupte', h.broken, b => `<li>${link(b.from.key, b.from.id, b.from.title)} → <code>${esc(b.to)}</code> <span class="muted small">${esc(b.rel)}</span></li>`)}
      ${block('Relații obligatorii goale', h.requiredEmpty, r => `<li>${link(r.key, r.id, r.title)}: „${esc(r.label)}”</li>`)}
      ${block('Tipuri izolate', h.isolatedTypes, t => `<li><a href="#tip:${t.key}">${esc(t.label)}</a></li>`)}
      ${block('Relații declarate, dar nefolosite', h.unusedRelations, r => `<li>${esc(r.label)} <code class="muted">${esc(r.id)}</code></li>`)}
      ${block('Înregistrări orfane', h.orphans, o => `<li>${link(o.key, o.id, o.title)} <span class="muted small">${esc(o.type)}</span></li>`)}</div>`;
    showPanel('');
  }

  async function allTool() {
    selectTool('toate');
    setCrumbs([['Tipuri', '#'], ['Toate legăturile']]);
    const rows = await get('/api/manage/graph/edges');
    const groups = [...new Set(rows.map(r => r.group))];
    canvas.innerHTML = `<div style="padding:12px"><div class="actions"><input type="search" id="ef" placeholder="Caută o relație…" style="max-width:300px" aria-label="Caută o relație">
      <select id="eg" style="width:auto" aria-label="Grup"><option value="">Toate grupurile</option>${groups.map(g => `<option>${esc(g)}</option>`).join('')}</select></div>
      <table class="table" id="et"><thead><tr><th>De la</th><th>Relația</th><th>La</th><th>Tip</th><th>Legături</th><th>De verificat</th><th>Rupte</th></tr></thead><tbody>
      ${rows.map(r => `<tr data-group="${esc(r.group)}"><td>${esc(r.source)}</td><td>${r.sensitive ? '🔒 ' : ''}${esc(r.verb)}</td><td>${esc(r.target)}</td><td>${esc(r.cardinality)}</td>
        <td>${r.count || '<span class="muted">0</span>'}</td><td>${r.unconfirmed ? `<span class="badge warn">${r.unconfirmed}</span>` : '—'}</td>
        <td>${r.broken ? `<span class="badge bad">${r.broken}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    const apply = () => {
      const q = $('#ef').value.toLowerCase(), g = $('#eg').value;
      $$('#et tbody tr').forEach(tr => { tr.hidden = (q && !tr.textContent.toLowerCase().includes(q)) || (g && tr.dataset.group !== g); });
    };
    $('#ef').addEventListener('input', apply);
    $('#eg').addEventListener('change', apply);
    showPanel('');
  }

  // Căutare cu rezultate sub câmp; folosită sus și în Traseu.
  function attachSearch(input, box, onPick) {
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (q.length < 2) { box.hidden = true; return; }
        const res = await get(`/api/manage/graph/search?q=${encodeURIComponent(q)}`);
        box.innerHTML = res.length ? res.map((r, i) => `<button type="button" data-i="${i}"><span class="swatch" style="background:${r.color}"></span><span>${esc(r.title)} <span class="muted small">${esc(r.type)}</span></span></button>`).join('')
          : '<p class="muted small" style="padding:8px 10px;margin:0">Nimic găsit.</p>';
        box.hidden = false;
        box.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { box.hidden = true; onPick(res[Number(b.dataset.i)]); } };
      }, 200);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') box.hidden = true; });
    document.addEventListener('click', e => { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
  }
  attachSearch($('#map-q'), $('#map-results'), r => { $('#map-q').value = ''; location.hash = `${r.key}:${r.id}`; });
  $('.map-search').addEventListener('submit', e => e.preventDefault());

  async function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    try {
      if (!h) await overview();
      else if (h === 'traseu') pathTool();
      else if (h === 'sanatate') await healthTool();
      else if (h === 'toate') await allTool();
      else if (h.startsWith('tip:')) await members(h.slice(4));
      else if (/^[a-z-]+:\d+$/.test(h)) { const [k, id] = h.split(':'); await entity(k, Number(id)); }
      else await overview();
    } catch (e) {
      canvas.innerHTML = `<p class="flash bad" style="margin:12px">${esc(e.message)}</p>`;
    }
  }

  $$('[data-tool]').forEach(b => b.addEventListener('click', () => {
    location.hash = b.dataset.tool === 'harta' ? '' : b.dataset.tool;
    if (b.dataset.tool === 'harta') route();
  }));
  $$('[data-layer]').forEach(c => c.addEventListener('change', () => { c.checked ? state.layers.add(c.dataset.layer) : state.layers.delete(c.dataset.layer); route(); }));
  $$('[data-status]').forEach(c => c.addEventListener('change', () => { c.checked ? state.statuses.add(c.dataset.status) : state.statuses.delete(c.dataset.status); route(); }));
  window.addEventListener('hashchange', route);
  renderTrail();
  route();
})();
