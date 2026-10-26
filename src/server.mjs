// Serverul local: site-ul și /manage pe http://localhost:3100.
// Cu cheia Blob în .env.local (npx vercel env pull .env.local), baza se sincronizează singură cu cea online:
// ce modifici local ajunge online în câteva secunde, iar ce s-a modificat online (formularul de contact,
// panoul online) se aduce local. Nimic nu se urcă sau se descarcă de mână.
import http from 'node:http';
import {existsSync, writeFileSync, rmSync, mkdirSync, readdirSync, copyFileSync} from 'node:fs';
import {createApp} from './app.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const port = Number(process.env.PORT ?? 3100);
const file = process.env.DB ?? 'data/purapa.db';

let app, stop, blob = null;
function open() {
  app = createApp({file, syncStatus: () => blob?.conflict ?? null});
  stop = app.sync.start();
}
open();

if (process.env.BLOB_READ_WRITE_TOKEN && !process.env.DB) {
  const {createBlobSync} = await import('./core/blobsync.mjs');
  blob = createBlobSync({
    file,
    checkpoint: () => app.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'),
    // Baza online nouă înlocuiește fișierul local; serverul o redeschide fără repornire.
    reopen: async buf => {
      stop();
      app.db.close();
      for (const f of ['-wal', '-shm']) rmSync(file + f, {force: true});
      writeFileSync(file, buf);
      open();
    }
  });
  // Imaginile noi (de la import) trec și în public/media, ca să plece pe Vercel odată cu codul, prin git.
  const copyMedia = () => {
    mkdirSync('public/media', {recursive: true});
    for (const f of readdirSync('data/media', {withFileTypes: true}))
      if (f.isFile() && !existsSync(`public/media/${f.name}`)) copyFileSync(`data/media/${f.name}`, `public/media/${f.name}`);
  };
  const run = () => { try { copyMedia(); } catch {} return blob.tick().catch(e => console.error('[sincronizare] eroare:', e.message)); };
  await run();
  setInterval(run, Number(process.env.SYNC_SECONDS ?? 5) * 1000).unref?.();
  console.log('purapa: sincronizarea cu baza online e pornită');
} else {
  console.log('purapa: fără cheie Blob în .env.local, baza rămâne doar locală');
}

http.createServer((req, res) => app.handle(req, res)).listen(port, () => console.log(`purapa: http://localhost:${port}/`));
