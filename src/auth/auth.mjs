// Autentificarea (§1.9): parole hash-uite cu scrypt, sesiuni în bază (tokenul stocat doar ca hash),
// încercări de login limitate, cookie HttpOnly. Fără parolă doar pe localhost și doar cât nu există niciun cont.
import {scryptSync, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {nowIso} from '../core/db.mjs';
import {HttpError, userFor, ROLES} from '../core/store.mjs';

export const COOKIE = 'purapa_session';
const SESSION_DAYS = 14;
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const sha256 = s => createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64, {N: 16384, r: 8, p: 1});
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), Buffer.from(salt, 'hex'), expected.length, {N: 16384, r: 8, p: 1});
  return timingSafeEqual(actual, expected);
}

const parseCookies = header => Object.fromEntries(String(header ?? '').split(';').map(c => c.trim().split('=')).filter(([k]) => k)
  .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

// Pe Vercel nu există „localhost”: modul fără parolă e doar pentru serverul pornit local.
export const isLocal = req => !process.env.VERCEL && LOCAL.has(req.socket?.remoteAddress) && !req.headers['x-forwarded-for'];

export function createAuth(db) {
  const hasUsers = async () => !!await db.get('SELECT 1 AS x FROM users WHERE active = 1 LIMIT 1');

  function validate({email, name, role, password}, partial = false) {
    const errors = {};
    if (!partial || email !== undefined) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ''))) errors.email = 'email invalid';
    if (!partial || name !== undefined) if (!String(name ?? '').trim()) errors.name = 'obligatoriu';
    if (!partial || role !== undefined) if (!ROLES[role]) errors.role = 'admin, editor sau viewer';
    if (!partial || password !== undefined) if (String(password ?? '').length < 10) errors.password = 'cel puțin 10 caractere';
    if (Object.keys(errors).length) throw new HttpError(400, 'Date invalide', {errors});
  }

  const publicUser = u => u && ({id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active, created_at: u.created_at, last_login: u.last_login});
  const userById = async id => db.get('SELECT * FROM users WHERE id = ?', [id]);

  async function createUser({email, name, role, password}) {
    validate({email, name, role, password});
    if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', [email.toLowerCase()])) throw new HttpError(409, 'Există deja un cont cu acest email');
    const id = await db.insert('INSERT INTO users (email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase(), name.trim(), role, hashPassword(password), nowIso()]);
    return publicUser(await userById(id));
  }

  async function updateUser(id, data) {
    validate(data, true);
    const cur = await userById(id);
    if (!cur) throw new HttpError(404, 'Contul nu există');
    const next = {
      name: data.name?.trim() ?? cur.name, role: data.role ?? cur.role,
      active: data.active === undefined ? cur.active : data.active ? 1 : 0,
      password: data.password ? hashPassword(data.password) : cur.password
    };
    // Rămâne mereu cel puțin un administrator activ.
    if (cur.role === 'admin' && (next.role !== 'admin' || !next.active)
      && (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [id])).n === 0)
      throw new HttpError(409, 'Trebuie să rămână cel puțin un administrator activ');
    await db.run('UPDATE users SET name = ?, role = ?, active = ?, password = ? WHERE id = ?', [next.name, next.role, next.active, next.password, id]);
    if (!next.active || data.password) await db.run('DELETE FROM sessions WHERE user_id = ?', [id]);
    return publicUser(await userById(id));
  }

  const listUsers = async () => (await db.all('SELECT * FROM users ORDER BY name')).map(publicUser);

  async function login(email, password, ip) {
    const e = String(email ?? '').toLowerCase().trim();
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const failures = (await db.get('SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0 AND at > ? AND (email = ? OR ip = ?)', [since, e, ip ?? ''])).n;
    if (failures >= MAX_FAILURES) throw new HttpError(429, 'Prea multe încercări. Încearcă din nou peste 15 minute.');
    const u = await db.get('SELECT * FROM users WHERE email = ? AND active = 1', [e]);
    const ok = !!u && verifyPassword(password, u.password);
    await db.run('INSERT INTO login_attempts (email, ip, at, ok) VALUES (?, ?, ?, ?)', [e, ip ?? '', nowIso(), ok ? 1 : 0]);
    if (!ok) throw new HttpError(401, 'Email sau parolă greșită');
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    await db.run('INSERT INTO sessions (token, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)', [sha256(token), u.id, nowIso(), expires, ip ?? '']);
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', [nowIso(), u.id]);
    await db.run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
    return {token, expires, user: publicUser(u)};
  }

  const logout = async token => { if (token) await db.run('DELETE FROM sessions WHERE token = ?', [sha256(token)]); };

  const tokenOf = req => parseCookies(req.headers.cookie)[COOKIE] ?? null;

  async function userFromRequest(req) {
    const token = tokenOf(req);
    if (token) {
      const u = await db.get(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`, [sha256(token), nowIso()]);
      if (u) return {...userFor(u.name, u.role), id: u.id, email: u.email};
    }
    if (isLocal(req) && !await hasUsers()) return {...userFor('Local', 'admin'), id: null, setup: true};
    return null;
  }

  const cookie = (token, expires, secure) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}${secure ? '; Secure' : ''}`;
  const clearCookie = secure => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

  return {hasUsers, createUser, updateUser, listUsers, login, logout, tokenOf, userFromRequest, cookie, clearCookie};
}
