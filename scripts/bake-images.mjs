// Pregătește dinainte imaginile grele de calculat sau de descărcat, ca pagina să nu le mai lucreze în browserul vizitatorului.
// Înainte, site.js calcula scenele pe loc și bloca pagina câteva sute de milisecunde pe telefon. Rezultatul stă în
// src/site/assets/baked/ (numit după hash-ul fișierului din media) și render.mjs îl folosește când există:
//   <hash>-patch.webp    peticele de sub felii, cu fundalul întins lin din jurul lor (un sfert din mărimea imaginii);
//   <hash>-cutout.webp   imaginea fără fundal, pentru picătura din hero (doar scenele cu `cutout`);
//   <hash>-base.webp     imaginea scenei în WebP, când originalul e JPG sau PNG (mult mai mică);
//   <hash>-w160.webp     logo-ul la 160 px lățime, pentru antet și subsol.
// Se rulează după ce se schimbă o scenă sau logo-ul: npm run bake:images. Folosește Edge (sau Chrome) fără fereastră.
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {SCENES} from '../src/site/scenes.mjs';
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';

const OUT = 'src/site/assets/baked';
const MEDIA = 'data/media';
const BROWSERS = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const browser = BROWSERS.find(p => existsSync(p));
if (!browser) { console.error('Nu găsesc Edge sau Chrome. Setează CHROME_PATH.'); process.exit(1); }

const jobs = Object.entries(SCENES).filter(([file]) => existsSync(join(MEDIA, file)))
  .map(([file, sc]) => ({file, base: file.replace(/\.\w+$/, ''), width: sc.width, height: sc.height, cutout: sc.cutout ?? null,
    patches: sc.parts.filter(p => p.patch).map(p => p.patch)}));
// Logo-ul firmei, din baza de date.
const db = openDb(process.env.DB ?? 'data/purapa.db');
migrate(db);
const store = createStore(db), firm = store.list('firma')[0];
const logoFile = firm?.logo_id ? basename(String(store.list('media').find(m => m.id === firm.logo_id)?.src ?? '').split('?')[0]) : '';
db.close();
const logos = logoFile && existsSync(join(MEDIA, logoFile)) ? [{file: logoFile, base: logoFile.replace(/\.\w+$/, ''), width: 160}] : [];
const missing = Object.keys(SCENES).filter(f => !existsSync(join(MEDIA, f)));
if (missing.length) console.warn(`Lipsesc din ${MEDIA} (rulează npm run import): ${missing.join(', ')}`);

// Aceleași calcule care erau în site.js.
const PAGE = `<!doctype html><meta charset="utf-8"><script>
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const poly = s => s.trim().split(/\\s+/).map(p => p.split(',').map(Number));
const send = (name, cv, q = .9) => fetch('/out/' + name, {method: 'POST', body: cv.toDataURL('image/webp', q)});
// Imaginea întreagă (sau micșorată la lățimea w), în WebP.
async function copy(img, name, w = img.naturalWidth, q = .82) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(img.naturalHeight * w / img.naturalWidth);
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cv.width, cv.height);
  await send(name, cv, q);
}
async function load(file) { const img = new Image(); img.src = '/media/' + file; await img.decode(); return img; }

// Peticele: pornind de la marginea lor, culorile fundalului se întind spre interior (medie cu vecinii, repetată).
async function patches(j, img) {
  const k = 4, w = Math.ceil(j.width / k), h = Math.ceil(j.height / k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', {willReadFrequently: true});
  g.drawImage(img, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  g.clearRect(0, 0, w, h);
  g.lineWidth = 8 / k; g.lineJoin = 'round';
  for (const p of j.patches) { g.beginPath(); poly(p).forEach(([x, y], i) => i ? g.lineTo(x / k, y / k) : g.moveTo(x / k, y / k)); g.closePath(); g.fill(); g.stroke(); }
  const mask = g.getImageData(0, 0, w, h).data, inside = [];
  for (let i = 0; i < w * h; i++) if (mask[i * 4 + 3] > 127) inside.push(i);
  const d = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) d[i * 3 + c] = src[i * 4 + c];
  for (let it = 0; it < 500; it++) for (const i of inside) {
    const x = i % w, l = x ? i - 1 : i, r = x < w - 1 ? i + 1 : i, u = i >= w ? i - w : i, b = i < w * (h - 1) ? i + w : i;
    for (let c = 0; c < 3; c++) d[i * 3 + c] += 1.7 * ((d[l * 3 + c] + d[r * 3 + c] + d[u * 3 + c] + d[b * 3 + c]) / 4 - d[i * 3 + c]);
  }
  const out = g.createImageData(w, h);
  for (const i of inside) { for (let c = 0; c < 3; c++) out.data[i * 4 + c] = clamp(d[i * 3 + c], 0, 255); out.data[i * 4 + 3] = 255; }
  g.putImageData(out, 0, 0);
  await send(j.base + '-patch.webp', cv);
}

// Decupajul: ce e mai deschis decât key[0] devine transparent, ce e mai închis decât key[1] rămâne întreg; zonele din skip dispar.
async function cutout(j, img) {
  const cfg = j.cutout, cv = document.createElement('canvas'), w = cv.width = img.naturalWidth, h = cv.height = img.naturalHeight;
  const g = cv.getContext('2d', {willReadFrequently: true});
  for (const p of cfg.skip ?? []) { g.beginPath(); poly(p).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); }
  const skip = g.getImageData(0, 0, w, h).data;
  g.clearRect(0, 0, w, h);
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h), d = px.data, [from, to] = cfg.key;
  for (let i = 0; i < d.length; i += 4) {
    const k = clamp((from - (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11)) / (from - to), 0, 1);
    d[i + 3] = skip[i + 3] ? 0 : Math.round(255 * k * k * (3 - 2 * k));
  }
  g.putImageData(px, 0, 0);
  await send(j.base + '-cutout.webp', cv);
}

(async () => {
  try {
    for (const j of ${JSON.stringify(jobs)}) {
      const img = await load(j.file);
      if (j.patches.length) await patches(j, img);
      if (j.cutout) await cutout(j, img);
      if (!/\\.webp$/i.test(j.file)) await copy(img, j.base + '-base.webp');
    }
    for (const j of ${JSON.stringify(logos)}) await copy(await load(j.file), j.base + '-w' + j.width + '.webp', j.width, .9);
    await fetch('/done', {method: 'POST', body: 'ok'});
  } catch (e) { await fetch('/done', {method: 'POST', body: String(e)}); }
})();
</script>`;

await mkdir(OUT, {recursive: true});
const written = [];
let finish;
const done = new Promise(r => { finish = r; });
const server = createServer(async (req, res) => {
  const body = [];
  for await (const c of req) body.push(c);
  const text = Buffer.concat(body).toString();
  if (req.url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(PAGE); }
  if (req.url.startsWith('/media/')) {
    const file = join(MEDIA, basename(decodeURIComponent(req.url.slice(7))));
    try { return res.end(await readFile(file)); } catch { res.statusCode = 404; return res.end(); }
  }
  if (req.url.startsWith('/out/')) {
    const name = basename(decodeURIComponent(req.url.slice(5)));
    await writeFile(join(OUT, name), Buffer.from(text.split(',')[1], 'base64'));
    written.push(name);
    return res.end('ok');
  }
  if (req.url === '/done') { res.end('ok'); return finish(text); }
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = join(tmpdir(), `purapa-bake-${process.pid}`);
const child = spawn(browser, ['--headless=new', '--no-first-run', '--disable-gpu', `--user-data-dir=${profile}`,
  `http://127.0.0.1:${server.address().port}/`], {stdio: 'ignore'});
const timeout = setTimeout(() => finish('timp depășit (60 s)'), 60000);
const result = await done;
clearTimeout(timeout);
child.kill();
server.close();
await rm(profile, {recursive: true, force: true}).catch(() => {});
if (result !== 'ok') { console.error(`Eroare: ${result}`); process.exit(1); }
console.log(`${OUT}/: ${written.join(', ')}`);
