// Importul (§1.3, §5.16–18), pe un snapshot sintetic mic: fără rețea, aceleași reguli ca la importul real.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {userFor} from '../src/core/store.mjs';
import {testStore} from './helpers.mjs';
import {createSync} from '../src/core/sync.mjs';
import {seed} from '../src/import/seed.mjs';
import {analyzeSnapshot, blocks} from '../src/import/analyze.mjs';
import {applyImport, linkValues} from '../src/import/apply.mjs';
import {retailerImages, snapshotPath} from '../src/import/crawl.mjs';

const KIT = 'https://www.portalia.ro/kit-complet-de-filtrare-apa-pentru-chiuveta-de-bucatarie-11-000-l-purapa-p651/';
const IMG = 'https://www.portalia.ro/continut/produse/651/1000/kit_1945.webp';
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const page = (title, main, extra = '') => `<html><head><title>${title}</title><meta name="description" content="Descriere ${title}">${extra}</head>
<body><main>${main}</main><footer>Str. Răsăritului nr. 90, Buftea · <a href="tel:0372887572">0372 887 572</a>
<a href="https://www.facebook.com/profile.php?id=61582186433649">f</a></footer></body></html>`;
const TERMS = `<section><div><h1>Termeni și condiții</h1></div></section><section><div><h2>I. TERMENI</h2><h3>1. Informații generale</h3>
<p>Site-ul e administrat de:<br/><strong>Instant Softnet SRL</strong>, cu sediul în Str. Rasaritului nr. 90, hala C2, Buftea, jud. Ilfov, înregistrată la Oficiul Registrului Comerțului sub nr. J40/4285/2009, CUI: RO 25383246.</p>
<p>E-mail: <a href="mailto:contact@purapa.ro">contact@purapa.ro</a><br/>Telefon: <a href="tel:0372887572">0372 887 572</a></p><hr/><h3>2. Scopul</h3><ul><li>informare</li></ul></div></section>`;

async function fixture(t, {terms = TERMS} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'purapa-snap-'));
  const files = {
    'https://purapa.ro/sitemap.xml': ['sitemap', '<urlset><url><loc>https://www.purapa.ro</loc></url><url><loc>https://www.purapa.ro/produse</loc></url></urlset>'],
    'https://purapa.ro/': ['page', page('Acasă', '<h1>Redescoperă gustul apei pure.</h1>', ld({'@graph': [{'@type': 'Organization', sameAs: ['https://www.instagram.com/purapa.ro']}]}))],
    'https://purapa.ro/produse/': ['page', page('Produse', '<h1>Produse</h1>', ld({'@type': 'ItemList', itemListElement: [{position: 1, item: {'@type': 'Product',
      name: 'Kit complet de filtrare apă 11.000 L, Purapa', description: 'Kit de tratare a apei potabile.', offers: {url: KIT, price: 1800}}}]}))],
    'https://purapa.ro/termeni-si-conditii/': ['page', page('Termeni', terms)],
    [KIT]: ['retailer', `<html>${ld({'@type': 'Product', name: 'Kit complet, PurApa - Portalia', offers: {price: '1199.00', availability: 'https://schema.org/InStock',
      priceSpecification: {priceType: 'https://schema.org/StrikethroughPrice', price: '1800.00'}}})}<img src="${IMG.replace('/1000/', '/200/')}"></html>`],
    [IMG]: ['image', Buffer.from('RIFF-fake-webp-kit')]
  };
  const entries = [];
  for (const [url, [kind, body]] of Object.entries(files)) {
    const file = snapshotPath(url);
    await mkdir(dirname(join(dir, file)), {recursive: true});
    await writeFile(join(dir, file), body);
    entries.push({url, final_url: url, kind, status: 200, file, sha1: createHash('sha1').update(body).digest('hex'),
      content_type: kind === 'image' ? 'image/webp' : 'text/html', fetched_at: '2026-10-26T09:00:00.000Z'});
  }
  const manifest = {site: 'https://purapa.ro', fetched_at: '2026-10-26T09:00:00.000Z', entries};
  const analysis = analyzeSnapshot(manifest, f => files[entries.find(e => e.file === f).url][1]);
  const {db, store} = await testStore(t);
  await seed(store);
  const opts = {snapshotDir: dir, mediaDir: join(dir, 'media-out')};
  return {dir, analysis, db, store, opts, run: (o = {}) => applyImport(store, analysis, {...opts, ...o})};
}

test('analyze: prețul tăiat afișat ca preț, adresele în mai multe forme, sitemap, sameAs, galeria', async t => {
  const {analysis} = await fixture(t);
  const kinds = analysis.findings.map(f => f.kind);
  for (const k of ['pret', 'adresa', 'sitemap', 'retele']) assert.ok(kinds.includes(k), k);
  assert.match(analysis.findings.find(f => f.kind === 'pret').text, /1800 e prețul tăiat/);
  assert.deepEqual({...analysis.company, source: undefined}, {legal_name: 'Instant Softnet SRL', cui: 'RO 25383246', reg_com: 'J40/4285/2009',
    address: 'Str. Rasaritului nr. 90, hala C2, Buftea, jud. Ilfov', source: undefined});
  assert.deepEqual(retailerImages(`a ${IMG.replace('/1000/', '/200/')} b ${IMG.replace('/1000/', '/70/')}`, '651'), [IMG]);
});

test('import: prețul de la retailer, prețul tăiat, imaginea, adresa cu diacritice, textul legal cu jetoane', async t => {
  const {store, run} = await fixture(t);
  const report = await run();
  const kit = store.bySlug('produse', 'kit-filtrare-11000l');
  assert.deepEqual([kit.price, kit.list_price, kit.availability], [1199, 1800, 'în stoc']);
  assert.equal(store.get('media', kit.image_id).sha1, createHash('sha1').update('RIFF-fake-webp-kit').digest('hex'));
  const firma = store.list('firma')[0];
  assert.deepEqual([firma.street, firma.building, firma.city, firma.county], ['Str. Răsăritului nr. 90', 'hala C2', 'Buftea', 'Ilfov']);
  const terms = store.links('pagini', store.bySlug('pagini', 'termeni-si-conditii').id, 'sections').map(l => store.get('sectiuni', l.id)).find(s => s.kind === 'text');
  assert.match(terms.text, /\{adresa_completa\}/);
  assert.match(terms.text, /mailto:\{email\}/);
  assert.match(terms.text, /href="\{telefon_link\}"/);
  assert.doesNotMatch(terms.text, /de-validat/);
  assert.deepEqual(report.roundtrip.map(r => [r.exact, r.sameMeaning]), [[true, true]]);
  assert.ok(report.findings.length >= 4);
});

test('§5.17 importul e determinist: rulat de două ori, aceleași ID-uri și nicio modificare', async t => {
  const {db, store, run} = await fixture(t);
  await run();
  const ids = JSON.stringify(store.list('produse').map(p => [p.extern_id, p.id, p.image_id]));
  const events = (await db.get('SELECT COUNT(*) AS n FROM change_events')).n;
  const second = await run();
  assert.equal(JSON.stringify(store.list('produse').map(p => [p.extern_id, p.id, p.image_id])), ids);
  assert.deepEqual([second.created.length, second.updated.length, second.media], [0, 0, 0]);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM change_events')).n, events);
});

test('§5.16 importul refuză să suprascrie editările oamenilor fără --overwrite-edits', async t => {
  const {store, run, db} = await fixture(t);
  await run();
  const kit = store.bySlug('produse', 'kit-filtrare-11000l');
  await store.update(userFor('Ana', 'editor'), 'produse', kit.id, {price: 1099}, {publish: true});
  const events = (await db.get('SELECT COUNT(*) AS n FROM change_events')).n;
  await assert.rejects(run(), e => e.status === 409 && e.conflicts.some(c => c.field === 'price' && c.current === 1099));
  assert.equal(store.get('produse', kit.id).price, 1099, 'nimic scris');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM change_events')).n, events);
  await store.update(userFor('Ana', 'editor'), 'produse', kit.id, {name: 'Kit redenumit'});
  await assert.rejects(run(), e => e.conflicts.some(c => c.why === 'ciornă nepublicată'));
  await run({overwriteEdits: true});
  assert.equal(store.get('produse', kit.id).price, 1199);
});

test('§5.18 verificarea dus-întors numește pagina când textul convertit nu dă aceleași blocuri', async t => {
  const {run} = await fixture(t, {terms: TERMS.replace('<li>informare</li>', '<li>informare <iframe>publicitate</iframe></li>')});
  const report = await run();
  const r = report.roundtrip[0];
  assert.equal(r.exact, false);
  assert.deepEqual(r.first_diff, ['li', 'informare publicitate']);
  assert.ok(report.findings.some(f => f.kind === 'dus-intors' && f.path === '/termeni-si-conditii/'));
});

test('values:link: valorile firmei devin jetoane; o valoare care contrazice sursa rămâne', () => {
  const f = {phone: '0372 887 572', email: 'contact@purapa.ro', legal_name: 'Instant Softnet SRL', cui: 'RO 25383246', reg_com: 'J40/4285/2009'};
  const {html, replaced} = linkValues('<p>Sună la 0372.887.572 sau +40 372 887 572, nu la 0721 000 000. <a href="tel:0372887572">x</a> Instant Softnet SRL</p>', f, {});
  assert.equal(html, '<p>Sună la {telefon} sau {telefon}, nu la 0721 000 000. <a href="{telefon_link}">x</a> {firma}</p>');
  assert.equal(replaced.length, 4);
  assert.deepEqual(blocks('<h3>1. A</h3><p>b <br/>c</p><ul><li>d</li></ul>'), [['h3', '1. A'], ['p', 'b c'], ['li', 'd']]);
});

test('după import, site-ul arată prețul tăiat și imaginea locală, cu ?v=', async t => {
  const {db, store, run} = await fixture(t);
  await run();
  const sync = createSync(db, store);
  await sync.scan();
  const html = (await sync.get('/produse/')).html;
  assert.match(html, /1\.199 lei<\/span> <del><span class="sr-only">Preț vechi: <\/span>1\.800 lei<\/del>/);
  assert.match(html, /src="\/media\/[0-9a-f]{40}\.webp\?v=/);
  assert.match((await sync.get('/termeni-si-conditii/')).html, /Str\. Răsăritului nr\. 90, hala C2, Buftea, jud\. Ilfov/);
});

test('crawl: căile din snapshot folosesc „/” pe orice sistem', () => {
  assert.equal(snapshotPath('https://purapa.ro/'), 'purapa.ro/index.html');
  assert.equal(snapshotPath('https://www.purapa.ro/despre-noi/'), 'purapa.ro/despre-noi/index.html');
  assert.equal(snapshotPath(IMG), 'media/portalia.ro/continut/produse/651/1000/kit_1945.webp');
  assert.equal(snapshotPath('https://purapa.ro/sitemap.xml'), 'purapa.ro/sitemap.xml');
});

test('fișierele media se copiază o singură dată, după amprentă', async t => {
  const {opts, run} = await fixture(t);
  await run();
  await run();
  assert.equal((await readdir(opts.mediaDir)).length, 1);
});
