// Panoul: De făcut, starea propagării, aprobările, ultimele modificări cu paginile refăcute și motivul.
import {page, esc, badge, impact, fmtDate, empty} from './ui.mjs';
import {can} from '../../core/store.mjs';
import {byKey, ENTITIES, titleOf} from '../../registry/entities.mjs';

export async function dashboard(ctx) {
  const {db, store, sync, todos, user} = ctx;
  const st = await sync.status();
  const list = await todos.list();
  const approvals = ENTITIES.filter(d => d.approval).flatMap(d => store.list(d.key)
    .filter(r => r.status === 'draft' || r.draft).map(r => ({d, r})));
  const events = await db.all('SELECT * FROM change_events ORDER BY id DESC LIMIT 15');
  const logs = events.length ? await db.all(`SELECT event_id, path, action, detail FROM sync_log WHERE event_id IN (${events.map(() => '?').join(', ')}) ORDER BY id`,
    events.map(e => e.id)) : [];
  const logOf = id => logs.filter(l => l.event_id === id);
  const failed = await db.all("SELECT * FROM change_events WHERE status = 'failed' ORDER BY id");

  const stat = (label, value, cls = '') => `<div class="stat ${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`;

  const body = `<h1>Panou</h1>
<section class="stats">
  ${stat('Pagini publice', st.pages)}
  ${stat('Dependențe măsurate', st.deps)}
  ${stat('Propagări în așteptare', st.pending, st.pending ? 'warn' : '')}
  ${stat('Propagări eșuate', st.failed, st.failed ? 'bad' : '')}
  ${stat('Pagini de refăcut', st.stale, st.stale ? 'warn' : '')}
</section>

<div class="cols">
<section class="panel">
  <h2>De făcut <span class="muted">${list.length}</span></h2>
  ${list.length ? `<ul class="todo">${list.slice(0, 40).map(t => `<li>${impact(t.impact)} <a href="${esc(t.href)}">${t.title ? `<strong>${esc(t.title)}</strong>: ` : ''}${esc(t.text)}</a></li>`).join('')}</ul>` : empty('Nimic de făcut.')}
</section>
<section class="panel">
  <h2>Așteaptă aprobare <span class="muted">${approvals.length}</span></h2>
  ${approvals.length ? `<ul class="plain">${approvals.map(({d, r}) => `<li>${badge(r.status)} <a href="/manage/entitati/${d.key}/${r.id}/">${esc(titleOf(d, r))}</a>
    <span class="muted">${esc(d.one)}${r.draft ? ' · modificări în ciornă' : ''}</span></li>`).join('')}</ul>` : empty('Nicio ciornă nu așteaptă aprobare.')}
  ${can(user, 'content.approve') ? '' : '<p class="muted small">Publicarea acestor tipuri cere dreptul de aprobare.</p>'}
</section>
</div>

<section class="panel" id="propagare">
  <h2>Propagarea</h2>
  <p class="muted small">Ultima propagare: ${fmtDate(st.lastProcessed)} · ultima scanare completă: ${fmtDate(st.lastScan)}
  ${can(user, 'content.write') ? ' · <button class="link" data-action="POST /api/manage/sync/scan" data-confirm="Randez toate paginile publice și rescriu dependențele?">Scanează tot site-ul</button>' : ''}</p>
  ${failed.length ? `<div class="flash bad"><strong>${failed.length} propagări eșuate.</strong> Paginile reușite au rămas valabile.<ul>${failed.map(e =>
    `<li>#${e.id} ${esc(e.label ?? e.action)} — ${esc(e.last_error ?? '')} (${e.attempts} încercări)
      ${can(user, 'content.write') ? `<button class="btn small" data-action="POST /api/manage/sync/retry/${e.id}">Reia</button>` : ''}</li>`).join('')}</ul></div>` : ''}
  <table class="table"><thead><tr><th>Când</th><th>Cine</th><th>Ce</th><th>Stare</th><th>Pagini refăcute</th></tr></thead><tbody>
  ${events.map(e => {
    const log = logOf(e.id).filter(l => l.action !== 'invalidated');
    const d = byKey[e.entity];
    const what = d && e.entity_id ? `<a href="/manage/entitati/${d.key}/${e.entity_id}/">${esc(e.label ?? '')}</a>` : esc(e.label ?? '');
    return `<tr><td class="nowrap">${fmtDate(e.at)}</td><td>${esc(e.user_name)}</td><td>${esc(e.action)} ${d ? `<span class="muted">${esc(d.one)}</span>` : ''} ${what}</td>
      <td>${badge(e.status)}</td><td>${log.length ? `<details><summary>${log.length} ${log.length === 1 ? 'pagină' : 'pagini'}</summary><ul class="log">${log.map(l =>
        `<li><code>${esc(l.path)}</code> ${l.action === 'rendered' ? '' : badge(l.action === 'failed' ? 'failed' : 'pending', '')} <span class="muted">${esc(l.detail ?? '')}</span></li>`).join('')}</ul></details>`
        : `<span class="muted">${e.status === 'done' ? (e.last_error === 'acoperit de scanare' ? 'acoperit de scanare' : 'nicio pagină afectată') : '—'}</span>`}</td></tr>`;
  }).join('')}
  </tbody></table>
</section>`;
  return page(user, {title: 'Panou', active: 'panou', body, counts: ctx.counts});
}
