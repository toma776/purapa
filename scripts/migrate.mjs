// Aplică schema (doar adaugă: tabele, coloane, indecși) pe baza din DATABASE_URL. Rulează la fiecare deploy pe Vercel.
import {openDb, migrate} from '../src/core/db.mjs';

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL lipsește: migrarea se sare (build fără bază).');
  process.exit(0);
}
const db = await openDb(process.env.DATABASE_URL);
await migrate(db);
await db.close();
console.log('Schema e la zi.');
