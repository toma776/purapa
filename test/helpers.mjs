// Baza pentru teste: SQLite în memorie implicit; cu TEST_DATABASE_URL (postgres://…), aceeași suită rulează pe Postgres,
// fiecare test în schema lui, ștearsă la final.
import {randomBytes} from 'node:crypto';
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';

export const PG_URL = process.env.TEST_DATABASE_URL ?? null;

export async function testDb(t) {
  if (!PG_URL) {
    const db = await openDb(':memory:');
    t?.after(() => db.close());
    return {db, url: ':memory:'};
  }
  const schema = `t_${randomBytes(6).toString('hex')}`;
  // Conexiunile pe rând: unele servere de test (PGlite) acceptă una singură.
  const admin = async sql => { const a = await openDb(PG_URL); try { await a.exec(sql); } finally { await a.close(); } };
  await admin(`CREATE SCHEMA ${schema}`);
  const url = `${PG_URL}${PG_URL.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
  const db = await openDb(url);
  t?.after(async () => { await db.close(); await admin(`DROP SCHEMA ${schema} CASCADE`); });
  return {db, url};
}

export async function testStore(t) {
  const {db, url} = await testDb(t);
  await migrate(db);
  const store = createStore(db);
  await store.load();
  return {db, store, url};
}
