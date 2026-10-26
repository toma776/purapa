// Importul din site-ul vechi (§1.3): crawl → analyze → import → scan. Fiecare etapă e reluabilă.
//   node scripts/import.mjs                 descarcă din nou și importă
//   node scripts/import.mjs --offline       folosește snapshot-ul existent (reference/snapshot)
//   node scripts/import.mjs --overwrite-edits  suprascrie și modificările făcute de oameni
import {writeFile, mkdir} from 'node:fs/promises';
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore} from '../src/core/store.mjs';
import {createSync} from '../src/core/sync.mjs';
import {seed} from '../src/import/seed.mjs';
import {crawl} from '../src/import/crawl.mjs';
import {analyze} from '../src/import/analyze.mjs';
import {applyImport, IMPORT_USER} from '../src/import/apply.mjs';

const args = new Set(process.argv.slice(2));
const SNAPSHOT = 'reference/snapshot', ANALYSIS = 'reference/analysis';

if (!args.has('--offline')) await crawl({site: 'https://purapa.ro', out: SNAPSHOT});
console.log('Analiză…');
const analysis = await analyze({dir: SNAPSHOT, out: ANALYSIS});
console.log(`  ${analysis.pages.length} pagini, ${analysis.products.length} produse, ${analysis.legal.length} texte legale, ${analysis.findings.length} constatări`);

const db = openDb(process.env.DB ?? 'data/purapa.db');
migrate(db);
const store = createStore(db);
if (!store.list('firma').length) {
  console.log('Baza e goală: creez structura editorială (pagini, secțiuni, parametri, întrebări).');
  seed(store, {user: IMPORT_USER});
}

try {
  const report = await applyImport(store, analysis, {overwriteEdits: args.has('--overwrite-edits'), snapshotDir: SNAPSHOT});
  const scan = createSync(db, store).scan();
  await mkdir(ANALYSIS, {recursive: true});
  await writeFile(`${ANALYSIS}/import-report.json`, JSON.stringify(report, null, 2));
  console.log(`Import gata: ${report.created.length} create, ${report.updated.length} actualizate, ${report.unchanged} neschimbate, ${report.media} fișiere media, ${report.tokens} valori legate.`);
  for (const r of report.roundtrip) console.log(`  dus-întors ${r.path}: ${r.blocks} blocuri, ${r.exact && r.sameMeaning ? 'identic' : `DIFERIT (${JSON.stringify(r.first_diff)})`}, ${r.tokens} jetoane`);
  console.log(`Scanare: ${scan.pages} pagini${scan.errors.length ? `, erori: ${scan.errors.join('; ')}` : ''}.`);
  console.log(`Constatări (${report.findings.length}), și în /manage, la „De făcut”:`);
  for (const f of report.findings) console.log(`  [${f.impact}] ${f.text}`);
} catch (e) {
  if (e.conflicts) {
    console.error(e.message);
    for (const c of e.conflicts) console.error(`  ${c.key}:${c.id} „${c.field}” (${c.why}): ${JSON.stringify(c.current)} → ${JSON.stringify(c.incoming)}`);
    process.exit(2);
  }
  throw e;
}
