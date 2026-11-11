// Site-ul public ca fișiere statice, în public/: Vercel le servește direct, fără funcție și fără Blob,
// deci vizitatorii nu consumă nimic din cota de stocare. Panoul /manage rămâne pe funcție.
// Se scriu doar fișierele schimbate, ca git să vadă numai modificările reale.
import {mkdir, readFile, writeFile, rm, readdir, access} from 'node:fs/promises';
import {join, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContext} from './context.mjs';
import {renderPath, publicPaths, robotsTxt} from './render.mjs';

const ASSETS_DIR = fileURLToPath(new URL('./assets/', import.meta.url));
const exists = p => access(p).then(() => true, () => false);

async function writeIfChanged(file, data) {
  const cur = await readFile(file).catch(() => null);
  if (cur && Buffer.compare(cur, Buffer.from(data)) === 0) return false;
  await mkdir(dirname(file), {recursive: true});
  await writeFile(file, data);
  return true;
}

// Întoarce lista fișierelor scrise sau șterse (relativ la `out`).
export async function buildStatic(store, {out = 'public', mediaDir = 'data/media'} = {}) {
  const changed = [];
  const put = async (rel, data) => { if (await writeIfChanged(join(out, rel), data)) changed.push(rel); };
  // Fără server în spate: formularul de contact devine un link de email (vezi `staticSite` în render).
  const render = path => renderPath(createContext(store, {staticSite: true}), store, path);

  const pages = publicPaths(store);
  for (const path of pages) {
    const res = render(path);
    if (res.status !== 200) throw new Error(`${path} nu s-a randat (${res.status})`);
    await put(join(path, 'index.html'), res.html);
  }
  await put('404.html', render('/__pagina-inexistenta__/').html);
  await put('robots.txt', robotsTxt());

  // Paginile care nu mai există (șterse sau mutate) dispar și din public/; lista e ținută în public/.pages.json.
  const manifest = join(out, '.pages.json');
  const before = JSON.parse(await readFile(manifest, 'utf8').catch(() => '[]'));
  for (const path of before.filter(p => !pages.includes(p))) {
    await rm(join(out, path, 'index.html'), {force: true});
    changed.push(join(path, 'index.html'));
  }
  await put('.pages.json', JSON.stringify(pages, null, 2) + '\n');

  for (const f of await readdir(ASSETS_DIR, {recursive: true, withFileTypes: true})) {
    if (!f.isFile()) continue;
    const file = join(f.parentPath, f.name);
    await put(join('assets', relative(ASSETS_DIR, file)), await readFile(file));
  }

  // Doar imaginile folosite în Brain.
  const used = new Set(store.list('media').map(m => m.src).filter(src => src && !/^https?:/.test(src)));
  for (const src of used) {
    const from = join(mediaDir, src);
    if (await exists(from)) await put(join('media', src), await readFile(from));
  }
  for (const f of await readdir(join(out, 'media')).catch(() => [])) {
    if (!used.has(f)) { await rm(join(out, 'media', f), {force: true}); changed.push(join('media', f)); }
  }
  return {pages: pages.length, changed};
}
