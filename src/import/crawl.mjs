// Etapa 1, crawl (§1.3): sitemap + linkurile descoperite + paginile de produs de la retailer + imaginile.
// Rezultatul e un snapshot local din care se poate reface totul fără site-ul vechi.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {join, dirname, posix} from 'node:path';
import {createHash} from 'node:crypto';

const UA = 'PurapaBrainImport/1.0 (+https://purapa.ro; import site vechi)';
const sha1 = buf => createHash('sha1').update(buf).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Adresa → fișier în snapshot: https://purapa.ro/despre-noi/ → purapa.ro/despre-noi/index.html (cu „/” pe orice sistem).
export function snapshotPath(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  if (/\.(webp|jpe?g|png|svg|gif)$/i.test(u.pathname)) return posix.join('media', host, u.pathname.replace(/^\/+/, ''));
  if (/\.[a-z0-9]+$/i.test(u.pathname)) return posix.join(host, u.pathname.replace(/^\/+/, ''));
  const p = u.pathname.replace(/\/+$/, '') || '';
  return posix.join(host, p, 'index.html');
}

export const normalizePath = p => {
  const clean = p.split('#')[0].split('?')[0];
  if (/\.[a-z0-9]+$/i.test(clean)) return clean;
  return clean.endsWith('/') ? clean : `${clean}/`;
};

function internalLinks(html, origin) {
  const out = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let href = m[1];
    if (href.startsWith('//')) continue;
    if (/^https?:/.test(href)) {
      const u = new URL(href);
      if (u.hostname.replace(/^www\./, '') !== new URL(origin).hostname.replace(/^www\./, '')) continue;
      href = u.pathname;
    }
    // Doar pagini: fără resurse (orice cale cu extensie) și fără zonele tehnice.
    if (!href.startsWith('/') || /^\/(_next|api|admin|manage|media)\//.test(href) || /\.[a-z0-9]+$/i.test(href.split(/[?#]/)[0])) continue;
    out.add(normalizePath(href));
  }
  return out;
}

// Imaginile proprii ale site-ului: <img src="/x.jpg"> și cele trecute prin optimizatorul Next (/_next/image?url=%2Fx.jpg).
export const siteImages = html => new Set([
  ...[...html.matchAll(/\/_next\/image\/?\?url=(%2F[^&"\s]+)/g)].map(m => decodeURIComponent(m[1])),
  ...[...html.matchAll(/<img\b[^>]*\ssrc="(\/(?!_next)[^"]+\.(?:png|jpe?g|webp|svg|gif))"/gi)].map(m => m[1])
].filter(p => p.startsWith('/') && !p.startsWith('//')));

const retailerLinks = html => new Set([...html.matchAll(/href="(https:\/\/www\.portalia\.ro\/[^"]+-p\d+\/)"/g)].map(m => m[1]));

// Galeria unui produs de pe Portalia: imaginile mari (1000 px), o singură dată fiecare.
export function retailerImages(html, sku) {
  const seen = new Map();
  for (const m of html.matchAll(new RegExp(`https://www\\.portalia\\.ro/continut/produse/${sku}/(\\d+)/([^"'\\s)]+_(\\d+)\\.(?:webp|jpe?g|png))`, 'g'))) {
    const [, , file, n] = m;
    if (!seen.has(n)) seen.set(n, `https://www.portalia.ro/continut/produse/${sku}/1000/${file}`);
  }
  return [...seen.values()];
}

export async function crawl({site = 'https://purapa.ro', out = 'reference/snapshot', delay = 300, fetchImpl = fetch, log = console.log} = {}) {
  const manifest = [];
  const fetchedAt = new Date().toISOString();
  async function get(url, kind) {
    await sleep(delay);
    let res;
    try { res = await fetchImpl(url, {headers: {'user-agent': UA}, redirect: 'follow'}); }
    catch (e) { manifest.push({url, kind, status: 0, error: e.message, fetched_at: fetchedAt}); log(`  ✗ ${url}: ${e.message}`); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    const file = snapshotPath(res.url || url);
    if (res.ok) {
      await mkdir(dirname(join(out, file)), {recursive: true});
      await writeFile(join(out, file), buf);
    }
    manifest.push({url, final_url: res.url || url, kind, status: res.status, file: res.ok ? file : null, sha1: res.ok ? sha1(buf) : null,
      content_type: res.headers.get('content-type'), fetched_at: fetchedAt});
    log(`  ${res.ok ? '✓' : '✗'} ${res.status} ${url}`);
    return res.ok ? buf : null;
  }

  log(`Crawl ${site}`);
  const queue = ['/'];
  const sitemap = await get(`${site}/sitemap.xml`, 'sitemap');
  if (sitemap) for (const m of sitemap.toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) queue.push(normalizePath(new URL(m[1]).pathname));
  const robots = await get(`${site}/robots.txt`, 'robots');
  const disallow = robots ? [...robots.toString('utf8').matchAll(/^Disallow:\s*(\S+)/gim)].map(m => m[1]) : [];

  const seen = new Set();
  const retailer = new Set();
  const images = new Set();
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path) || disallow.some(d => path.startsWith(d))) continue;
    seen.add(path);
    const buf = await get(site + path, 'page');
    if (!buf) continue;
    const html = buf.toString('utf8');
    for (const p of internalLinks(html, site)) if (!seen.has(p)) queue.push(p);
    for (const r of retailerLinks(html)) retailer.add(r);
    for (const i of siteImages(html)) images.add(i);
  }

  log(`Imaginile site-ului: ${images.size}`);
  for (const i of images) await get(site + i, 'site-image');

  log(`Retailer: ${retailer.size} pagini de produs`);
  for (const url of retailer) {
    const buf = await get(url, 'retailer');
    if (!buf) continue;
    const sku = /-p(\d+)\/$/.exec(url)[1];
    for (const img of retailerImages(buf.toString('utf8'), sku)) await get(img, 'image');
  }

  manifest.sort((a, b) => a.url.localeCompare(b.url));
  await mkdir(out, {recursive: true});
  await writeFile(join(out, 'manifest.json'), JSON.stringify({site, fetched_at: fetchedAt, entries: manifest}, null, 2));
  log(`Snapshot: ${manifest.filter(e => e.file).length} fișiere în ${out}`);
  return {site, fetched_at: fetchedAt, entries: manifest};
}

export async function readManifest(dir = 'reference/snapshot') {
  return JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
}
