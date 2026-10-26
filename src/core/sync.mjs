// Propagarea (§3.4, §3.5): din eveniment → paginile afectate, cu motiv → ies din cache → se refac.
import {createHash} from 'node:crypto';
import {nowIso} from './db.mjs';
import {byKey, linkFieldsOf} from '../registry/entities.mjs';
import {createContext} from '../site/context.mjs';
import {renderPath, publicPaths} from '../site/render.mjs';

const RENDER_NOW = 150;
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 30_000;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Contează pentru un link: creare, ștergere, altă stare, altă adresă sau un câmp din linkFields schimbat.
export function linkMatters(d, before, after) {
  if (!before || !after) return true;
  if (before.status !== after.status || !same(before.paths, after.paths)) return true;
  return linkFieldsOf(d).some(f => !same(before.vals?.[f], after.vals?.[f]));
}

function queryMatters(fields, before, after) {
  if (!before || !after || before.status !== after.status) return true;
  return fields.some(f => !same(before.vals?.[f], after.vals?.[f]));
}

const REASONS = {
  page: () => 'pagina proprie',
  direct: r => `${r.component || 'pagina'}: ${r.reason || 'citire directă'}`,
  list: r => `lista din «${r.component}»${r.reason ? ` (${r.reason})` : ''}`,
  query: r => `lista «${r.component}»${r.scope ? ` (${r.scope})` : ''}`,
  link: r => `link în «${r.component}»`,
  media: r => `imagine în «${r.component}»`,
  pending: () => 'așteaptă publicarea'
};

// `onInvalidate(paths)`: după ce un eveniment a refăcut pagini (de exemplu golirea cache-ului CDN pentru exact acele adrese).
export function createSync(db, store, {render = renderPath, renderNow = RENDER_NOW, onError = () => {}, onInvalidate = async () => {}} = {}) {
  // Cache-ul din memorie e valabil doar pentru versiunea datelor din care a fost randat.
  const cache = new Map();
  let running = false;

  async function writeDeps(path, deps) {
    await db.run('DELETE FROM page_deps WHERE path = ?', [path]);
    const seen = new Set(), rows = [];
    for (const d of deps) {
      const k = [d.kind, d.entity, d.entity_id, d.component, d.scope, d.fields].join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push([path, d.entity, d.entity_id, d.kind, d.component ?? '', d.scope ?? '', d.fields, d.reason ?? '']);
    }
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      await db.run(`INSERT INTO page_deps (path, entity, entity_id, kind, component, scope, fields, reason) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`, chunk.flat());
    }
    return rows.length;
  }

  const renderNowSync = path => { const ctx = createContext(store); return {ctx, out: render(ctx, store, path)}; };

  // Randează o adresă și rescrie dependențele ei (și ale componentelor comune) într-o tranzacție.
  async function renderAndIndex(path) {
    const {ctx, out} = renderNowSync(path);
    await db.tx(async () => {
      if (out.status !== 200) {
        await db.run('DELETE FROM page_deps WHERE path = ?', [path]);
        await db.run('DELETE FROM page_index WHERE path = ?', [path]);
        return;
      }
      for (const [name, l] of ctx.layouts) await writeDeps(`#layout:${name}`, l.deps);
      const n = await writeDeps(path, ctx.deps);
      await db.run(`INSERT INTO page_index (path, owner_entity, owner_id, title, status, rendered_at, hash, deps, error, stale)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
        ON CONFLICT (path) DO UPDATE SET owner_entity = excluded.owner_entity, owner_id = excluded.owner_id, title = excluded.title,
          status = excluded.status, rendered_at = excluded.rendered_at, hash = excluded.hash, deps = excluded.deps, error = NULL, stale = 0`,
        [path, out.owner?.[0] ?? null, out.owner?.[1] ?? null, out.title ?? null, out.status, nowIso(), createHash('sha1').update(out.html).digest('hex'), n]);
    });
    if (out.status === 200) cache.set(path, {out, version: store.version}); else cache.delete(path);
    return out;
  }

  // Pagina din cache sau, dacă datele s-au schimbat, randată din nou. Dependențele se rescriu doar dacă lipsesc sau sunt vechi.
  async function get(path) {
    await store.fresh();
    const c = cache.get(path);
    if (c && c.version === store.version) return c.out;
    const idx = await db.get('SELECT stale FROM page_index WHERE path = ?', [path]);
    const {out} = renderNowSync(path);
    if (out.status === 200 && (!idx || idx.stale)) return renderAndIndex(path);
    if (out.status !== 200 && idx) return renderAndIndex(path);
    if (out.status === 200) cache.set(path, {out, version: store.version});
    return out;
  }

  async function affected(ev) {
    const out = new Map();
    const add = (path, reason) => { if (!out.has(path)) out.set(path, reason); };
    const p = ev.payload ? JSON.parse(ev.payload) : {};
    const {before = null, after = null, touched = []} = p;

    if (ev.action === 'global' || !ev.entity) {
      for (const r of await db.all("SELECT path FROM page_index WHERE path NOT LIKE '#%'")) add(r.path, 'modificare globală');
      return out;
    }

    // Un eveniment în masă (confirmarea legăturilor) poartă mai multe înregistrări; fiecare se tratează la fel.
    const records = p.records ?? [{key: ev.entity, id: ev.entity_id, before, after}];
    for (const rec of records) {
      const d = byKey[rec.key];
      const lm = linkMatters(d, rec.before, rec.after);
      for (const r of await db.all('SELECT * FROM page_deps WHERE entity = ? AND entity_id = ?', [rec.key, rec.id])) {
        if (r.kind === 'link' && !lm) continue;
        if (r.kind === 'layout' || r.kind === 'query') continue;
        add(r.path, REASONS[r.kind](r));
      }
      const scopes = new Set([...(rec.before?.scopes ?? []), ...(rec.after?.scopes ?? [])]);
      for (const q of await db.all("SELECT * FROM page_deps WHERE entity = ? AND kind = 'query'", [rec.key])) {
        if (q.scope ? scopes.has(q.scope) : (q.fields == null || queryMatters(JSON.parse(q.fields), rec.before, rec.after))) add(q.path, REASONS.query(q));
      }
      for (const path of [...(rec.before?.paths ?? []), ...(rec.after?.paths ?? [])]) add(path, 'adresa proprie');
    }

    for (const t of touched) {
      const [k, id] = t.split(':');
      for (const r of await db.all("SELECT path FROM page_deps WHERE entity = ? AND entity_id = ? AND kind = 'page'", [k, Number(id)]))
        add(r.path, `capătul relației (${t})`);
    }

    // Componentele comune atinse se extind la toate paginile care le folosesc.
    for (const [path, reason] of [...out]) {
      if (!path.startsWith('#layout:')) continue;
      out.delete(path);
      const name = path.slice('#layout:'.length);
      for (const r of await db.all("SELECT DISTINCT path FROM page_deps WHERE kind = 'layout' AND component = ?", [name]))
        add(r.path, `${name} — ${reason}`);
    }
    return out;
  }

  const log = (eventId, path, action, detail) =>
    db.run('INSERT INTO sync_log (event_id, at, path, action, detail) VALUES (?, ?, ?, ?, ?)', [eventId, nowIso(), path, action, detail ?? null]);

  async function processEvent(ev) {
    await store.fresh();
    const pages = await affected(ev);
    await db.tx(async () => {
      for (const [path, reason] of pages) {
        await db.run('UPDATE page_index SET stale = 1 WHERE path = ?', [path]);
        await log(ev.id, path, 'invalidated', reason);
      }
    });
    for (const path of pages.keys()) cache.delete(path);

    const failures = [];
    let n = 0;
    for (const [path, reason] of pages) {
      if (n++ >= renderNow) continue; // restul se randează la prima cerere
      try {
        const out = await renderAndIndex(path);
        await log(ev.id, path, out.status === 200 ? 'rendered' : 'removed', reason);
      } catch (e) {
        failures.push(`${path}: ${e.message}`);
        await db.run('UPDATE page_index SET error = ? WHERE path = ?', [e.message, path]);
        await log(ev.id, path, 'failed', e.message);
        onError(e, path);
      }
    }
    for (const r of await db.all('SELECT from_path FROM redirects WHERE created_at >= ?', [ev.at]))
      if (!pages.has(r.from_path)) await log(ev.id, r.from_path, 'redirect', '301 automat');

    if (failures.length) {
      await db.run("UPDATE change_events SET status = 'failed', attempts = attempts + 1, last_error = ?, processed_at = ?, affected = ? WHERE id = ?",
        [failures.join('\n'), nowIso(), pages.size, ev.id]);
    } else {
      await db.run("UPDATE change_events SET status = 'done', last_error = NULL, processed_at = ?, affected = ? WHERE id = ?", [nowIso(), pages.size, ev.id]);
    }
    if (pages.size) await Promise.resolve(onInvalidate([...pages.keys()])).catch(e => onError(e, 'cdn'));
    return {pages, failures};
  }

  // Evenimentele în ordine; cele eșuate se reiau de cel mult 5 ori, cu pauză crescătoare (30 s × 2ⁿ).
  async function process({now = Date.now()} = {}) {
    if (running) return 0;
    running = true;
    let done = 0;
    try {
      const events = await db.all("SELECT * FROM change_events WHERE status = 'pending' OR (status = 'failed' AND attempts < ?) ORDER BY id", [MAX_ATTEMPTS]);
      for (const ev of events) {
        if (ev.status === 'failed' && now < Date.parse(ev.processed_at) + BACKOFF_MS * 2 ** (ev.attempts - 1)) continue;
        await processEvent(ev);
        done++;
      }
    } finally {
      running = false;
    }
    return done;
  }

  // „Reia” din Panou: fără pauză, indiferent de numărul încercărilor.
  async function retry(id) {
    const ev = await db.get('SELECT * FROM change_events WHERE id = ?', [id]);
    if (!ev) return null;
    await processEvent(ev);
    return db.get('SELECT * FROM change_events WHERE id = ?', [id]);
  }

  // Randează toate adresele publice, rescrie indexul și scoate adresele care nu mai există (§3.5).
  async function scan() {
    await store.fresh();
    const paths = publicPaths(store);
    const errors = [];
    for (const p of paths) {
      try { await renderAndIndex(p); } catch (e) { errors.push(`${p}: ${e.message}`); }
    }
    await db.tx(async () => {
      const keep = new Set(paths);
      for (const r of await db.all("SELECT path FROM page_index WHERE path NOT LIKE '#%'")) {
        if (keep.has(r.path)) continue;
        await db.run('DELETE FROM page_index WHERE path = ?', [r.path]);
        await db.run('DELETE FROM page_deps WHERE path = ?', [r.path]);
        cache.delete(r.path);
      }
      // Evenimentele în așteptare sunt acoperite de scanare.
      await db.run("UPDATE change_events SET status = 'done', processed_at = ?, last_error = 'acoperit de scanare' WHERE status = 'pending'", [nowIso()]);
      await db.run("INSERT INTO meta (key, value) VALUES ('last_scan', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [nowIso()]);
    });
    if (paths.length) await Promise.resolve(onInvalidate(paths)).catch(e => onError(e, 'cdn'));
    return {pages: paths.length, errors};
  }

  async function status() {
    const one = async sql => (await db.get(sql)) ?? {};
    return {
      pending: (await one("SELECT COUNT(*) AS n FROM change_events WHERE status = 'pending'")).n,
      failed: (await one("SELECT COUNT(*) AS n FROM change_events WHERE status = 'failed'")).n,
      pages: (await one("SELECT COUNT(*) AS n FROM page_index WHERE path NOT LIKE '#%'")).n,
      stale: (await one('SELECT COUNT(*) AS n FROM page_index WHERE stale = 1')).n,
      errors: (await one('SELECT COUNT(*) AS n FROM page_index WHERE error IS NOT NULL')).n,
      deps: (await one('SELECT COUNT(*) AS n FROM page_deps')).n,
      lastProcessed: (await one("SELECT MAX(processed_at) AS at FROM change_events WHERE status = 'done'")).at ?? null,
      lastScan: (await one("SELECT value FROM meta WHERE key = 'last_scan'")).value ?? null
    };
  }

  async function nightly() {
    const last = (await db.get("SELECT value FROM meta WHERE key = 'last_scan'"))?.value;
    if (new Date().getHours() === 3 && (!last || Date.now() - Date.parse(last) > 20 * 3600_000)) await scan();
  }

  // Pe un server permanent: imediat după COMMIT, apoi la fiecare minut; scanare o dată pe noapte.
  async function start() {
    const off = store.onChange(() => setImmediate(() => process().catch(e => onError(e, 'process'))));
    const minute = setInterval(() => { process().then(nightly).catch(e => onError(e, 'tick')); }, 60_000);
    minute.unref();
    if (!await db.get('SELECT 1 AS x FROM page_index LIMIT 1')) await scan();
    await process();
    return () => { off(); clearInterval(minute); };
  }

  // Pentru găzduire fără server permanent (Vercel Cron): același lucru, la cerere (§3.7).
  async function tick() {
    const processed = await process();
    await nightly();
    return {processed, ...await status()};
  }

  return {get, affected, process, retry, scan, status, start, tick, renderAndIndex, cache};
}
