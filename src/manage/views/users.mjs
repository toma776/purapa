// Autentificarea și conturile.
import {page, bare, esc, fmtDate} from './ui.mjs';

export function login({setup, next}) {
  const target = esc(next || '/manage/');
  if (setup) {
    return bare('Primul cont', `<h1>Brain <strong>Purapa</strong></h1>
<p>Nu există încă niciun cont. Creează contul de administrator (doar de pe acest calculator).</p>
<form class="form" data-api="POST /api/manage/auth/setup" data-next="${target}">
  <label>Nume <input name="name" required autocomplete="name"></label>
  <label>Email <input name="email" type="email" required autocomplete="email"></label>
  <label>Parolă (cel puțin 10 caractere) <input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
  <button class="btn">Creează contul</button>
</form>`);
  }
  return bare('Autentificare', `<h1>Brain <strong>Purapa</strong></h1>
<form class="form" data-api="POST /api/manage/auth/login" data-next="${target}">
  <label>Email <input name="email" type="email" required autocomplete="username" autofocus></label>
  <label>Parolă <input name="password" type="password" required autocomplete="current-password"></label>
  <button class="btn">Intră</button>
</form>`);
}

const ROLE_LABEL = {admin: 'Administrator: tot', editor: 'Editor: conținut și ciorne', viewer: 'Vizualizare: citire și previzualizare'};
const roleSelect = (name, value) => `<select name="${name}">${Object.entries(ROLE_LABEL).map(([k, l]) =>
  `<option value="${k}"${k === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

export async function users(ctx) {
  const {auth, user} = ctx;
  const list = await auth.listUsers();
  const body = `<h1>Utilizatori</h1>
<section class="panel">
<table class="table"><thead><tr><th>Nume</th><th>Email</th><th>Rol</th><th>Ultima intrare</th><th></th></tr></thead><tbody>
${list.map(u => `<tr${u.active ? '' : ' class="muted"'}><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
  <td><form class="inline" data-api="PUT /api/manage/users/${u.id}" data-auto>${roleSelect('role', u.role)}</form></td>
  <td>${fmtDate(u.last_login)}</td>
  <td><button class="link" data-action="PUT /api/manage/users/${u.id}" data-body='${JSON.stringify({active: !u.active})}'>${u.active ? 'Dezactivează' : 'Activează'}</button></td></tr>`).join('')}
${list.length ? '' : '<tr><td colspan="5" class="muted">Niciun cont încă.</td></tr>'}
</tbody></table></section>
<section class="panel narrow"><h2>Cont nou</h2>
<form class="form" data-api="POST /api/manage/users" data-next="${user.setup ? '/manage/login/' : '/manage/utilizatori/'}">
  <label>Nume <input name="name" required></label>
  <label>Email <input name="email" type="email" required></label>
  <label>Rol ${roleSelect('role', list.length ? 'editor' : 'admin')}</label>
  <label>Parolă (cel puțin 10 caractere) <input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
  <button class="btn">Creează contul</button>
  ${user.setup ? '<p class="muted small">După primul cont, panoul cere autentificare și pe acest calculator.</p>' : ''}
</form></section>`;
  return page(user, {title: 'Utilizatori', active: 'utilizatori', body, counts: ctx.counts});
}
