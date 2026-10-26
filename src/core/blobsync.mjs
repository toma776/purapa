// Sincronizarea automată a bazei locale cu cea online (Vercel Blob privat), ca să nu urce și să nu coboare nimeni nimic de mână.
// Rulează în serverul local, la câteva secunde:
//   - baza locală s-a schimbat (amprenta fișierului) → se urcă, condiționat de versiunea online cunoscută;
//   - online s-a schimbat, iar local nu → se descarcă și serverul local o redeschide;
//   - s-au schimbat amândouă → câștigă cea locală (aici se lucrează), iar cea online se păstrează în data/backup/.
// Starea ultimei sincronizări (ETag-ul online și amprenta locală) stă în data/.blob-sync.json.
import {get, put, head, BlobNotFoundError, BlobPreconditionFailedError} from '@vercel/blob';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const BLOB_NAME = 'purapa.db';
const sha = buf => createHash('sha1').update(buf).digest('hex');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function createBlobSync({file = 'data/purapa.db', record = 'data/.blob-sync.json', checkpoint, reopen, log = console.log} = {}) {
  const readRecord = () => existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : {etag: null, sha: null};
  const writeRecord = r => writeFileSync(record, JSON.stringify({...r, at: new Date().toISOString()}, null, 2));
  let rec = readRecord(), running = false, conflict = null;

  // Jurnalul WAL golit în fișierul principal, ca fișierul urcat să conțină tot.
  const flush = () => {
    if (checkpoint) return checkpoint();
    const db = new DatabaseSync(file);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
  };
  const remoteHead = () => head(BLOB_NAME).catch(e => { if (e instanceof BlobNotFoundError) return null; throw e; });
  const download = async () => {
    const r = await get(BLOB_NAME, {access: 'private', useCache: false});
    return {buf: Buffer.from(await new Response(r.stream).arrayBuffer()), etag: r.blob.etag};
  };
  const upload = async (buf, ifMatch) => (await put(BLOB_NAME, buf, {access: 'private', allowOverwrite: true, addRandomSuffix: false,
    contentType: 'application/vnd.sqlite3', ...(ifMatch ? {ifMatch} : {})})).etag;

  async function tick() {
    if (running) return null;
    running = true;
    try {
      flush();
      const local = readFileSync(file);
      const localSha = sha(local);
      const remote = await remoteHead();
      const localChanged = localSha !== rec.sha;
      const remoteChanged = !!remote && remote.etag !== rec.etag;

      if (localChanged) {
        try {
          // Prima sincronizare (fără ETag cunoscut) urcă doar dacă online nu există încă nimic.
          if (!rec.etag && remote) throw new BlobPreconditionFailedError();
          const etag = await upload(local, rec.etag);
          rec = {etag, sha: localSha};
          writeRecord(rec);
          conflict = null;
          log(`[sincronizare] baza locală a fost urcată online (${Math.round(local.length / 1024)} KB)`);
          return 'upload';
        } catch (e) {
          if (!(e instanceof BlobPreconditionFailedError)) throw e;
          // Ambele s-au schimbat: varianta online se păstrează întreagă, apoi câștigă cea locală.
          const {buf} = await download();
          mkdirSync('data/backup', {recursive: true});
          const saved = `data/backup/${stamp()}-online-${BLOB_NAME}`;
          writeFileSync(saved, buf);
          const etag = await upload(local, null);
          rec = {etag, sha: localSha};
          writeRecord(rec);
          conflict = {at: new Date().toISOString(), saved};
          log(`[sincronizare] CONFLICT: s-a modificat și online și local. A rămas varianta locală; cea online e în ${saved}`);
          return 'conflict';
        }
      }
      if (remoteChanged) {
        // Local nu s-a schimbat de la ultima sincronizare, deci nu se pierde nimic: baza locală e o copie deja urcată.
        const {buf, etag} = await download();
        await reopen(buf);
        rec = {etag, sha: sha(buf)};
        writeRecord(rec);
        log('[sincronizare] modificările online au fost aduse local');
        return 'download';
      }
      return null;
    } finally {
      running = false;
    }
  }

  return {tick, get conflict() { return conflict; }, get record() { return rec; }};
}
