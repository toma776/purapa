// Sincronizarea bazei locale (data/purapa.db) cu Blob-ul privat al proiectului Vercel (după modelul Nixodor).
//   npm run blob:upload              urcă baza locală (refuză dacă versiunea online s-a schimbat de la ultima sincronizare)
//   npm run blob:upload -- --force   urcă oricum (suprascrie ce s-a editat online)
//   npm run blob:download            aduce baza online în data/purapa.db (cea locală se păstrează în data/backup/)
// Cheia (BLOB_READ_WRITE_TOKEN) vine în .env.local, cu: npx vercel env pull .env.local
import {get, put, head, BlobNotFoundError} from '@vercel/blob';
import {readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Lipsește BLOB_READ_WRITE_TOKEN: rulează întâi „npx vercel env pull .env.local”.');

const DB = process.env.DB ?? 'data/purapa.db', MARK = 'data/.blob-etag';
const [cmd] = process.argv.slice(2);
const FORCE = process.argv.includes('--force');
const known = existsSync(MARK) ? readFileSync(MARK, 'utf8').trim() : null;
const remote = await head('purapa.db').catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; });

if (cmd === 'upload') {
  if (remote && remote.etag !== known && !FORCE)
    throw new Error('Baza online s-a schimbat de la ultima sincronizare (cineva a editat în panoul online). Rulează „npm run blob:download” sau, ca să o suprascrii, „npm run blob:upload -- --force”.');
  // o copie consistentă: jurnalul WAL golit în fișierul principal
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const r = await put('purapa.db', readFileSync(DB), {access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/vnd.sqlite3'});
  writeFileSync(MARK, r.etag);
  console.log(`Urcat: purapa.db (${Math.round(readFileSync(DB).length / 1024)} KB).`);
} else if (cmd === 'download') {
  if (!remote) throw new Error('În Blob nu există încă purapa.db.');
  const r = await get('purapa.db', {access: 'private', useCache: false});
  mkdirSync('data/backup', {recursive: true});
  if (existsSync(DB)) {
    const db = new DatabaseSync(DB);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); // copia de siguranță să conțină tot
    db.close();
    copyFileSync(DB, `data/backup/${new Date().toISOString().replace(/[:.]/g, '-')}-purapa.db`);
  }
  try { for (const f of ['-wal', '-shm']) rmSync(DB + f, {force: true}); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EBUSY') throw new Error('Baza locală e deschisă de serverul local: oprește-l și rulează din nou.'); throw e; }
  writeFileSync(DB, Buffer.from(await new Response(r.stream).arrayBuffer()));
  writeFileSync(MARK, r.blob.etag);
  console.log('Adus: baza online e acum în data/purapa.db (cea veche e în data/backup/).');
} else {
  console.log('Folosire: npm run blob:upload [-- --force]  ·  npm run blob:download');
}
