// Baza: aceeași interfață asincronă peste SQLite (node:sqlite, local și teste) și Postgres (Supabase, producție).
// SQL-ul se scrie cu „?”; adaptorul Postgres îl traduce în $1, $2…
// Tranzacțiile sunt reale pe ambele; afterCommit rulează doar după COMMIT (§3.3).
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {ENTITIES, byKey, relTable, JSON_TYPES} from '../registry/entities.mjs';

export const nowIso = () => new Date().toISOString();

const isPg = url => /^postgres(ql)?:\/\//.test(String(url ?? ''));

// Deschide baza după adresă: postgres://… → Postgres; altfel o cale de fișier sau ':memory:' → SQLite.
export async function openDb(url = process.env.DATABASE_URL ?? 'data/purapa.db') {
  return isPg(url) ? openPg(url) : openSqlite(url);
}

function common(db) {
  const als = new AsyncLocalStorage();
  db.inTx = () => !!als.getStore();
  db.afterCommit = cb => { const s = als.getStore(); if (s) s.after.push(cb); else cb(); };
  return als;
}

function openSqlite(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), {recursive: true});
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  let lock = Promise.resolve();
  const db = {dialect: 'sqlite', raw};
  const als = common(db);
  const stmt = sql => raw.prepare(sql);
  Object.assign(db, {
    async get(sql, params = []) { return stmt(sql).get(...params) ?? null; },
    async all(sql, params = []) { return stmt(sql).all(...params); },
    async run(sql, params = []) { const r = stmt(sql).run(...params); return {changes: Number(r.changes)}; },
    async insert(sql, params = []) { return Number(stmt(sql).run(...params).lastInsertRowid); },
    async exec(sql) { raw.exec(sql); },
    // O singură conexiune: tranzacțiile se pun la coadă, ca să nu se întrepătrundă între cereri.
    async tx(fn) {
      if (als.getStore()) return fn();
      const prev = lock;
      let release;
      lock = new Promise(r => { release = r; });
      await prev;
      const state = {after: []};
      try {
        raw.exec('BEGIN IMMEDIATE');
        let result;
        try {
          result = await als.run(state, fn);
          raw.exec('COMMIT');
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        }
        for (const cb of state.after) cb();
        return result;
      } finally {
        release();
      }
    },
    async columns(table) { return raw.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name); },
    async close() { raw.close(); }
  });
  return db;
}

async function openPg(url) {
  const {default: pg} = await import('pg');
  pg.types.setTypeParser(20, v => v == null ? null : Number(v));     // bigint (COUNT, SUM)
  pg.types.setTypeParser(1700, v => v == null ? null : Number(v));   // numeric
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: local ? false : {rejectUnauthorized: false}});
  // `options=-c search_path=…` din adresă, aplicat și explicit (unele servere ignoră parametrul de pornire).
  const schema = /search_path=([a-z_][a-z0-9_]*)/i.exec(decodeURIComponent(url))?.[1];
  if (schema) pool.on('connect', c => { c.query(`SET search_path TO ${schema}`).catch(() => {}); });
  const db = {dialect: 'pg', pool};
  const als = common(db);
  const toPg = sql => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const client = () => als.getStore()?.client ?? pool;
  const q = (sql, params = []) => client().query(toPg(sql), params);
  Object.assign(db, {
    async get(sql, params) { return (await q(sql, params)).rows[0] ?? null; },
    async all(sql, params) { return (await q(sql, params)).rows; },
    async run(sql, params) { return {changes: (await q(sql, params)).rowCount}; },
    async insert(sql, params) { return (await q(`${sql} RETURNING id`, params)).rows[0].id; },
    async exec(sql) { await client().query(sql); },
    async tx(fn) {
      if (als.getStore()) return fn();
      const c = await pool.connect();
      const state = {after: [], client: c};
      try {
        await c.query('BEGIN');
        let result;
        try {
          result = await als.run(state, fn);
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        }
        for (const cb of state.after) cb();
        return result;
      } finally {
        c.release();
      }
    },
    async columns(table) {
      return (await q("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?", [table])).rows.map(r => r.column_name);
    },
    async close() { await pool.end(); }
  });
  return db;
}

// Câteva diferențe de dialect, rezolvate într-un singur loc.
const T = {
  sqlite: {id: 'id INTEGER PRIMARY KEY AUTOINCREMENT', real: 'REAL'},
  pg: {id: 'id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY', real: 'DOUBLE PRECISION'}
};
const dialectSql = (db, sql) => sql.replaceAll('{{ID}}', T[db.dialect].id).replaceAll('{{REAL}}', T[db.dialect].real);

const SYSTEM_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  {{ID}},
  kind TEXT NOT NULL CHECK (kind IN ('site','endpoint','repo','document','manual')),
  url TEXT NOT NULL UNIQUE, title TEXT, fetched_at TEXT, method TEXT, snapshot_file TEXT, status INTEGER, note TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provenance (
  {{ID}}, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, field TEXT NOT NULL DEFAULT '',
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, excerpt TEXT, method TEXT,
  certainty TEXT NOT NULL DEFAULT 'confirmed' CHECK (certainty IN ('confirmed','inferred','unverified','unrecoverable')),
  confidence {{REAL}}, verified_at TEXT, verified_by TEXT, created_at TEXT NOT NULL,
  UNIQUE (entity, entity_id, field, source_id));
CREATE INDEX IF NOT EXISTS ix_provenance_entity ON provenance (entity, entity_id);
CREATE TABLE IF NOT EXISTS link_dismissals (
  relation TEXT NOT NULL, src_id INTEGER NOT NULL, dst_id INTEGER NOT NULL, evidence TEXT,
  at TEXT NOT NULL, by TEXT, PRIMARY KEY (relation, src_id, dst_id));
CREATE TABLE IF NOT EXISTS aliases (
  entity TEXT NOT NULL, entity_id INTEGER NOT NULL, alias TEXT NOT NULL, learned_from TEXT, at TEXT NOT NULL,
  PRIMARY KEY (entity, alias));
CREATE TABLE IF NOT EXISTS page_index (
  path TEXT PRIMARY KEY, owner_entity TEXT, owner_id INTEGER, title TEXT, status INTEGER, rendered_at TEXT,
  hash TEXT, deps INTEGER, error TEXT, stale INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS page_deps (
  path TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER,
  kind TEXT NOT NULL, component TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '',
  fields TEXT, reason TEXT);
CREATE INDEX IF NOT EXISTS ix_page_deps_entity ON page_deps (entity, entity_id);
CREATE INDEX IF NOT EXISTS ix_page_deps_path ON page_deps (path);
CREATE INDEX IF NOT EXISTS ix_page_deps_layout ON page_deps (kind, component);
CREATE TABLE IF NOT EXISTS change_events (
  {{ID}}, at TEXT NOT NULL, user_name TEXT, action TEXT NOT NULL, entity TEXT, entity_id INTEGER,
  label TEXT, payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, processed_at TEXT, affected INTEGER);
CREATE INDEX IF NOT EXISTS ix_change_events_status ON change_events (status, id);
CREATE TABLE IF NOT EXISTS sync_log (
  {{ID}}, event_id INTEGER REFERENCES change_events(id) ON DELETE CASCADE, at TEXT NOT NULL,
  path TEXT, action TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS ix_sync_log_event ON sync_log (event_id);
CREATE TABLE IF NOT EXISTS audit_log ({{ID}}, at TEXT NOT NULL, user_id INTEGER, user_name TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id INTEGER, label TEXT, changes TEXT, reverted_by INTEGER);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log (entity, entity_id);
CREATE TABLE IF NOT EXISTS validations (entity TEXT NOT NULL, entity_id INTEGER NOT NULL, fp TEXT NOT NULL, user_name TEXT,
  at TEXT NOT NULL, comment TEXT, PRIMARY KEY (entity, entity_id));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  {{ID}}, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')), password TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT);
CREATE TABLE IF NOT EXISTS login_attempts ({{ID}}, email TEXT, ip TEXT, at TEXT NOT NULL, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_login_attempts_at ON login_attempts (at);
CREATE TABLE IF NOT EXISTS redirects (
  from_path TEXT PRIMARY KEY, to_path TEXT, to_ref TEXT, code INTEGER NOT NULL DEFAULT 301,
  auto INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
`;

function columnSql(db, f) {
  if (f.type === 'ref' || f.type === 'image') {
    const target = f.type === 'image' ? byKey.media : byKey[f.target];
    return `"${f.key}" INTEGER REFERENCES "${target.table}"(id) ON DELETE ${f.required ? 'RESTRICT' : 'SET NULL'}`;
  }
  if (f.type === 'int' || f.type === 'boolean') return `"${f.key}" INTEGER`;
  if (f.type === 'number' || f.type === 'money') return `"${f.key}" ${T[db.dialect].real}`;
  if (JSON_TYPES.has(f.type)) return `"${f.key}" TEXT`;
  return `"${f.key}" TEXT`;
}

const BASE_COLUMNS = (db, d) => [
  T[db.dialect].id,
  ...(d.noStatus ? [] : ["status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'))", 'draft TEXT', 'published_at TEXT']),
  'search TEXT', 'version INTEGER NOT NULL DEFAULT 1',
  'created_at TEXT NOT NULL', 'updated_at TEXT NOT NULL', 'created_by TEXT', 'updated_by TEXT'
];

// Migrarea doar adaugă (tabele, coloane, indecși), deci rulează sigur la fiecare pornire.
export async function migrate(db, entities = ENTITIES) {
  for (const stmt of dialectSql(db, SYSTEM_SQL).split(';').map(s => s.trim()).filter(Boolean)) await db.exec(stmt);
  // Tabelele întâi fără chei străine spre tabele încă inexistente: Postgres le cere existente.
  for (const d of entities) {
    const cols = d.fields.filter(f => f.type !== 'refs');
    const plain = cols.filter(f => f.type !== 'ref' && f.type !== 'image');
    await db.exec(`CREATE TABLE IF NOT EXISTS "${d.table}" (${[...BASE_COLUMNS(db, d), ...plain.map(f => columnSql(db, f))].join(', ')})`);
  }
  for (const d of entities) {
    const cols = d.fields.filter(f => f.type !== 'refs');
    const existing = new Set(await db.columns(d.table));
    for (const f of cols) if (!existing.has(f.key)) await db.exec(`ALTER TABLE "${d.table}" ADD COLUMN ${columnSql(db, f)}`);
    for (const f of cols) {
      if (f.unique || f.type === 'slug') await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_${d.table}_${f.key}" ON "${d.table}" ("${f.key}")`);
      else if (f.type === 'ref' || f.type === 'image') await db.exec(`CREATE INDEX IF NOT EXISTS "ix_${d.table}_${f.key}" ON "${d.table}" ("${f.key}")`);
    }
  }
  for (const d of entities) {
    for (const f of d.fields.filter(f => f.type === 'refs')) {
      const t = relTable(d, f), target = byKey[f.target];
      await db.exec(`CREATE TABLE IF NOT EXISTS "${t}" (
        src_id INTEGER NOT NULL REFERENCES "${d.table}"(id) ON DELETE CASCADE,
        dst_id INTEGER NOT NULL REFERENCES "${target.table}"(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','inferred','unverified')),
        confidence ${T[db.dialect].real},
        source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL, note TEXT,
        attrs TEXT,
        created_at TEXT, created_by TEXT,
        PRIMARY KEY (src_id, dst_id)${target.table === d.table ? ', CHECK (src_id <> dst_id)' : ''})`);
      await db.exec(`CREATE INDEX IF NOT EXISTS "ix_${t}_dst" ON "${t}" (dst_id)`);
    }
  }
}
