// Propagarea (§3.4, §3.5): din eveniment → paginile afectate, cu motiv → ies din cache → se refac.
import {createHash} from 'node:crypto';
import {tx, nowIso} from './db.mjs';
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

export function createSync(db, store, {render = renderPath, renderNow = RENDER_NOW, onError = () => {}} = {}) {
  const cache = new Map();
  let running = false;

  function writeDeps(path, deps) {
    db.prepare('DELETE FROM page_deps WHERE path = ?').run(path);
    const ins = db.prepare('INSERT INTO page_deps (path, entity, entity_id, kind, component, scope, fields, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const seen = new Set();
    for (const d of deps) {
      const k = [d.kind, d.entity, d.entity_id, d.component, d.scope, d.fields].join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      ins.run(path, d.entity, d.entity_id, d.kind, d.component ?? '', d.scope ?? '', d.fields, d.reason ?? '');
    }
    return seen.size;
  }

  // Randează o adresă și rescrie dependențele ei (și ale componentelor comune) într-o tranzacție.
  function renderAndIndex(path) {
    const ctx = createContext(store);
    const out = render(ctx, store, path);
    tx(db, () => {
      for (const [name, l] of ctx.layouts) writeDeps(`#layout:${name}`, l.deps);
      if (out.status !== 200) {
        db.prepare('DELETE FROM page_deps WHERE path = ?').run(path);
        db.prepare('DELETE FROM page_index WHERE path = ?').run(path);
        return;
      }
      const n = writeDeps(path, ctx.deps);
      db.prepare(`INSERT INTO page_index (path, owner_entity, owner_id, title, status, rendered_at, hash, deps, error, stale)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
        ON CONFLICT (path) DO UPDATE SET owner_entity = excluded.owner_entity, owner_id = excluded.owner_id, title = excluded.title,
          status = excluded.status, rendered_at = excluded.rendered_at, hash = excluded.hash, deps = excluded.deps, error = NULL, stale = 0`)
        .run(path, out.owner?.[0] ?? null, out.owner?.[1] ?? null, out.title ?? null, out.status, nowIso(),
          createHash('sha1').update(out.html).digest('hex'), n);
    });
    if (out.status === 200) cache.set(path, out); else cache.delete(path);
    return out;
  }

  // Pagina din cache sau, la prima cerere, randată și indexată.
  function get(path) {
    return cache.get(path) ?? renderAndIndex(path);
  }

  function affected(ev) {
    const out = new Map();
    const add = (path, reason) => { if (!out.has(path)) out.set(path, reason); };
    const p = ev.payload ? JSON.parse(ev.payload) : {};
    const {before = null, after = null, touched = []} = p;

    if (ev.action === 'global' || !ev.entity) {
      for (const r of db.prepare("SELECT path FROM page_index WHERE path NOT LIKE '#%'").all()) add(r.path, 'modificare globală');
      return out;
    }
    // Un eveniment în masă (confirmarea legăturilor) poartă mai multe înregistrări; fiecare se tratează la fel.
    const records = p.records ?? [{key: ev.entity, id: ev.entity_id, before, after}];
    for (const rec of records) {
      const d = byKey[rec.key];
      const lm = linkMatters(d, rec.before, rec.after);
      for (const r of db.prepare('SELECT * FROM page_deps WHERE entity = ? AND entity_id = ?').all(rec.key, rec.id)) {
        if (r.kind === 'link' && !lm) continue;
        if (r.kind === 'layout' || r.kind === 'query') continue;
        add(r.path, REASONS[r.kind](r));
      }

      const scopes = new Set([...(rec.before?.scopes ?? []), ...(rec.after?.scopes ?? [])]);
      for (const q of db.prepare("SELECT * FROM page_deps WHERE entity = ? AND kind = 'query'").all(rec.key)) {
        if (q.scope ? scopes.has(q.scope) : (q.fields == null || queryMatters(JSON.parse(q.fields), rec.before, rec.after))) add(q.path, REASONS.query(q));
      }

      for (const path of [...(rec.before?.paths ?? []), ...(rec.after?.paths ?? [])]) add(path, 'adresa proprie');
    }

    for (const t of touched) {
      const [k, id] = t.split(':');
      for (const r of db.prepare("SELECT path FROM page_deps WHERE entity = ? AND entity_id = ? AND kind = 'page'").all(k, Number(id)))
        add(r.path, `capătul relației (${t})`);
    }

    // Componentele comune atinse se extind la toate paginile care le folosesc.
    for (const [path, reason] of [...out]) {
      if (!path.startsWith('#layout:')) continue;
      out.delete(path);
      const name = path.slice('#layout:'.length);
      for (const r of db.prepare("SELECT DISTINCT path FROM page_deps WHERE kind = 'layout' AND component = ?").all(name))
        add(r.path, `${name} — ${reason}`);
    }
    return out;
  }

  function log(eventId, path, action, detail) {
    db.prepare('INSERT INTO sync_log (event_id, at, path, action, detail) VALUES (?, ?, ?, ?, ?)').run(eventId, nowIso(), path, action, detail ?? null);
  }

  function processEvent(ev) {
    const pages = affected(ev);
    tx(db, () => {
      const mark = db.prepare('UPDATE page_index SET stale = 1 WHERE path = ?');
      for (const [path, reason] of pages) { mark.run(path); log(ev.id, path, 'invalidated', reason); }
    });
    for (const path of pages.keys()) cache.delete(path);

    const failures = [];
    let n = 0;
    for (const [path, reason] of pages) {
      if (n++ >= renderNow) continue; // restul se randează la prima cerere
      try {
        const out = renderAndIndex(path);
        log(ev.id, path, out.status === 200 ? 'rendered' : 'removed', reason);
      } catch (e) {
        failures.push(`${path}: ${e.message}`);
        db.prepare('UPDATE page_index SET error = ? WHERE path = ?').run(e.message, path);
        log(ev.id, path, 'failed', e.message);
        onError(e, path);
      }
    }
    const redirects = db.prepare('SELECT from_path FROM redirects WHERE created_at >= ?').all(ev.at);
    for (const r of redirects) if (!pages.has(r.from_path)) log(ev.id, r.from_path, 'redirect', '301 automat');

    if (failures.length) {
      db.prepare("UPDATE change_events SET status = 'failed', attempts = attempts + 1, last_error = ?, processed_at = ?, affected = ? WHERE id = ?")
        .run(failures.join('\n'), nowIso(), pages.size, ev.id);
    } else {
      db.prepare("UPDATE change_events SET status = 'done', last_error = NULL, processed_at = ?, affected = ? WHERE id = ?")
        .run(nowIso(), pages.size, ev.id);
    }
    return {pages, failures};
  }

  // Evenimentele în ordine; cele eșuate se reiau de cel mult 5 ori, cu pauză crescătoare (30 s × 2ⁿ).
  function process({now = Date.now()} = {}) {
    if (running) return 0;
    running = true;
    let done = 0;
    try {
      const events = db.prepare("SELECT * FROM change_events WHERE status = 'pending' OR (status = 'failed' AND attempts < ?) ORDER BY id").all(MAX_ATTEMPTS);
      for (const ev of events) {
        if (ev.status === 'failed' && now < Date.parse(ev.processed_at) + BACKOFF_MS * 2 ** (ev.attempts - 1)) continue;
        processEvent(ev);
        done++;
      }
    } finally {
      running = false;
    }
    return done;
  }

  // „Reia” din Panou: fără pauză, indiferent de numărul încercărilor.
  function retry(id) {
    const ev = db.prepare('SELECT * FROM change_events WHERE id = ?').get(id);
    if (!ev) return null;
    processEvent(ev);
    return db.prepare('SELECT * FROM change_events WHERE id = ?').get(id);
  }

  // Randează toate adresele publice, rescrie indexul și scoate adresele care nu mai există (§3.5).
  function scan() {
    const paths = publicPaths(store);
    const errors = [];
    for (const p of paths) {
      try { renderAndIndex(p); } catch (e) { errors.push(`${p}: ${e.message}`); }
    }
    tx(db, () => {
      const keep = new Set(paths);
      for (const r of db.prepare("SELECT path FROM page_index WHERE path NOT LIKE '#%'").all()) {
        if (keep.has(r.path)) continue;
        db.prepare('DELETE FROM page_index WHERE path = ?').run(r.path);
        db.prepare('DELETE FROM page_deps WHERE path = ?').run(r.path);
        cache.delete(r.path);
      }
      // Evenimentele în așteptare sunt acoperite de scanare.
      db.prepare("UPDATE change_events SET status = 'done', processed_at = ?, last_error = 'acoperit de scanare' WHERE status = 'pending'").run(nowIso());
      db.prepare("INSERT INTO meta (key, value) VALUES ('last_scan', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(nowIso());
    });
    return {pages: paths.length, errors};
  }

  function status() {
    const one = sql => db.prepare(sql).get();
    return {
      pending: one("SELECT COUNT(*) n FROM change_events WHERE status = 'pending'").n,
      failed: one("SELECT COUNT(*) n FROM change_events WHERE status = 'failed'").n,
      pages: one("SELECT COUNT(*) n FROM page_index WHERE path NOT LIKE '#%'").n,
      stale: one('SELECT COUNT(*) n FROM page_index WHERE stale = 1').n,
      errors: one('SELECT COUNT(*) n FROM page_index WHERE error IS NOT NULL').n,
      deps: one('SELECT COUNT(*) n FROM page_deps').n,
      lastProcessed: one("SELECT MAX(processed_at) at FROM change_events WHERE status = 'done'").at,
      lastScan: one("SELECT value FROM meta WHERE key = 'last_scan'")?.value ?? null
    };
  }

  // Pornește imediat după COMMIT, apoi la fiecare minut; scanare o dată pe noapte.
  function start() {
    const off = store.onChange(() => setImmediate(process));
    const minute = setInterval(() => { process(); nightly(); }, 60_000);
    minute.unref();
    if (!db.prepare('SELECT 1 FROM page_index LIMIT 1').get()) scan();
    process();
    return () => { off(); clearInterval(minute); };
  }

  function nightly() {
    const last = db.prepare("SELECT value FROM meta WHERE key = 'last_scan'").get()?.value;
    const now = new Date();
    if (now.getHours() === 3 && (!last || Date.now() - Date.parse(last) > 20 * 3600_000)) scan();
  }

  // Pentru găzduire fără server permanent: același lucru, apelat de un cron (§3.7).
  function tick() {
    const processed = process();
    nightly();
    return {processed, ...status()};
  }

  return {get, affected, process, retry, scan, status, start, tick, renderAndIndex, cache};
}
