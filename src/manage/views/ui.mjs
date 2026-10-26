// Elementele comune ale paginilor /manage: cadrul, navigația, etichetele de stare.
import {esc} from '../../core/content.mjs';
import {can} from '../../core/store.mjs';

export {esc};

const DT = new Intl.DateTimeFormat('ro-RO', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest'});
export const fmtDate = iso => iso ? DT.format(new Date(iso)) : '—';
export const json = v => esc(JSON.stringify(v));

const STATUS = {
  published: ['Publicat', 'ok'], draft: ['Ciornă', 'warn'], archived: ['Arhivat', 'muted'],
  confirmed: ['Confirmată', 'ok'], inferred: ['Dedusă', 'warn'], unverified: ['Neverificată', 'bad'], unrecoverable: ['Nerecuperabilă', 'bad'],
  pending: ['În așteptare', 'warn'], done: ['Gata', 'ok'], failed: ['Eșuat', 'bad']
};
export const badge = (status, extra = '') => {
  const [label, cls] = STATUS[status] ?? [status ?? '—', 'muted'];
  return `<span class="badge ${cls}">${esc(label)}${extra}</span>`;
};
export const impact = i => `<span class="badge ${i === 'mare' ? 'bad' : i === 'mediu' ? 'warn' : 'muted'}">${esc(i)}</span>`;

const NAV = [
  ['panou', '/manage/', 'Panou', 'content.read'],
  ['entitati', '/manage/entitati/', 'Entități', 'content.read'],
  ['harta', '/manage/harta/', 'Harta', 'content.read'],
  ['legaturi', '/manage/surse/legaturi/', 'Legături de verificat', 'content.read'],
  ['surse', '/manage/surse/', 'Surse', 'content.read'],
  ['utilizatori', '/manage/utilizatori/', 'Utilizatori', 'users.write']
];

export function page(user, {title, active, crumbs = [], body, counts = {}, scripts = []}) {
  const nav = NAV.filter(([, , , perm]) => can(user, perm)).map(([key, href, label]) => {
    const n = key === 'legaturi' ? counts.inferred : key === 'panou' ? counts.failed : 0;
    return `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${esc(label)}${n ? ` <span class="count${key === 'panou' ? ' bad' : ''}" title="${key === 'panou' ? 'propagări eșuate' : 'de verificat'}">${n}</span>` : ''}</a>`;
  }).join('');
  const trail = crumbs.length ? `<nav class="crumbs" aria-label="Fir de navigare">${crumbs.map(([label, href]) =>
    href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`).join('<span aria-hidden="true">›</span>')}</nav>` : '';
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Brain Purapa</title>
<link rel="stylesheet" href="/manage/assets/manage.css"></head>
<body><div class="app">
<aside class="side"><a class="logo" href="/manage/">Brain <strong>Purapa</strong></a><nav class="menu">${nav}</nav>
<div class="who">${user.open ? '<span class="badge bad">Panou deschis public</span>' : user.setup ? '<span class="badge warn">Mod local, fără cont</span>' : `<span>${esc(user.name)}</span><span class="role">${esc(user.role)}</span>
<button class="link" data-action="POST /api/manage/auth/logout" data-next="/manage/login/">Ieși</button>`}</div></aside>
<main class="content">${trail}${counts.syncConflict ? `<div class="flash warn">Baza s-a modificat și online, și aici, în același timp. A rămas varianta de aici; cea online e păstrată în <code>${esc(counts.syncConflict.saved)}</code>.</div>` : ''}${user.open ? `<div class="flash bad">Panoul e deschis oricui, fără parolă: orice modificare de aici apare imediat pe site.</div>` : ''}${user.setup ? `<div class="flash warn">Nu există încă niciun cont. Panoul e deschis fără parolă doar pe acest calculator. <a href="/manage/utilizatori/">Creează primul cont de administrator</a>.</div>` : ''}
<div class="flash" id="flash" role="status" hidden></div>
${body}</main></div>
<script src="/manage/assets/manage.js" defer></script>${scripts.map(s => `<script src="${s}" defer></script>`).join('')}
</body></html>`;
}

export function bare(title, body) {
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Brain Purapa</title><link rel="stylesheet" href="/manage/assets/manage.css"></head>
<body class="bare"><main class="login">${body}<div class="flash" id="flash" role="status" hidden></div></main>
<script src="/manage/assets/manage.js" defer></script></body></html>`;
}

export const empty = text => `<p class="empty">${esc(text)}</p>`;
