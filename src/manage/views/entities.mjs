// Entitățile: lista pe tipuri, lista unui tip și pagina unei înregistrări cu taburile ei.
// Totul derivă din registru (§0.9): formularele, relațiile, „Unde apare”.
import {page, esc, badge, impact, fmtDate, json, empty} from './ui.mjs';
import {can} from '../../core/store.mjs';
import {ENTITIES, byKey, titleOf, publicPath, relFields, RELATION_TYPES, JSON_TYPES} from '../../registry/entities.mjs';

const CATEGORY = {firma: 'Firmă', catalog: 'Catalog', tehnologie: 'Tehnologie', continut: 'Conținut', site: 'Site', media: 'Media', operational: 'Date de lucru'};
const TABS = [['prezentare', 'Prezentare'], ['detalii', 'Detalii'], ['relatii', 'Relații'], ['surse', 'Surse'], ['unde-apare', 'Unde apare'], ['istoric', 'Istoric']];
const base = (key, id) => `/manage/entitati/${key}/${id}/`;
const publishPerm = d => d.approval ? 'content.approve' : 'content.publish';

export function entitiesIndex(ctx) {
  const {user} = ctx;
  const cats = [...new Set(ENTITIES.map(d => d.category))];
  const body = `<h1>Entități</h1>${cats.map(c => {
    const ds = ENTITIES.filter(d => d.category === c);
    return `<section class="panel"><h2>${esc(CATEGORY[c] ?? c)}</h2><div class="cards">${ds.map(d => {
      const n = ctx.store.list(d.key).length;
      return `<a class="card-link" href="/manage/entitati/${d.key}/" style="--c:${d.color}"><strong>${esc(d.label)}</strong><span>${n}</span>
        ${d.hub === false ? '<small>se editează din entitatea-mamă</small>' : d.approval ? '<small>publicarea cere aprobare</small>' : d.operational ? '<small>date de lucru</small>' : ''}</a>`;
    }).join('')}</div></section>`;
  }).join('')}`;
  return page(user, {title: 'Entități', active: 'entitati', crumbs: [['Entități']], body, counts: ctx.counts});
}

export async function entityList(ctx, key) {
  const {store, api, user} = ctx;
  const d = store.def(key);
  const cols = d.fields.filter(f => f.list && f.key !== d.title);
  const rows = store.list(key);
  const appears = await api.appearsInAll(key);
  const fmt = (f, v) => v == null ? '' : f.type === 'money' ? `${new Intl.NumberFormat('ro-RO').format(v)} lei` : esc(String(v));
  const body = `<div class="head"><h1>${esc(d.label)} <span class="muted">${rows.length}</span></h1>
  ${d.creatable !== false && can(user, 'content.write') ? `<a class="btn" href="/manage/entitati/${key}/nou/">Adaugă ${esc(d.one.toLowerCase())}</a>` : ''}</div>
<section class="panel">
<input class="filter" type="search" placeholder="Caută în listă…" data-filter="#rows">
<table class="table" id="rows"><thead><tr><th>${esc(byKey[key].fields.find(f => f.key === d.title)?.label ?? 'Titlu')}</th>${cols.map(f => `<th>${esc(f.label)}</th>`).join('')}
${d.noStatus ? '' : '<th>Stare</th>'}<th title="Pagini publice care o afișează">Apare în</th><th>Actualizat</th></tr></thead><tbody>
${rows.map(r => `<tr><td><a href="${base(key, r.id)}">${esc(titleOf(d, r))}</a>${r.draft ? ' <span class="badge warn" title="Are modificări nepublicate">ciornă</span>' : ''}</td>
  ${cols.map(f => `<td>${fmt(f, r[f.key])}</td>`).join('')}${d.noStatus ? '' : `<td>${badge(r.status)}</td>`}
  <td>${appears(r.id) || '<span class="muted">—</span>'}</td><td class="nowrap">${fmtDate(r.updated_at)}</td></tr>`).join('')}
</tbody></table>${rows.length ? '' : empty(`Nu există încă ${d.label.toLowerCase()}.`)}</section>`;
  return page(user, {title: d.label, active: 'entitati', crumbs: [['Entități', '/manage/entitati/'], [d.label]], body, counts: ctx.counts});
}

function input(f, value, {store, disabled}) {
  const id = `f-${f.key}`;
  const dis = disabled || f.readonly ? ' disabled' : '';
  const req = f.required ? ' required' : '';
  const v = value ?? '';
  const common = `id="${id}" name="${f.key}" data-type="${f.type}"${dis}${req}`;
  switch (f.type) {
    case 'textarea': return `<textarea ${common} rows="3">${esc(v)}</textarea>`;
    case 'richtext': return `<textarea ${common} rows="8" class="code">${esc(v)}</textarea>
      <small class="hint">Text bogat: &lt;p&gt;, &lt;h2&gt;, &lt;ul&gt;, &lt;a data-ref="tip:id"&gt;, jetoane ca {telefon}. Restul se curăță la salvare.</small>`;
    case 'int': return `<input ${common} type="number" step="1" value="${esc(v)}">`;
    case 'number': return `<input ${common} type="number" step="any" value="${esc(v)}">`;
    case 'money': return `<input ${common} type="number" step="0.01" min="0" value="${esc(v)}">`;
    case 'boolean': return `<input ${common} type="checkbox"${value ? ' checked' : ''}>`;
    case 'email': return `<input ${common} type="email" value="${esc(v)}">`;
    case 'url': return `<input ${common} type="text" inputmode="url" value="${esc(v)}">`;
    case 'phone': return `<input ${common} type="tel" value="${esc(v)}">`;
    case 'select': return `<select ${common}><option value="">—</option>${(f.options ?? []).map(o => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    case 'ref': case 'image': {
      const target = f.type === 'image' ? 'media' : f.target;
      const td = byKey[target];
      return `<select ${common}><option value="">—</option>${store.list(target).map(r =>
        `<option value="${r.id}"${r.id === value ? ' selected' : ''}>${esc(titleOf(td, r))}${td.noStatus || r.status === 'published' ? '' : ' (nepublicat)'}</option>`).join('')}</select>`;
    }
    default:
      if (JSON_TYPES.has(f.type)) return `<textarea ${common} rows="4" class="code">${esc(value == null ? '' : JSON.stringify(value, null, 2))}</textarea><small class="hint">JSON</small>`;
      return `<input ${common} type="text" value="${esc(v)}"${f.max ? ` maxlength="${f.max}"` : ''}>`;
  }
}

function fieldsForm(ctx, d, values, {disabled}) {
  return d.fields.filter(f => f.type !== 'refs').map(f => `<div class="field${f.intern ? ' intern' : ''}" data-field="${f.key}">
    <label for="f-${f.key}">${esc(f.label)}${f.required ? ' <span class="req" aria-label="obligatoriu">*</span>' : ''}</label>
    ${input(f, values[f.key], {store: ctx.store, disabled})}<div class="error" data-error="${f.key}"></div></div>`).join('');
}

export function entityNew(ctx, key) {
  const {store, user} = ctx;
  const d = store.def(key);
  const canPublish = !d.noStatus && can(user, publishPerm(d));
  const body = `<h1>${esc(d.one)} nou${/ă$|e$/.test(d.one) ? 'ă' : ''}</h1>
<form class="panel form wide" data-api="POST /api/manage/entities/${key}" data-next-from="/manage/entitati/${key}/{id}/">
${fieldsForm(ctx, d, {}, {disabled: !can(user, 'content.write')})}
<div class="actions"><button class="btn" name="publish" value="0">${d.noStatus ? 'Salvează' : 'Salvează ca ciornă'}</button>
${canPublish ? '<button class="btn secondary" name="publish" value="1">Salvează și publică</button>' : ''}</div>
<p class="muted small">Relațiile se adaugă după salvare, din tab-ul Relații.</p></form>`;
  return page(user, {title: `${d.one} nou`, active: 'entitati', crumbs: [['Entități', '/manage/entitati/'], [d.label, `/manage/entitati/${key}/`], ['Nou']], body, counts: ctx.counts});
}

// Mini-harta radială: vecinii direcți în jurul entității, cu linia după starea legăturii.
function miniMap(n) {
  const items = [...n.incoming.flatMap(g => g.items.map(i => ({...i, dir: 'in'}))), ...n.outgoing.flatMap(g => g.items.map(i => ({...i, dir: 'out'})))].slice(0, 18);
  if (!items.length) return '<p class="muted">Nicio legătură încă.</p>';
  const W = 520, H = 300, cx = W / 2, cy = H / 2, R = 115;
  const dash = s => s === 'inferred' ? ' stroke-dasharray="6 4"' : s === 'unverified' ? ' stroke-dasharray="2 4"' : '';
  const nodes = items.map((it, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / items.length;
    const x = cx + Math.cos(a) * R * 1.7, y = cy + Math.sin(a) * R;
    const label = it.title.length > 26 ? it.title.slice(0, 25) + '…' : it.title;
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
    const dx = anchor === 'start' ? 9 : anchor === 'end' ? -9 : 0, dy = anchor === 'middle' ? (Math.sin(a) > 0 ? 18 : -10) : 4;
    return `<a href="/manage/entitati/${it.key}/${it.id}/"><title>${esc(`${it.type}: ${it.title} — ${it.rel}`)}</title>
      <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="edge ${it.status}"${dash(it.status)}/>
      ${it.status !== 'confirmed' ? `<circle cx="${(cx + x) / 2}" cy="${(cy + y) / 2}" r="4" class="dot-bad"/>` : ''}
      <circle cx="${x}" cy="${y}" r="6" fill="${it.color}"/><text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${esc(label)}</text></a>`;
  }).join('');
  return `<svg class="minimap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mini-harta legăturilor">${nodes}
    <circle cx="${cx}" cy="${cy}" r="10" fill="${n.node.color}"/><text x="${cx}" y="${cy - 16}" text-anchor="middle" class="center">${esc(n.node.title.slice(0, 40))}</text></svg>`;
}

async function tabPrezentare(ctx, d, rec, id) {
  const {graph, todos, api} = ctx;
  const obs = todos.forEntity(d.key, id);
  const w = await api.whereUsed(d.key, id);
  const changed = rec.draft ? Object.keys(rec.draft).filter(k => JSON.stringify(rec.draft[k]) !== JSON.stringify(rec[k])) : [];
  const n = await graph.neighbors(d.key, id);
  return `${rec.draft && changed.length ? `<div class="flash warn">Modificări nepublicate în ${changed.length} câmpuri: ${changed.map(k => esc(d.fields.find(f => f.key === k)?.label ?? k)).join(', ')}.
    Site-ul arată încă versiunea publicată.</div>` : ''}
<div class="cols">
<section class="panel"><h2>Impact</h2>
  <p class="big">Apare în <strong>${w.appearsIn}</strong> ${w.appearsIn === 1 ? 'pagină' : 'pagini'}</p>
  ${w.pendingPublish.length ? `<p>Legat deja de ${new Set(w.pendingPublish.map(p => p.path)).size} pagini: apare după publicare.</p>` : ''}
  <p><a href="${base(d.key, id)}unde-apare/">Vezi unde apare →</a></p>
  <h3>Observații</h3>${obs.length ? `<ul class="todo">${obs.map(o => `<li>${impact(o.impact)} <a href="${esc(o.href)}">${esc(o.text)}</a></li>`).join('')}</ul>` : '<p class="muted">Nicio observație.</p>'}
</section>
<section class="panel"><h2>Legături</h2>${miniMap(n)}<p><a href="/manage/harta/#${d.key}:${id}">Deschide pe hartă →</a></p></section>
</div>`;
}

function tabDetalii(ctx, d, rec, id) {
  const {user} = ctx;
  const values = rec.draft ? {...rec, ...rec.draft} : rec;
  const canWrite = can(user, 'content.write');
  const canPublish = !d.noStatus && can(user, publishPerm(d));
  const live = d.noStatus || rec.status !== 'published';
  return `<form class="panel form wide" data-api="PUT /api/manage/entities/${d.key}/${id}" data-reload>
<input type="hidden" name="version" value="${rec.version}" data-meta>
${fieldsForm(ctx, d, values, {disabled: !canWrite})}
${canWrite ? `<div class="actions sticky">
  <button class="btn" name="publish" value="0">${d.noStatus ? 'Salvează' : rec.status === 'published' ? 'Salvează ciorna' : 'Salvează'}</button>
  ${canPublish ? `<button class="btn secondary" name="publish" value="1">${rec.status === 'published' ? 'Salvează și publică' : 'Salvează și publică'}</button>` : ''}
  <span class="muted small">${d.noStatus ? 'Modificarea apare pe site imediat după salvare.' : rec.status === 'published' ? 'Ciorna nu schimbă site-ul până la publicare.' : live ? 'Înregistrarea nu e publicată.' : ''}
  ${d.approval && !canPublish ? 'Publicarea cere aprobarea unui administrator.' : ''}</span>
</div>` : '<p class="muted">Ai drept doar de citire.</p>'}
</form>`;
}

function tabRelatii(ctx, d, rec, id) {
  const {store, user} = ctx;
  const canWrite = can(user, 'content.write'), canApprove = can(user, 'content.approve');
  const live = d.noStatus || rec.status === 'published';
  const titleMap = (key, ids) => Object.fromEntries(ids.map(i => [i, titleOf(byKey[key], store.get(key, i))]));
  const out = relFields(d).map(f => {
    const items = store.links(d.key, id, f.key);
    const editable = canWrite && (!f.sensitive || canApprove);
    return `<section class="panel"><h2>${esc(f.label)} ${f.sensitive ? '<span class="lock" title="Relație sensibilă: schimbarea cere aprobare">🔒</span>' : ''}
      <span class="muted small">${esc(f.rel ?? '')} → ${esc(byKey[f.target].label)}</span></h2>
      <div class="rel-editor" data-mode="links" data-url="/api/manage/entities/${d.key}/${id}/links/${f.key}" data-status-url="/api/manage/entities/${d.key}/${id}/links/${f.key}"
        data-target="${f.target}" data-ordered="${f.ordered ? 1 : 0}" data-editable="${editable ? 1 : 0}" data-max="${f.max ?? ''}"
        data-items="${json(items.map(l => ({id: l.id, status: l.status, confidence: l.confidence, note: l.note})))}"
        data-titles="${json(titleMap(f.target, items.map(l => l.id)))}"></div>
      ${f.sensitive && !canApprove ? '<p class="muted small">Doar cine are dreptul de aprobare poate schimba această relație.</p>' : ''}
    </section>`;
  });
  const incoming = RELATION_TYPES.filter(r => r.target === d.key && !byKey[r.source].operational).map(r => {
    const sd = byKey[r.source], f = sd.fields.find(x => x.key === r.field);
    const users = store.inbound(d.key, id).filter(u => u.entity === r.source && u.field === r.field);
    if (f.type === 'refs' && !f.owned && sd.hub !== false) {
      const editable = canWrite && (!f.sensitive || canApprove);
      return `<section class="panel"><h2>${esc(r.inverseLabel)} ${f.sensitive ? '<span class="lock" title="Relație sensibilă">🔒</span>' : ''}
        <span class="muted small">din ${esc(sd.label)}: „${esc(r.verb)}”</span></h2>
        <div class="rel-editor" data-mode="inverse" data-url="/api/manage/entities/${d.key}/${id}/inverse/${r.source}/${r.field}"
          data-target="${r.source}" data-editable="${editable ? 1 : 0}"
          data-items="${json(users.map(u => ({id: u.id, status: u.status})))}" data-titles="${json(titleMap(r.source, users.map(u => u.id)))}"></div></section>`;
    }
    if (!users.length) return '';
    return `<section class="panel"><h2>${esc(r.inverseLabel)} <span class="muted small">din ${esc(sd.label)}: „${esc(r.verb)}”</span></h2>
      <ul class="plain">${users.map(u => `<li><a href="${base(u.entity, u.id)}">${esc(titleOf(sd, store.get(u.entity, u.id)))}</a> ${u.status ? badge(u.status) : ''}</li>`).join('')}</ul>
      <p class="muted small">Se editează din ${esc(sd.label)}${f.owned ? ' (legătură deținută)' : ''}.</p></section>`;
  });
  return `<p class="muted">${live ? 'Schimbările de legături sunt <strong>live</strong>: apar pe site imediat după salvare.' : 'Înregistrarea nu e publicată: legăturile apar pe site după publicare.'}
    Pe site apar doar legăturile confirmate.</p>
  ${out.join('') || ''}${incoming.join('')}${!out.length && !incoming.join('') ? empty('Tipul nu are relații.') : ''}`;
}

async function tabSurse(ctx, d, rec, id) {
  const {api, user} = ctx;
  const rows = await api.provenanceOf(d.key, id);
  const canConfirm = can(user, 'content.write') && (!d.approval || can(user, 'content.approve'));
  const label = k => d.fields.find(f => f.key === k)?.label ?? (k || 'întreaga înregistrare');
  return `<section class="panel"><table class="table"><thead><tr><th>Câmp</th><th>Sursa</th><th>Certitudine</th><th>Fragment / metodă</th><th>Verificat</th><th></th></tr></thead><tbody>
  ${rows.map(p => `<tr><td>${esc(label(p.field))}</td>
    <td><span class="badge muted">${esc(p.kind)}</span> ${/^https?:/.test(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title ?? p.url)}</a>` : esc(p.title ?? p.url)}</td>
    <td>${badge(p.certainty)}${p.confidence != null ? ` <span class="muted small">${Math.round(p.confidence * 100)}%</span>` : ''}</td>
    <td>${p.excerpt ? `<q>${esc(p.excerpt)}</q>` : ''} <span class="muted small">${esc(p.method ?? '')}</span></td>
    <td class="small">${p.verified_by ? `${esc(p.verified_by)}, ${fmtDate(p.verified_at)}` : '—'}</td>
    <td>${p.certainty !== 'confirmed' && canConfirm ? `<button class="btn small" data-action="POST /api/manage/provenance/${p.id}/confirm">Confirmă</button>` : ''}</td></tr>`).join('')}
  </tbody></table>${rows.length ? '' : empty('Nicio sursă înregistrată.')}</section>`;
}

async function tabUndeApare(ctx, d, rec, id) {
  const {api} = ctx;
  const w = await api.whereUsed(d.key, id);
  const rel = (list, dir) => list.map(l => {
    const k = dir === 'out' ? l.target : l.entity, other = byKey[k];
    return `<li>${dir === 'out' ? `<span class="muted">${esc(l.rel ?? '')}</span> ` : `<span class="muted">${esc(l.rel ?? '')}:</span> `}
      <a href="${base(k, l.id)}">${esc(l.title)}</a> <span class="muted small">${esc(other.one)}</span> ${l.status ? badge(l.status) : ''}</li>`;
  }).join('');
  const editLink = d.public ? '' : '';
  return `<section class="panel"><h2>1. Relații directe</h2>
  ${w.relations.outgoing.length + w.relations.incoming.length ? `<ul class="plain">${rel(w.relations.outgoing, 'out')}${rel(w.relations.incoming, 'in')}</ul>` : empty('Nicio relație salvată.')}
</section>
<section class="panel"><h2>2. Utilizări efective în pagini <span class="muted">${w.appearsIn}</span></h2>
  ${w.pages.length ? `<ul class="plain">${w.pages.map(p => `<li><a href="${esc(p.path)}" target="_blank" rel="noopener"><code>${esc(p.path)}</code></a>
    <ul>${p.uses.map(u => `<li>${esc(u.label)}${u.via ? ` <span class="muted small">(prin ${esc(u.via)})</span>` : ''} <span class="badge muted">${esc(u.kind)}</span></li>`).join('')}</ul></li>`).join('')}</ul>${editLink}`
    : empty('Nu apare încă în nicio pagină publică.')}
  ${w.pendingPublish.length ? `<h3>Legat deja: apare după publicare</h3><ul class="plain">${[...new Set(w.pendingPublish.map(p => p.path))].map(p => `<li><code>${esc(p)}</code></li>`).join('')}</ul>` : ''}
</section>
<section class="panel"><h2>3. Dependențe indirecte</h2>
  ${w.lists.length ? `<ul class="plain">${w.lists.map(l => `<li><code>${esc(l.path)}</code> — «${esc(l.component)}»: ${esc(l.rule)}</li>`).join('')}</ul>`
    : empty('Nu intră în nicio listă calculată după regulă.')}
</section>
<section class="panel"><h2>4. Detectate, neverificate</h2>
  ${w.unverified.length ? `<h3>Legături deduse sau neverificate</h3><ul class="plain">${w.unverified.map(l => `<li>${badge(l.status)} <a href="${base(l.target ?? l.entity, l.id)}">${esc(l.title)}</a>
    ${l.confidence != null ? `<span class="muted small">${Math.round(l.confidence * 100)}%</span>` : ''} ${l.note ? `<span class="muted small">${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${w.mentions.length ? `<h3>Numele apare în texte, fără legătură salvată</h3><ul class="plain">${w.mentions.map(m => `<li><a href="${base(m.key, m.id)}detalii/?camp=${m.field}">${esc(m.title)}</a>
    <span class="muted small">${esc(byKey[m.key].one)}</span><br><q class="small">${esc(m.excerpt)}</q></li>`).join('')}</ul>` : ''}
  ${!w.unverified.length && !w.mentions.length ? empty(d.mentions ? 'Nimic detectat.' : 'Nimic detectat. Numele acestui tip nu se caută în texte.') : ''}
</section>`;
}

async function tabIstoric(ctx, d, rec, id) {
  const rows = await ctx.api.historyOf(d.key, id);
  const ACTIONS = {create: 'a creat', update: 'a modificat', draft: 'a salvat ciorna', publish: 'a publicat', links: 'a schimbat legăturile', 'link-status': 'a schimbat starea unei legături',
    'links-confirm': 'a confirmat legături', 'links-remove': 'a scos legături', archived: 'a arhivat', draft_status: 'a retras', 'source-confirm': 'a confirmat o sursă', delete: 'a șters'};
  const label = k => d.fields.find(f => f.key === k)?.label ?? k;
  const short = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? '—' : s.length > 120 ? s.slice(0, 119) + '…' : s; };
  return `<section class="panel"><ol class="history">${rows.map(r => {
    const c = r.changes ?? {};
    let detail = '';
    if (c.fields) detail = `<ul>${Object.entries(c.fields).map(([k, [a, b]]) => `<li><strong>${esc(label(k))}</strong>: <del>${esc(short(a))}</del> → <ins>${esc(short(b))}</ins></li>`).join('')}</ul>`;
    else if (c.draft) detail = `<ul>${Object.entries(c.draft).map(([k, v]) => `<li><strong>${esc(label(k))}</strong> → ${esc(short(v))}</li>`).join('')}</ul>`;
    else if (c.field) detail = `<p class="small">${esc(label(c.field))}${c.status ? `: ${esc(c.status)}` : ''}</p>`;
    return `<li><span class="nowrap">${fmtDate(r.at)}</span> · <strong>${esc(r.user_name)}</strong> ${esc(ACTIONS[r.action] ?? r.action)}${detail}</li>`;
  }).join('')}</ol>${rows.length ? '' : empty('Fără istoric.')}</section>`;
}

const TAB_FN = {prezentare: tabPrezentare, detalii: tabDetalii, relatii: tabRelatii, surse: tabSurse, 'unde-apare': tabUndeApare, istoric: tabIstoric};

export async function entityView(ctx, key, id, tab) {
  const {store, user} = ctx;
  const d = store.def(key);
  const rec = store.get(key, id);
  if (!rec) return null;
  const fn = TAB_FN[tab];
  if (!fn) return null;
  const title = titleOf(d, rec);
  const view = rec.draft ? {...rec, ...rec.draft} : rec;
  const path = publicPath(d, rec), previewPath = publicPath(d, view);
  const external = d.external?.(rec);
  const actions = [];
  if (!d.noStatus && can(user, publishPerm(d))) {
    if (rec.status === 'published' && rec.draft) actions.push(`<button class="btn" data-action="POST /api/manage/entities/${key}/${id}/publish">Publică ciorna</button>`);
    if (rec.status !== 'published') actions.push(`<button class="btn" data-action="POST /api/manage/entities/${key}/${id}/publish">Publică</button>`);
    if (rec.status === 'published') actions.push(`<button class="btn secondary" data-action="POST /api/manage/entities/${key}/${id}/status" data-body='{"status":"draft"}' data-confirm="Retrag de pe site? Paginile care o afișează se refac.">Retrage</button>`);
    if (rec.status !== 'archived') actions.push(`<button class="btn secondary" data-action="POST /api/manage/entities/${key}/${id}/status" data-body='{"status":"archived"}' data-confirm="Arhivez?">Arhivează</button>`);
  }
  if (can(user, 'content.delete') && !d.singleton) actions.push(`<button class="btn danger" data-action="DELETE /api/manage/entities/${key}/${id}" data-next="/manage/entitati/${key}/"
    data-confirm="Șterg definitiv „${esc(title)}”? Rămâne în Istoric.">Șterge</button>`);
  const links = [
    path && rec.status === 'published' ? `<a href="${esc(path)}" target="_blank" rel="noopener">Vezi pe site ↗</a>` : '',
    previewPath ? `<a href="/manage/previzualizare${esc(previewPath)}" target="_blank" rel="noopener">Previzualizează ↗</a>` : '',
    external ? `<a href="${esc(external)}" target="_blank" rel="noopener">Pagina la retailer ↗</a>` : ''
  ].filter(Boolean).join(' · ');
  const body = `<div class="head"><div><p class="kicker" style="--c:${d.color}">${esc(d.one)}${d.approval ? ' · cu aprobare' : ''}</p>
  <h1>${esc(title)} ${d.noStatus ? '' : badge(rec.status)}${rec.draft ? ' <span class="badge warn">ciornă nepublicată</span>' : ''}</h1>
  <p class="muted small">Actualizat ${fmtDate(rec.updated_at)} de ${esc(rec.updated_by ?? '—')}${links ? ` · ${links}` : ''}</p></div>
  <div class="actions">${actions.join('')}</div></div>
<nav class="tabs">${TABS.map(([k, l]) => `<a href="${base(key, id)}${k === 'prezentare' ? '' : k + '/'}"${k === tab ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
${await fn(ctx, d, rec, id)}`;
  return page(user, {title: `${title} · ${d.one}`, active: 'entitati', crumbs: [['Entități', '/manage/entitati/'], [d.label, `/manage/entitati/${key}/`], [title]], body, counts: ctx.counts});
}
