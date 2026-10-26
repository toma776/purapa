// Randează toate adresele publice și rescrie indexul și dependențele (§3.5).
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';
import {createSync} from '../src/core/sync.mjs';

const db = await openDb();
await migrate(db);
const store = createStore(db);
const result = await createSync(db, store).scan();
console.log(`${result.pages} pagini scanate${result.errors.length ? `, erori:\n${result.errors.join('\n')}` : ''}.`);
await db.close();
