// Creează un cont în baza din DATABASE_URL (sau data/purapa.db):
//   npm run user -- <email> <nume> <rol: admin|editor|viewer>
// Parola se cere în terminal (nu apare în istoricul comenzilor); cel puțin 10 caractere.
import {createInterface} from 'node:readline/promises';
import {openDb, migrate} from '../src/core/db.mjs';
import {createAuth} from '../src/auth/auth.mjs';

const [email, name, role = 'admin'] = process.argv.slice(2);
if (!email || !name) {
  console.error('Folosire: npm run user -- <email> "<nume>" [admin|editor|viewer]');
  process.exit(1);
}
const rl = createInterface({input: process.stdin, output: process.stdout, terminal: true});
const password = process.env.USER_PASSWORD ?? await rl.question('Parola (cel puțin 10 caractere): ');
rl.close();
const db = await openDb();
await migrate(db);
try {
  const u = await createAuth(db).createUser({email, name, role, password});
  console.log(`Cont creat: ${u.name} <${u.email}>, rol ${u.role}.`);
} catch (e) {
  console.error(e.errors ? `${e.message}: ${JSON.stringify(e.errors)}` : e.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
