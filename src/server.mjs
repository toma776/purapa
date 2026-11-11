// Serverul local: site-ul și /manage pe http://localhost:3100. Cât rulează, publică singur:
//   - site-ul public: paginile statice din public/ se regenerează la orice schimbare de conținut și pleacă pe GitHub,
//     iar Vercel le publică (src/core/publisher.mjs). Vizitatorii nu ating Blob-ul.
//   - panoul online: baza se sincronizează cu Blob-ul doar la câteva minute (SYNC_SECONDS, implicit 15 minute),
//     ca să rămână în cota gratuită Vercel. La o verificare la 5 secunde, cota s-a terminat în două zile.
// Nimic nu se urcă sau se descarcă de mână.
import http from 'node:http';
import {existsSync, writeFileSync, rmSync} from 'node:fs';
import {createApp} from './app.mjs';
import {createPublisher} from './core/publisher.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const port = Number(process.env.PORT ?? 3100);
const file = process.env.DB ?? 'data/purapa.db';
const local = !process.env.DB; // cu altă bază (teste, încercări) nu se publică nimic

let app, stop, blob = null;
function open() {
  app = createApp({file, syncStatus: () => blob?.conflict ?? null});
  stop = app.sync.start();
}
open();

if (local && process.env.PUBLISH !== '0') {
  const publisher = createPublisher({getStore: () => app.store});
  await publisher.tick();
  setInterval(() => publisher.tick(), 5000).unref?.();
  console.log('purapa: publicarea automată a site-ului e pornită');
}

if (process.env.BLOB_READ_WRITE_TOKEN && local) {
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
  // Un store blocat (cota depășită) răspunde 403: atunci se reîncearcă abia peste o oră, cu un singur mesaj.
  let pausedUntil = 0, warned = false;
  const run = async () => {
    if (Date.now() < pausedUntil) return;
    try {
      await blob.tick();
      warned = false;
    } catch (e) {
      if (/403|suspend|forbidden/i.test(e.message)) {
        pausedUntil = Date.now() + 3600e3;
        if (!warned) console.error('[sincronizare] stocarea online (Vercel Blob) e blocată; panoul online nu se actualizează. Reîncerc peste o oră.');
        warned = true;
      } else console.error('[sincronizare] eroare:', e.message);
    }
  };
  await run();
  setInterval(run, Number(process.env.SYNC_SECONDS ?? 900) * 1000).unref?.();
  console.log('purapa: sincronizarea panoului online e pornită');
} else if (local) {
  console.log('purapa: fără cheie Blob în .env.local, panoul online nu se sincronizează');
}

http.createServer((req, res) => app.handle(req, res)).listen(port, () => console.log(`purapa: http://localhost:${port}/`));
