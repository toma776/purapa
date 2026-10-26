// Sincronizarea bazei e automată cât rulează serverul local (npm start). Scriptul e doar pentru situații speciale:
//   npm run blob:sync                o sincronizare acum, cu serverul local oprit (aceleași reguli ca serverul)
//   npm run blob:upload -- --force   urcă baza locală peste cea online, oricum
//   npm run blob:download -- --force aduce baza online peste cea locală, oricum (cea locală se păstrează în data/backup/)
// Cheia (BLOB_READ_WRITE_TOKEN) vine în .env.local, cu: npx vercel env pull .env.local
import {get, put} from '@vercel/blob';
import {readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createBlobSync, BLOB_NAME} from '../src/core/blobsync.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Lipsește BLOB_READ_WRITE_TOKEN: rulează întâi „npx vercel env pull .env.local”.');

const DB = 'data/purapa.db', RECORD = 'data/.blob-sync.json';
const [cmd] = process.argv.slice(2);
const FORCE = process.argv.includes('--force');
const sha = buf => createHash('sha1').update(buf).digest('hex');
const record = (etag, buf) => writeFileSync(RECORD, JSON.stringify({etag, sha: sha(buf), at: new Date().toISOString()}, null, 2));
const replaceLocal = buf => {
  try { for (const f of ['-wal', '-shm']) rmSync(DB + f, {force: true}); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EBUSY') throw new Error('Baza locală e deschisă de serverul local: oprește-l și rulează din nou.'); throw e; }
  writeFileSync(DB, buf);
};

if (cmd === 'sync') {
  const r = await createBlobSync({file: DB, record: RECORD, reopen: async buf => replaceLocal(buf)}).tick();
  console.log(r ? `Sincronizat: ${r}.` : 'Nimic de sincronizat.');
} else if (cmd === 'upload' && FORCE) {
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const buf = readFileSync(DB);
  const r = await put(BLOB_NAME, buf, {access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/vnd.sqlite3'});
  record(r.etag, buf);
  console.log(`Urcat peste baza online: ${BLOB_NAME} (${Math.round(buf.length / 1024)} KB).`);
} else if (cmd === 'download' && FORCE) {
  const r = await get(BLOB_NAME, {access: 'private', useCache: false});
  if (!r) throw new Error(`În Blob nu există încă ${BLOB_NAME}.`);
  mkdirSync('data/backup', {recursive: true});
  if (existsSync(DB)) copyFileSync(DB, `data/backup/${new Date().toISOString().replace(/[:.]/g, '-')}-local-${BLOB_NAME}`);
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  replaceLocal(buf);
  record(r.blob.etag, buf);
  console.log('Adus peste baza locală (cea veche e în data/backup/).');
} else {
  console.log('Sincronizarea e automată cât rulează npm start. Pentru situații speciale:\n  npm run blob:sync\n  npm run blob:upload -- --force\n  npm run blob:download -- --force');
}
