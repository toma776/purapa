// „Legături de verificat” (§2.5), „Surse” (§1.4) și harta (§2.4).
import {page, esc, badge, empty} from './ui.mjs';
import {can} from '../../core/store.mjs';
import {inferredGroups} from '../../core/inferred.mjs';

export function inferred(ctx) {
  const {db, store, user} = ctx;
  const groups = inferredGroups(db, store);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const body = `<h1>Legături de verificat <span class="muted">${total}</span></h1>
<p class="muted">Legăturile deduse sau neverificate nu apar pe site până nu le confirmă un om. Ce scoți se ține minte și nu mai e propus din aceeași dovadă.</p>
${groups.map(g => {
  const allowed = can(user, 'content.write') && (!g.approval || can(user, 'content.approve'));
  return `<section class="panel inferred" data-relation="${esc(g.relation)}">
  <h2>${esc(g.label)} ${g.sensitive ? '<span class="lock" title="Relație sensibilă">🔒</span>' : ''} <span class="muted">${g.items.length}</span></h2>
  <p><span class="muted">Dovada:</span> ${esc(g.evidence)} · <span class="muted">Recomandare:</span> <strong>${esc(g.recommendation)}</strong></p>
  <table class="table"><thead><tr>${allowed ? '<th><input type="checkbox" data-check-all aria-label="Selectează tot grupul"></th>' : ''}<th>De la</th><th>La</th><th>Stare</th><th>Încredere</th><th>Dovadă</th></tr></thead><tbody>
  ${g.items.map(i => `<tr>${allowed ? `<td><input type="checkbox" data-pair="${i.src},${i.dst}" aria-label="Selectează"></td>` : ''}
    <td><a href="/manage/entitati/${g.source}/${i.src}/relatii/">${esc(i.srcTitle)}</a></td><td><a href="/manage/entitati/${g.target}/${i.dst}/">${esc(i.dstTitle)}</a></td>
    <td>${badge(i.status)}</td><td>${i.confidence != null ? `${Math.round(i.confidence * 100)}%` : '—'}</td>
    <td class="small">${i.note ? `<q>${esc(i.note)}</q>` : ''} ${i.source ? `<span class="muted">${esc(i.source)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table>
  ${allowed ? `<div class="actions"><button class="btn" data-bulk="confirm">Confirmă selectate</button><button class="btn secondary" data-bulk="remove">Scoate selectate</button>
    <span class="muted small">O singură tranzacție, un singur eveniment de propagare.</span></div>`
    : `<p class="muted small">${g.approval ? 'Confirmarea cere dreptul de aprobare.' : 'Ai drept doar de citire.'}</p>`}
</section>`;
}).join('')}
${groups.length ? '' : empty('Nicio legătură de verificat.')}`;
  return page(user, {title: 'Legături de verificat', active: 'legaturi', crumbs: [['Surse', '/manage/surse/'], ['Legături de verificat']], body, counts: ctx.counts});
}

export function sources(ctx) {
  const {api, user} = ctx;
  const rows = api('GET', '/sources', user);
  const body = `<h1>Surse <span class="muted">${rows.length}</span></h1>
<p class="muted">De unde vine fiecare informație. Certitudinea se confirmă din tab-ul Surse al fiecărei entități.</p>
<section class="panel"><input class="filter" type="search" placeholder="Caută…" data-filter="#src">
<table class="table" id="src"><thead><tr><th>Tip</th><th>Sursa</th><th>Descărcat</th><th>Informații</th><th>Confirmate</th><th>De verificat</th></tr></thead><tbody>
${rows.map(s => `<tr><td><span class="badge muted">${esc(s.kind)}</span></td>
  <td>${/^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title ?? s.url)}</a>` : esc(s.title ?? s.url)}
    ${s.snapshot_file ? `<br><span class="muted small">${esc(s.snapshot_file)}</span>` : ''}</td>
  <td class="nowrap">${s.fetched_at ? esc(s.fetched_at.slice(0, 10)) : '—'}</td><td>${s.uses}</td><td>${s.confirmed ?? 0}</td>
  <td>${(s.unverified ?? 0) + (s.inferred ?? 0) ? `<span class="badge warn">${(s.unverified ?? 0) + (s.inferred ?? 0)}</span>` : '—'}</td></tr>`).join('')}
</tbody></table></section>
<p><a href="/manage/surse/legaturi/">Legături de verificat →</a></p>`;
  return page(user, {title: 'Surse', active: 'surse', crumbs: [['Surse']], body, counts: ctx.counts});
}

export function map(ctx) {
  const body = `<div class="head"><h1>Harta legăturilor</h1>
  <form class="map-search" role="search"><input type="search" id="map-q" placeholder="Caută o entitate…" autocomplete="off" aria-label="Caută o entitate"><div id="map-results" class="results" hidden></div></form></div>
<nav class="crumbs" id="map-crumbs" aria-label="Nivel"></nav>
<div class="map-tools">
  <fieldset><legend>Straturi</legend>
    <label><input type="checkbox" checked disabled> Relații</label>
    <label><input type="checkbox" data-layer="imagini"> Imagini</label>
    <label><input type="checkbox" data-layer="texte" checked> Din texte</label></fieldset>
  <fieldset><legend>Starea legăturii</legend>
    <label><input type="checkbox" data-status="confirmed" checked> <span class="ln solid"></span> confirmată</label>
    <label><input type="checkbox" data-status="inferred" checked> <span class="ln dashed"></span> dedusă</label>
    <label><input type="checkbox" data-status="unverified" checked> <span class="ln dotted"></span> neverificată</label></fieldset>
  <div class="tool-tabs" role="tablist">
    <button role="tab" data-tool="harta" aria-selected="true">Harta</button>
    <button role="tab" data-tool="traseu">Traseu</button>
    <button role="tab" data-tool="sanatate">Sănătate</button>
    <button role="tab" data-tool="toate">Toate legăturile</button>
  </div>
</div>
<div class="map-wrap"><div id="map" class="map-canvas" aria-live="polite"></div><aside id="map-panel" class="map-panel" hidden></aside></div>
<section class="panel" id="map-trail" hidden><h2>Drumul tău</h2><div class="trail"></div></section>`;
  return page(ctx.user, {title: 'Harta', active: 'harta', crumbs: [], body, counts: ctx.counts, scripts: ['/manage/assets/map.js']});
}
