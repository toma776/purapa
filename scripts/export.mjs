// Exportul static al site-ului public, pentru Vercel: paginile randate din Brain, resursele, imaginile folosite,
// redirecționările 301 și configurația. Panoul /manage rămâne local; după o modificare, se exportă și se publică din nou.
//   npm run export                 → dist/, marcat „noindex”, fără sitemap (previzualizare, cât purapa.ro e încă site-ul vechi)
//   npm run export -- --indexabil  → fără „noindex”, cu sitemap în robots.txt (când devine site-ul oficial)
import {mkdir, rm, writeFile, cp, readdir, access} from 'node:fs/promises';
import {join} from 'node:path';
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';
import {createContext} from '../src/site/context.mjs';
import {renderPath, publicPaths, robotsTxt} from '../src/site/render.mjs';

const OUT = 'dist';
const SITE_URL = (process.env.SITE_URL ?? 'https://purapa.ro').replace(/\/$/, '');
const indexable = process.argv.includes('--indexabil');
// Steagul hotărăște, nu mediul: paginile primesc „noindex” sau nu după el.
process.env.SITE_INDEX = indexable ? '1' : '0';

const db = openDb(process.env.DB ?? 'data/purapa.db');
migrate(db);
const store = createStore(db);

// dist/ se golește la fiecare export, dar legătura cu proiectul Vercel (dist/.vercel) rămâne.
await mkdir(OUT, {recursive: true});
for (const e of await readdir(OUT)) if (e !== '.vercel') await rm(join(OUT, e), {recursive: true, force: true});

const render = path => renderPath(createContext(store, {staticSite: true}), store, path);
const paths = publicPaths(store);
for (const path of paths) {
  const out = render(path);
  if (out.status !== 200) throw new Error(`${path} nu s-a randat (${out.status})`);
  if (/\/api\//.test(out.html.replace(/https?:\/\/[^"']+/g, ''))) throw new Error(`${path} trimite la /api, care nu există pe site-ul static`);
  await mkdir(join(OUT, path), {recursive: true});
  await writeFile(join(OUT, path, 'index.html'), out.html);
}
await writeFile(join(OUT, '404.html'), render('/__pagina-inexistenta__/').html);

await cp('src/site/assets', join(OUT, 'assets'), {recursive: true});
let media = 0;
for (const m of store.list('media').filter(m => !/^https?:/.test(m.src))) {
  const from = join('data/media', m.src);
  if (!await access(from).then(() => true, () => false)) { console.warn(`  lipsește fișierul ${from}`); continue; }
  await mkdir(join(OUT, 'media'), {recursive: true});
  await cp(from, join(OUT, 'media', m.src));
  media++;
}

const redirects = db.prepare('SELECT from_path, to_path, code FROM redirects WHERE to_path IS NOT NULL').all()
  .map(r => ({source: r.from_path, destination: r.to_path, permanent: r.code === 301}));
const immutable = [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}];
await writeFile(join(OUT, 'vercel.json'), JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  trailingSlash: true,
  redirects,
  headers: [
    {source: '/assets/(.*)', headers: immutable},
    {source: '/media/(.*)', headers: immutable},
    {source: '/(.*)', headers: [
      ...(indexable ? [] : [{key: 'X-Robots-Tag', value: 'noindex, nofollow'}]),
      {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
      {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
      {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'}
    ]}
  ]
}, null, 2));
// `vercel link` poate scrie un .env.local cu un token: nu trebuie să ajungă niciodată în deploy.
await writeFile(join(OUT, '.vercelignore'), '.env*\n.gitignore\n');
await writeFile(join(OUT, 'robots.txt'), robotsTxt());
if (indexable) await writeFile(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  paths.map(p => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n')}\n</urlset>\n`);

console.log(`Export gata în ${OUT}/: ${paths.length} pagini, ${media} imagini, ${redirects.length} redirecționări${indexable ? '' : ', marcat noindex (previzualizare)'}.`);
