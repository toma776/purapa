// Baza: SQLite (node:sqlite) în WAL, tranzacții cu afterCommit, migrare care doar adaugă (standard §1.1, Anexa B).
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {ENTITIES, byKey, relTable, JSON_TYPES} from '../registry/entities.mjs';

export const nowIso = () => new Date().toISOString();

const state = new WeakMap();

export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  state.set(db, {depth: 0, after: []});
  return db;
}

// O modificare = o tranzacție (§0.6). Tranzacțiile imbricate se unesc cu cea exterioară.
export function tx(db, fn) {
  const s = state.get(db);
  if (s.depth > 0) {
    s.depth++;
    try { return fn(); } finally { s.depth--; }
  }
  db.exec('BEGIN IMMEDIATE');
  s.depth = 1;
  let result;
  try {
    result = fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    s.after = [];
    throw e;
  } finally {
    s.depth = 0;
  }
  const callbacks = s.after;
  s.after = [];
  for (const cb of callbacks) cb();
  return result;
}

// Rulează după COMMIT; o tranzacție anulată nu anunță pe nimeni (§3.3).
export function afterCommit(db, cb) {
  const s = state.get(db);
  if (s.depth > 0) s.after.push(cb); else cb();
}

const SYSTEM_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('site','endpoint','repo','document','manual')),
  url TEXT NOT NULL UNIQUE, title TEXT, fetched_at TEXT, method TEXT, snapshot_file TEXT, status INTEGER, note TEXT,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, field TEXT NOT NULL DEFAULT '',
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, excerpt TEXT, method TEXT,
  certainty TEXT NOT NULL DEFAULT 'confirmed' CHECK (certainty IN ('confirmed','inferred','unverified','unrecoverable')),
  confidence REAL, verified_at TEXT, verified_by TEXT, created_at TEXT NOT NULL,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_name TEXT, action TEXT NOT NULL, entity TEXT, entity_id INTEGER,
  label TEXT, payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, processed_at TEXT, affected INTEGER);
CREATE INDEX IF NOT EXISTS ix_change_events_status ON change_events (status, id);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY, event_id INTEGER REFERENCES change_events(id) ON DELETE CASCADE, at TEXT NOT NULL,
  path TEXT, action TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS ix_sync_log_event ON sync_log (event_id);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, user_name TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id INTEGER, label TEXT, changes TEXT, reverted_by INTEGER);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log (entity, entity_id);
CREATE TABLE IF NOT EXISTS validations (entity TEXT NOT NULL, entity_id INTEGER NOT NULL, fp TEXT NOT NULL, user_name TEXT,
  at TEXT NOT NULL, comment TEXT, PRIMARY KEY (entity, entity_id));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')), password TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT);
CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY, email TEXT, ip TEXT, at TEXT NOT NULL, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_login_attempts_at ON login_attempts (at);
CREATE TABLE IF NOT EXISTS redirects (
  from_path TEXT PRIMARY KEY, to_path TEXT, to_ref TEXT, code INTEGER NOT NULL DEFAULT 301,
  auto INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
`;

function columnSql(f) {
  if (f.type === 'ref' || f.type === 'image') {
    const target = f.type === 'image' ? byKey.media : byKey[f.target];
    return `"${f.key}" INTEGER REFERENCES "${target.table}"(id) ON DELETE ${f.required ? 'RESTRICT' : 'SET NULL'}`;
  }
  if (f.type === 'int' || f.type === 'boolean') return `"${f.key}" INTEGER`;
  if (f.type === 'number' || f.type === 'money') return `"${f.key}" REAL`;
  if (JSON_TYPES.has(f.type)) return `"${f.key}" TEXT`;
  return `"${f.key}" TEXT`;
}

const BASE_COLUMNS = d => [
  'id INTEGER PRIMARY KEY AUTOINCREMENT',
  ...(d.noStatus ? [] : ["status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived'))", 'draft TEXT', 'published_at TEXT']),
  'search TEXT', 'version INTEGER NOT NULL DEFAULT 1',
  'created_at TEXT NOT NULL', 'updated_at TEXT NOT NULL', 'created_by TEXT', 'updated_by TEXT'
];

// Migrarea doar adaugă (tabele, coloane, indecși), deci rulează sigur la fiecare pornire.
export function migrate(db, entities = ENTITIES) {
  db.exec(SYSTEM_SQL);
  for (const d of entities) {
    const cols = d.fields.filter(f => f.type !== 'refs');
    db.exec(`CREATE TABLE IF NOT EXISTS "${d.table}" (${[...BASE_COLUMNS(d), ...cols.map(columnSql)].join(', ')})`);
    const existing = new Set(db.prepare(`PRAGMA table_info("${d.table}")`).all().map(c => c.name));
    for (const f of cols) if (!existing.has(f.key)) db.exec(`ALTER TABLE "${d.table}" ADD COLUMN ${columnSql(f)}`);
    for (const f of cols) {
      if (f.unique || f.type === 'slug') db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_${d.table}_${f.key}" ON "${d.table}" ("${f.key}")`);
      else if (f.type === 'ref' || f.type === 'image') db.exec(`CREATE INDEX IF NOT EXISTS "ix_${d.table}_${f.key}" ON "${d.table}" ("${f.key}")`);
    }
  }
  for (const d of entities) {
    for (const f of d.fields.filter(f => f.type === 'refs')) {
      const t = relTable(d, f), target = byKey[f.target];
      db.exec(`CREATE TABLE IF NOT EXISTS "${t}" (
        src_id INTEGER NOT NULL REFERENCES "${d.table}"(id) ON DELETE CASCADE,
        dst_id INTEGER NOT NULL REFERENCES "${target.table}"(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','inferred','unverified')),
        confidence REAL,
        source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL, note TEXT,
        attrs TEXT,
        created_at TEXT, created_by TEXT,
        PRIMARY KEY (src_id, dst_id))`);
      db.exec(`CREATE INDEX IF NOT EXISTS "ix_${t}_dst" ON "${t}" (dst_id)`);
      if (target.table === d.table) {
        db.exec(`CREATE TRIGGER IF NOT EXISTS "no_self_${t}" BEFORE INSERT ON "${t}"
          WHEN NEW.src_id = NEW.dst_id BEGIN SELECT RAISE(ABORT, 'O înregistrare nu se poate lega de ea însăși'); END`);
      }
    }
  }
}
