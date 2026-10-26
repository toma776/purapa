// Comportamentul paginilor /manage: formulare, acțiuni, filtre, editorul de legături, confirmarea în masă.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

  function flash(html, cls = 'ok') {
    const el = $('#flash');
    if (!el) return alert(html.replace(/<[^>]+>/g, ''));
    el.className = `flash ${cls}`;
    el.innerHTML = html;
    el.hidden = false;
    el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }

  async function api(method, url, body) {
    const res = await fetch(url, {method, headers: {'content-type': 'application/json', accept: 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin'});
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.includes('/auth/')) { location.href = `/manage/login/?next=${encodeURIComponent(location.pathname)}`; throw new Error('Autentificare necesară'); }
    if (!res.ok) throw Object.assign(new Error(data.error ?? `Eroare ${res.status}`), {status: res.status, data});
    return data;
  }
  window.manageApi = api;
  window.manageFlash = flash;

  function errorMessage(e) {
    if (e.status === 409 && e.data?.current) return 'Altcineva a salvat între timp. <a href="">Reîncarcă pagina</a> ca să vezi versiunea curentă.';
    if (e.status === 409 && e.data?.usedBy) return `${esc(e.message)}:<ul>${e.data.usedBy.slice(0, 12).map(u =>
      `<li><a href="/manage/entitati/${esc(u.entity)}/${u.id}/">${esc(u.entity)} #${u.id}</a> (${esc(u.rel ?? u.field)})</li>`).join('')}</ul>`;
    if (e.data?.errors) return `${esc(e.message)}: ${Object.entries(e.data.errors).map(([k, v]) => `${esc(k)} — ${esc(v)}`).join('; ')}`;
    return esc(e.message);
  }

  const observationsHtml = obs => obs?.length ? `<ul>${obs.map(o => `<li><a href="${esc(o.href)}">${esc(o.text)}</a> (${esc(o.impact)})</li>`).join('')}</ul>` : '';

  function valueOf(el) {
    const t = el.dataset.type;
    if (el.type === 'checkbox') return el.checked;
    const v = el.value;
    if (['int', 'number', 'money', 'ref', 'image'].includes(t)) return v === '' ? null : Number(v);
    if (['table', 'list', 'links', 'multiselect', 'texts'].includes(t)) {
      if (!v.trim()) return null;
      try { return JSON.parse(v); } catch { throw Object.assign(new Error(`„${el.name}” nu e JSON valid`), {field: el.name}); }
    }
    return v;
  }

  // Formularele cu data-api: entitățile primesc {data, publish, version}; restul, câmpurile direct.
  document.addEventListener('submit', async ev => {
    const form = ev.target.closest('form[data-api]');
    if (!form) return;
    ev.preventDefault();
    const [method, url] = form.dataset.api.split(' ');
    const submitter = ev.submitter;
    const fields = {}, meta = {};
    $$('[data-error]', form).forEach(e => { e.textContent = ''; });
    try {
      for (const el of form.elements) {
        if (!el.name || el.disabled || el.type === 'submit' || el.tagName === 'BUTTON') continue;
        (el.hasAttribute('data-meta') ? meta : fields)[el.name] = el.hasAttribute('data-meta') ? Number(el.value) : valueOf(el);
      }
    } catch (e) { $(`[data-error="${e.field}"]`, form)?.append(e.message); return flash(esc(e.message), 'bad'); }
    const isEntity = url.includes('/entities/');
    const body = isEntity ? {data: fields, publish: submitter?.value === '1', version: meta.version ?? null} : fields;
    const buttons = $$('button', form);
    buttons.forEach(b => { b.disabled = true; });
    try {
      const res = await api(method, url, body);
      if (form.dataset.next) return void (location.href = form.dataset.next);
      if (form.dataset.nextFrom && res.record) return void (location.href = form.dataset.nextFrom.replace('{id}', res.record.id));
      const draft = res.record?.draft && !body.publish;
      flash(`${draft ? 'Ciorna e salvată. Site-ul nu s-a schimbat.' : 'Salvat.'}${res.observations?.length ? ` Observații:${observationsHtml(res.observations)}` : ''}`, res.observations?.length ? 'warn' : 'ok');
      if (form.dataset.reload !== undefined) setTimeout(() => location.reload(), res.observations?.length ? 1800 : 700);
    } catch (e) {
      for (const [k, v] of Object.entries(e.data?.errors ?? {})) $(`[data-error="${k}"]`, form)?.append(v);
      flash(errorMessage(e), 'bad');
    } finally {
      buttons.forEach(b => { b.disabled = false; });
    }
  });

  // Schimbarea unui select într-un formular data-auto îl trimite imediat (de exemplu rolul unui cont).
  document.addEventListener('change', ev => {
    const form = ev.target.closest('form[data-auto]');
    if (form) form.requestSubmit();
  });

  // Butoanele data-action="METODĂ url", cu confirmare și corp JSON opțional.
  document.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    ev.preventDefault();
    if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
    const [method, url] = btn.dataset.action.split(' ');
    btn.disabled = true;
    try {
      const res = await api(method, url, btn.dataset.body ? JSON.parse(btn.dataset.body) : {});
      if (btn.dataset.next) return void (location.href = btn.dataset.next);
      if (res?.status === 'failed') flash(`Propagarea a eșuat din nou: ${esc(res.last_error)}`, 'bad');
      location.reload();
    } catch (e) {
      flash(errorMessage(e), 'bad');
      btn.disabled = false;
    }
  });

  // Filtrarea rândurilor unui tabel.
  document.addEventListener('input', ev => {
    const input = ev.target.closest('[data-filter]');
    if (!input) return;
    const q = input.value.trim().toLowerCase();
    $$(`${input.dataset.filter} tbody tr`).forEach(tr => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); });
  });

  // „Editează” deschide direct câmpul (?camp=).
  const camp = new URLSearchParams(location.search).get('camp');
  if (camp) {
    const field = $(`[data-field="${CSS.escape(camp)}"]`);
    if (field) { field.classList.add('highlight'); field.scrollIntoView({block: 'center'}); $('input, textarea, select', field)?.focus(); }
  }

  // Editorul de legături: aceeași listă din ambele capete (§2.2).
  const STATUS = {confirmed: ['Confirmată', 'ok'], inferred: ['Dedusă', 'warn'], unverified: ['Neverificată', 'bad']};
  const optionsCache = {};
  const loadOptions = key => optionsCache[key] ??= api('GET', `/api/manage/options/${key}`);

  function relEditor(root) {
    const mode = root.dataset.mode, url = root.dataset.url, target = root.dataset.target;
    const ordered = root.dataset.ordered === '1', editable = root.dataset.editable === '1', max = Number(root.dataset.max) || 0;
    let items = JSON.parse(root.dataset.items);
    const titles = JSON.parse(root.dataset.titles);

    async function save(next, message) {
      root.classList.add('busy');
      try {
        if (mode === 'links') {
          const res = await api('PUT', url, {items: next.map(i => ({id: i.id}))});
          items = res.links.map(l => ({id: l.id, status: l.status, confidence: l.confidence, note: l.note}));
          flash(`${message} ${res.live ? 'Schimbarea e live pe site.' : 'Apare pe site după publicare.'}`);
        } else {
          const ids = await api('PUT', url, {ids: next.map(i => i.id)});
          items = ids.map(id => items.find(i => i.id === id) ?? {id, status: 'confirmed'});
          flash(message);
        }
        render();
      } catch (e) { flash(errorMessage(e), 'bad'); }
      finally { root.classList.remove('busy'); }
    }

    async function setStatus(id, status) {
      try {
        const links = await api('PUT', `${root.dataset.statusUrl}/${id}/status`, {status});
        items = links.map(l => ({id: l.id, status: l.status, confidence: l.confidence, note: l.note}));
        flash('Legătura e confirmată și apare pe site.');
        render();
      } catch (e) { flash(errorMessage(e), 'bad'); }
    }

    function render() {
      const list = items.map((it, i) => {
        const [label, cls] = STATUS[it.status] ?? STATUS.confirmed;
        return `<li data-id="${it.id}"><span class="t"><a href="/manage/entitati/${target}/${it.id}/">${esc(titles[it.id] ?? `#${it.id}`)}</a>
          ${it.status && it.status !== 'confirmed' ? `<span class="badge ${cls}">${label}${it.confidence != null ? ` ${Math.round(it.confidence * 100)}%` : ''}</span>` : ''}
          ${it.note ? `<span class="muted small">${esc(it.note)}</span>` : ''}</span>
          ${editable ? `${ordered ? `<button data-up ${i === 0 ? 'disabled' : ''} aria-label="Mută în sus">↑</button><button data-down ${i === items.length - 1 ? 'disabled' : ''} aria-label="Mută în jos">↓</button>` : ''}
          ${mode === 'links' && it.status && it.status !== 'confirmed' ? '<button data-confirm-link>Confirmă</button>' : ''}
          <button data-remove aria-label="Scoate">✕</button>` : ''}</li>`;
      }).join('');
      root.innerHTML = `${items.length ? `<ul class="rel-list">${list}</ul>` : '<p class="empty">Nicio legătură.</p>'}
        ${editable && (!max || items.length < max) ? `<div class="rel-add"><select aria-label="Alege ce adaugi"><option value="">Alege…</option></select><button class="btn small" data-add>Adaugă</button></div>` : ''}`;
      const select = $('select', root);
      if (select) loadOptions(target).then(opts => {
        select.innerHTML = '<option value="">Alege…</option>' + opts.filter(o => !items.some(i => i.id === o.id))
          .map(o => `<option value="${o.id}">${esc(o.title)}${o.status === 'published' ? '' : ' (nepublicat)'}</option>`).join('');
        for (const o of opts) titles[o.id] ??= o.title;
      });
    }

    root.addEventListener('click', ev => {
      const li = ev.target.closest('li[data-id]');
      const id = li && Number(li.dataset.id);
      const idx = items.findIndex(i => i.id === id);
      if (ev.target.closest('[data-remove]')) save(items.filter(i => i.id !== id), 'Legătura e scoasă.');
      else if (ev.target.closest('[data-up]')) { const next = [...items]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; save(next, 'Ordinea e salvată.'); }
      else if (ev.target.closest('[data-down]')) { const next = [...items]; [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; save(next, 'Ordinea e salvată.'); }
      else if (ev.target.closest('[data-confirm-link]')) setStatus(id, 'confirmed');
      else if (ev.target.closest('[data-add]')) {
        const v = Number($('select', root).value);
        if (v) save([...items, {id: v, status: 'confirmed'}], 'Legătura e adăugată.');
      }
    });
    render();
  }
  $$('.rel-editor').forEach(relEditor);

  // „Legături de verificat”: confirmarea sau scoaterea în masă.
  for (const section of $$('.inferred')) {
    $('[data-check-all]', section)?.addEventListener('change', ev => $$('[data-pair]', section).forEach(c => { c.checked = ev.target.checked; }));
    section.addEventListener('click', async ev => {
      const btn = ev.target.closest('[data-bulk]');
      if (!btn) return;
      const pairs = $$('[data-pair]:checked', section).map(c => c.dataset.pair.split(',').map(Number));
      if (!pairs.length) return flash('Selectează cel puțin o legătură.', 'warn');
      const action = btn.dataset.bulk;
      if (!confirm(`${action === 'confirm' ? 'Confirm' : 'Scot'} ${pairs.length} ${pairs.length === 1 ? 'legătură' : 'legături'}?`)) return;
      try {
        const res = await api('POST', `/api/manage/inferred/${section.dataset.relation}`, {action, pairs});
        flash(`${res.changed} ${action === 'confirm' ? 'confirmate' : 'scoase'}. Paginile afectate se refac.`);
        setTimeout(() => location.reload(), 700);
      } catch (e) { flash(errorMessage(e), 'bad'); }
    });
  }
})();
