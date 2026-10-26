// Importă datele inițiale într-o bază nouă, apoi scanează tot site-ul (§1.3, etapele import + scan).
// Baza: DATABASE_URL (postgres://… pentru Supabase) sau data/purapa.db.
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';
import {createSync} from '../src/core/sync.mjs';
import {seed} from '../src/import/seed.mjs';

const db = await openDb();
await migrate(db);
const store = createStore(db);
await store.load();
await seed(store);
const result = await createSync(db, store).scan();
console.log(`Import gata: ${result.pages} pagini scanate${result.errors.length ? `, erori:\n${result.errors.join('\n')}` : ''}.`);
await db.close();
