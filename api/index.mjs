// Intrarea pe Vercel: site-ul public, /manage și /api/manage, cu același cod ca local (după modelul Nixodor).
// Baza (SQLite, purapa.db) stă într-un Blob privat. Fiecare instanță o ține în /tmp:
//   - la fiecare cerere verifică ETag-ul din Blob și o descarcă doar dacă s-a schimbat;
//   - după o cerere care scrie, rulează propagarea și urcă baza înapoi condiționat (ifMatch): dacă între timp
//     a scris altă instanță, nu se suprascrie nimic, iar panoul primește 409 („reîncarcă și salvează din nou”).
// Imaginile de la import sunt statice, în public/media (npm run build:public).
import {get, put, BlobPreconditionFailedError} from '@vercel/blob';
import {mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createApp} from '../src/app.mjs';

const TMP = '/tmp/purapa', DB = join(TMP, 'purapa.db');
const DB_BLOB = 'purapa.db';
let app = null, etag = null;

const readAll = async stream => Buffer.from(await new Response(stream).arrayBuffer());

async function load() {
  const r = await get(DB_BLOB, {access: 'private', useCache: false, ...(etag && app ? {ifNoneMatch: etag} : {})});
  if (!r) throw new Error('purapa.db lipsește din Blob (prima urcare se face cu npm run blob:upload)');
  if (r.statusCode === 304) return;
  const buf = await readAll(r.stream);
  app?.db.close();
  await mkdir(TMP, {recursive: true});
  for (const f of ['', '-wal', '-shm']) await rm(DB + f, {force: true});
  await writeFile(DB, buf);
  etag = r.blob.etag;
  app = createApp({file: DB, mediaDir: join(process.cwd(), 'public', 'media')});
  app.db.exec('PRAGMA journal_mode = DELETE'); // un singur fișier, gata de urcat
}

async function persist() {
  const r = await put(DB_BLOB, await readFile(DB), {access: 'private', allowOverwrite: true, addRandomSuffix: false,
    contentType: 'application/vnd.sqlite3', ifMatch: etag});
  etag = r.etag;
}

export default async function purapa(req, res) {
  try {
    await load();
  } catch (e) {
    console.error(e);
    res.writeHead(503, {'content-type': 'text/plain; charset=utf-8'});
    return res.end('Brain-ul nu e disponibil momentan.');
  }
  const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!writes) return app.handle(req, res);

  // La scrieri, răspunsul (antetele și corpul) pleacă abia după ce baza a ajuns în Blob.
  const writeHead = res.writeHead.bind(res), end = res.end.bind(res);
  let head = null, finish;
  const ended = new Promise(r => { finish = r; });
  res.writeHead = (...args) => { head = args; return res; };
  res.end = (...args) => { finish(args); return res; };
  await app.handle(req, res);
  const body = await ended;
  res.writeHead = writeHead; res.end = end;
  try {
    app.sync.process();
    await persist();
  } catch (e) {
    console.error(e);
    etag = null; // la următoarea cerere se reîncarcă versiunea din Blob
    const conflict = e instanceof BlobPreconditionFailedError;
    for (const h of res.getHeaderNames()) res.removeHeader(h);
    res.writeHead(conflict ? 409 : 500, {'content-type': 'application/json; charset=utf-8'});
    return res.end(JSON.stringify({error: conflict ? 'Între timp a salvat altcineva. Reîncarcă pagina și salvează din nou.' : 'Salvarea nu a ajuns în Blob.'}));
  }
  if (head) res.writeHead(...head);
  return res.end(...body);
}
