// Fișierele statice pentru Vercel, în public/: imaginile de la import (data/media → public/media).
// Vercel le servește direct, înaintea funcției; tot restul trece prin api/index.mjs.
import {mkdir, cp, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';

await rm('public/media', {recursive: true, force: true});
await mkdir('public/media', {recursive: true});
const files = await readdir('data/media').catch(() => []);
for (const f of files) await cp(join('data/media', f), join('public/media', f));
console.log(`public/media: ${files.length} imagini.`);
