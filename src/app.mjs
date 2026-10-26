// Aplicația: baza, store-ul, propagarea, site-ul public, /manage și /api/manage, legate într-un singur handler HTTP.
// Rulează la fel pe un server permanent (src/server.mjs) și pe Vercel (api/index.mjs).
import {readFile} from 'node:fs/promises';
import {join, normalize, extname, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {openDb, migrate} from './core/db.mjs';
import {createStore, HttpError, SYSTEM} from './core/store.mjs';
import {createSync} from './core/sync.mjs';
import {createGraph} from './core/graph.mjs';
import {createTodos} from './core/todos.mjs';
import {createAuth, isLocal} from './auth/auth.mjs';
import {createApi} from './manage/api.mjs';
import {renderManage} from './manage/pages.mjs';
import {login as loginPage} from './manage/views/users.mjs';
import {createContext} from './site/context.mjs';
import {renderPath} from './site/render.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(ROOT, 'manage', 'assets');
const SITE_ASSETS = join(ROOT, 'site', 'assets');
const MIME = {'.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8'};

// Cache-ul CDN (Vercel): paginile publice stau în cache până le golește propagarea, adresă cu adresă.
const PUBLIC_CACHE = 'public, max-age=0, must-revalidate';
const CDN_CACHE = 'max-age=31536000, stale-while-revalidate=60';

export async function createApp({database = process.env.DATABASE_URL ?? 'data/purapa.db', mediaDir = 'data/media', cronKey = process.env.CRON_SECRET ?? process.env.CRON_KEY,
  onInvalidate, migrateOnStart = true} = {}) {
  const db = await openDb(database);
  if (migrateOnStart) await migrate(db);
  const store = createStore(db);
  await store.load();
  const sync = createSync(db, store, {onInvalidate, onError: (e, where) => console.error(`[propagare ${where}]`, e.message)});
  const graph = createGraph(db, store);
  const todos = createTodos(db, store, graph);
  const auth = createAuth(db);
  const api = createApi({db, store, sync, graph, todos, auth});
  const env = {db, store, sync, graph, todos, auth, api};

  const send = (res, status, body, type = 'application/json; charset=utf-8', headers = {}) => {
    res.writeHead(status, {'content-type': type, ...headers});
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  const secure = req => req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
  const ipOf = req => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();

  async function readBody(req) {
    if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new HttpError(413, 'Cerere prea mare'); }
    if (!raw) return {};
    if ((req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
    try { return JSON.parse(raw); } catch { throw new HttpError(400, 'JSON invalid'); }
  }

  // Autentificarea: login, logout și primul cont (doar local, doar cât nu există niciun cont).
  async function authRoute(req, res, path) {
    const headers = {'cache-control': 'no-store'};
    if (path === '/api/manage/auth/login') {
      const b = await readBody(req);
      const {token, expires, user} = await auth.login(b.email, b.password, ipOf(req));
      return send(res, 200, {user}, undefined, {...headers, 'set-cookie': auth.cookie(token, expires, secure(req))});
    }
    if (path === '/api/manage/auth/logout') {
      await auth.logout(auth.tokenOf(req));
      return send(res, 200, {ok: true}, undefined, {...headers, 'set-cookie': auth.clearCookie(secure(req))});
    }
    if (path === '/api/manage/auth/setup') {
      if (await auth.hasUsers() || !isLocal(req)) throw new HttpError(403, 'Primul cont se creează doar local, cât nu există niciun cont');
      const b = await readBody(req);
      await auth.createUser({email: b.email, name: b.name, password: b.password, role: 'admin'});
      const {token, expires, user} = await auth.login(b.email, b.password, ipOf(req));
      return send(res, 200, {user}, undefined, {...headers, 'set-cookie': auth.cookie(token, expires, secure(req))});
    }
    return null;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const path = decodeURIComponent(url.pathname);
    try {
      // Scrierile venite din alt site sunt refuzate (verificarea Origin).
      if (req.method !== 'GET' && req.method !== 'HEAD' && (path.startsWith('/api/manage/') || path.startsWith('/manage/'))
        && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403, 'Origine nepermisă');

      if (path.startsWith('/api/manage/auth/') && req.method === 'POST') {
        const handled = await authRoute(req, res, path);
        if (handled !== null) return handled;
      }

      if (path.startsWith('/api/manage/')) {
        const headers = {'cache-control': 'no-store'};
        // Vercel Cron trimite GET cu „Authorization: Bearer <CRON_SECRET>”; un cron de sistem poate trimite POST cu x-cron-key.
        if (path === '/api/manage/cron/tick') {
          const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || String(req.headers['x-cron-key'] ?? '');
          const key = Buffer.from(given);
          if (!cronKey || key.length !== Buffer.byteLength(cronKey) || !timingSafeEqual(key, Buffer.from(cronKey))) throw new HttpError(401, 'Cheie de cron invalidă');
          return send(res, 200, await sync.tick(), undefined, headers);
        }
        await store.fresh();
        const user = await auth.userFromRequest(req);
        if (!user) throw new HttpError(401, 'Autentificare necesară');
        const body = req.method === 'GET' ? {} : await readBody(req);
        const result = await api(req.method, path.slice('/api/manage'.length), user, body, url.searchParams);
        // După o scriere, propagarea rulează înainte de răspuns: pe serverless, după răspuns funcția poate fi oprită.
        if (req.method !== 'GET') await sync.process();
        return send(res, 200, result, undefined, headers);
      }

      // Resursele site-ului public (CSS, JS, fonturi). Cu ?v= din conținut, se pot ține în cache un an.
      if (path.startsWith('/assets/')) {
        const rel = normalize(path.slice('/assets/'.length));
        const data = rel.startsWith('..') ? null : await readFile(join(SITE_ASSETS, rel)).catch(() => null);
        if (!data) throw new HttpError(404, 'Nu există');
        const cache = url.searchParams.has('v') || rel.startsWith('fonts') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
        return send(res, 200, data, MIME[extname(rel)] ?? 'application/octet-stream', {'cache-control': cache});
      }

      if (path.startsWith('/manage/assets/')) {
        const rel = normalize(path.slice('/manage/assets/'.length));
        const data = rel.startsWith('..') ? null : await readFile(join(ASSETS, rel)).catch(() => null);
        if (!data) throw new HttpError(404, 'Nu există');
        return send(res, 200, data, MIME[extname(rel)] ?? 'application/octet-stream', {'cache-control': 'no-cache'});
      }

      if (path === '/manage' || path.startsWith('/manage/')) {
        const headers = {'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin'};
        if (path === '/manage') return send(res, 301, '', 'text/plain', {location: '/manage/'});
        if (!path.endsWith('/')) return send(res, 301, '', 'text/plain', {location: `${path}/${url.search}`});
        if (path === '/manage/login/') {
          return send(res, 200, loginPage({setup: isLocal(req) && !await auth.hasUsers(), next: url.searchParams.get('next')}), 'text/html; charset=utf-8', headers);
        }
        await store.fresh();
        const user = await auth.userFromRequest(req);
        if (!user) return send(res, 302, '', 'text/plain', {location: `/manage/login/?next=${encodeURIComponent(path + url.search)}`});
        if (path.startsWith('/manage/previzualizare/')) {
          const target = path.slice('/manage/previzualizare'.length) || '/';
          const out = renderPath(createContext(store, {preview: true}), store, target);
          return send(res, out.status, out.html, 'text/html; charset=utf-8', headers);
        }
        return send(res, 200, await renderManage(env, path, user), 'text/html; charset=utf-8', headers);
      }

      if (path === '/api/public/contact' && req.method === 'POST') {
        const b = await readBody(req);
        if (String(b.message ?? '').length < 20) throw new HttpError(400, 'Mesajul trebuie să aibă cel puțin 20 de caractere');
        await store.fresh();
        await store.create({...SYSTEM, name: 'Formular site'}, 'cereri', {name: b.name, email: b.email, phone: b.phone, subject: b.subject, message: b.message});
        return send(res, 303, '', 'text/plain', {location: '/contact/?trimis=1'});
      }

      if (path.startsWith('/media/')) {
        const rel = normalize(path.slice('/media/'.length));
        if (rel.startsWith('..')) throw new HttpError(404, 'Nu există');
        const data = await readFile(join(mediaDir, rel)).catch(() => null);
        if (!data) throw new HttpError(404, 'Nu există');
        return send(res, 200, data, MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream', {'cache-control': 'public, max-age=31536000, immutable'});
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metodă nepermisă');

      const redirect = await db.get('SELECT to_path, code FROM redirects WHERE from_path = ?', [path]);
      if (redirect?.to_path) return send(res, redirect.code, '', 'text/plain', {location: redirect.to_path + url.search});
      // Bara de la final, ca pe site-ul vechi; adresele vechi WordPress dau 404 (§3.8).
      if (!path.endsWith('/') && !extname(path)) return send(res, 301, '', 'text/plain', {location: `${path}/${url.search}`});

      const out = await sync.get(path);
      return send(res, out.status, out.html, 'text/html; charset=utf-8', out.status === 200
        ? {'cache-control': PUBLIC_CACHE, 'cdn-cache-control': CDN_CACHE, 'vercel-cache-tag': cacheTag(path)}
        : {'cache-control': 'public, max-age=0, s-maxage=60'});
    } catch (e) {
      const status = e.status ?? 500;
      if (status === 500) console.error(e);
      if (path.startsWith('/api/')) return send(res, status, {error: e.message, errors: e.errors, usedBy: e.usedBy, current: e.current});
      return send(res, status, `<!doctype html><meta charset="utf-8"><title>${status}</title><link rel="stylesheet" href="/manage/assets/manage.css">
<main class="login"><h1>${status}</h1><p>${String(e.message).replace(/</g, '&lt;')}</p><p><a href="/manage/">Înapoi la panou</a></p></main>`, 'text/html; charset=utf-8');
    }
  }

  return {...env, handle};
}

// Eticheta de cache a unei adrese (pentru golirea exactă la propagare).
export const cacheTag = path => `p:${path}`.slice(0, 256);
