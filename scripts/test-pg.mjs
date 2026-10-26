// Rulează toată suita de teste pe un Postgres real (PGlite: motorul Postgres în WebAssembly, fără instalare).
// Cu TEST_DATABASE_URL deja setat (de exemplu un Postgres local sau o bază Supabase de test), îl folosește pe acela.
import {spawn} from 'node:child_process';

let url = process.env.TEST_DATABASE_URL;
let stop = async () => {};
if (!url) {
  const {PGlite} = await import('@electric-sql/pglite');
  const {PGLiteSocketServer} = await import('@electric-sql/pglite-socket');
  const db = await PGlite.create();
  const port = 54329;
  const server = new PGLiteSocketServer({db, port, host: '127.0.0.1', maxConnections: 20});
  await server.start();
  url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  stop = async () => { await server.stop(); await db.close(); };
  console.log(`Postgres (PGlite) pornit pe ${port}`);
}

// PGlite are un singur proces Postgres în spate: câte o conexiune în pool și fișierele de test pe rând,
// ca tranzacțiile să nu se întrepătrundă.
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', 'test/**/*.test.mjs'], {
  stdio: 'inherit', env: {...process.env, TEST_DATABASE_URL: url, PG_POOL_MAX: process.env.PG_POOL_MAX ?? '1'}
});
child.on('exit', async code => { await stop(); process.exit(code ?? 1); });
