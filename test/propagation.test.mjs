// Testele obligatorii din standard (§5), pe datele purapa. Un test pică și dacă se refac MAI MULTE pagini decât trebuie.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SYSTEM, userFor} from '../src/core/store.mjs';
import {createSync} from '../src/core/sync.mjs';
import {createContext} from '../src/site/context.mjs';
import {renderPath, calc} from '../src/site/render.mjs';
import {seed} from '../src/import/seed.mjs';
import {testStore} from './helpers.mjs';

const ALL = ['/', '/ambassadors/', '/contact/', '/despre-noi/', '/politica-de-confidentialitate/', '/politica-de-cookie/',
  '/produse/', '/termeni-si-conditii/', '/testare-apa/'];

async function setup(t, opts = {}) {
  const {db, store} = await testStore(t);
  const ids = await seed(store);
  const sync = createSync(db, store, opts);
  await sync.scan();
  const maxEvent = async () => (await db.get('SELECT COALESCE(MAX(id), 0) AS n FROM change_events')).n;
  // Rulează schimbarea, procesează evenimentele noi și întoarce paginile refăcute.
  const propagate = async fn => {
    const from = await maxEvent();
    const result = await fn();
    await sync.process();
    const paths = (await db.all("SELECT DISTINCT path FROM sync_log WHERE event_id > ? AND action = 'rendered' ORDER BY path", [from])).map(r => r.path);
    return {paths, result, events: await db.all('SELECT * FROM change_events WHERE id > ? ORDER BY id', [from])};
  };
  const html = async path => (await sync.get(path)).html;
  const homeSection = kind => store.links('pagini', ids.home, 'sections').map(l => store.get('sectiuni', l.id)).find(s => s.kind === kind);
  const count = async (sql, params) => (await db.get(sql, params)).n;
  return {db, store, sync, ids, propagate, html, homeSection, count};
}

test('scanarea indexează toate paginile publice și completează toate jetoanele', async t => {
  const {db, html} = await setup(t);
  assert.deepEqual((await db.all("SELECT path FROM page_index WHERE path NOT LIKE '#%' ORDER BY path")).map(r => r.path), ALL);
  for (const p of ALL) assert.doesNotMatch(await html(p), /\{[a-z_]+\}/, `jeton necompletat pe ${p}`);
});

test('§5.1 telefonul nou apare peste tot, cel vechi dispare, inclusiv din tel:', async t => {
  const {store, propagate, html} = await setup(t);
  const firma = store.list('firma')[0];
  const {paths} = await propagate(() => store.update(SYSTEM, 'firma', firma.id, {phone: '0372 000 111'}));
  assert.deepEqual(paths, ALL);
  for (const p of ALL) {
    assert.doesNotMatch(await html(p), /0372 887 572|tel:0372887572/, p);
    assert.match(await html(p), /tel:0372000111/, p);
  }
});

test('§5.2 un preț schimbat reface doar paginile care îl afișează', async t => {
  const {store, ids, propagate, html} = await setup(t);
  assert.deepEqual((await propagate(() => store.update(SYSTEM, 'produse', ids.termos, {price: 99}, {publish: true}))).paths, ['/produse/']);
  assert.match(await html('/produse/'), /99 lei/);
  assert.deepEqual((await propagate(() => store.update(SYSTEM, 'produse', ids.kit, {price: 1750}, {publish: true}))).paths, ['/', '/produse/']);
  assert.match(await html('/'), /1\.750 lei/);
});

test('calculatorul: costul anual vine din prețul și durata cartușelor; un preț nou de cartuș reface homepage-ul', async t => {
  const {store, ids, propagate, html} = await setup(t);
  // OK36M 389 lei la 12 luni + prefiltru 12,9 lei la 3 luni = 440,6 lei/an.
  assert.match(await html('/'), /&quot;yearly&quot;:440\.6/);
  assert.match(await html('/'), /În total 441 lei pe an/);
  const {paths} = await propagate(() => store.update(SYSTEM, 'produse', ids.ok36m, {price: 349}, {publish: true}));
  assert.ok(paths.includes('/'), paths.join());
  assert.match(await html('/'), /&quot;yearly&quot;:400\.6/);
});

test('calculatorul: formula, amortizarea și cazul în care nu se merită', () => {
  // 3 persoane × 1,5 L × 30 = 135 L; 135 × 3,5 − 440,6/12 = 435,78 lei/lună; kit 1.199 lei → 3 luni.
  assert.deepEqual(calc({liters: 135, cost: 3.5, yearly: 440.6, kit: 1199, bottle: 2}),
    {loss: false, monthly: '436 lei', annual: '5.229 lei', bottles: '810', payback: '3 luni'});
  assert.equal(calc({liters: 5, cost: 1, yearly: 440.6, kit: 1199, bottle: 2}).loss, true);
});

test('§5.3 un produs mutat în altă categorie iese din lista veche și intră în cea nouă', async t => {
  const {store, ids, propagate, html} = await setup(t);
  const filtrare = store.bySlug('categorii', 'filtrare').id, accesorii = store.bySlug('categorii', 'accesorii').id;
  const cat = {};
  for (const [slug, id] of [['filtrare', filtrare], ['accesorii', accesorii]]) {
    const section = await store.create(SYSTEM, 'sectiuni', {kind: 'produse', title: slug, category_id: id});
    const page = await store.create(SYSTEM, 'pagini', {title: `Categoria ${slug}`, slug: `categorie-${slug}`, sections: [section.id]}, {publish: true});
    cat[slug] = `/${page.slug}/`;
  }
  await propagate(() => {});
  await html(cat.filtrare); await html(cat.accesorii);
  const {paths} = await propagate(() => store.update(SYSTEM, 'produse', ids.termos, {category_id: filtrare}, {publish: true}));
  assert.ok(paths.includes(cat.filtrare) && paths.includes(cat.accesorii), paths.join());
  assert.match(await html(cat.filtrare), /Termos inteligent/);
  assert.doesNotMatch(await html(cat.accesorii), /Termos inteligent/);
});

test('§5.4 un câmp care nu contează pentru link nu reface paginile care au doar linkul', async t => {
  const {store, ids, propagate} = await setup(t);
  assert.deepEqual((await propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {seo_description: 'Altă descriere'}, {publish: true}))).paths, ['/despre-noi/']);
});

test('§5.5 eticheta din meniu schimbată reface toate paginile cu meniul', async t => {
  const {store, ids, propagate, html} = await setup(t);
  assert.deepEqual((await propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {menu_label: 'Despre noi'}, {publish: true}))).paths, ALL);
  assert.match(await html('/contact/'), />Despre noi</);
});

test('§5.6 adresa nouă: 301 fără lanț, linkuri actualizate, adresa veche își pierde dependențele', async t => {
  const {db, store, ids, propagate, html, count} = await setup(t);
  await propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {slug: 'despre'}, {publish: true}));
  assert.equal((await db.get('SELECT to_path FROM redirects WHERE from_path = ?', ['/despre-noi/'])).to_path, '/despre/');
  assert.match(await html('/'), /href="\/despre\/"/);
  assert.equal(await count("SELECT COUNT(*) AS n FROM page_deps WHERE path = '/despre-noi/'"), 0);
  assert.equal(await count("SELECT COUNT(*) AS n FROM page_index WHERE path = '/despre-noi/'"), 0);
  await propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {slug: 'despre-purapa'}, {publish: true}));
  const redirects = Object.fromEntries((await db.all('SELECT from_path, to_path FROM redirects')).map(r => [r.from_path, r.to_path]));
  assert.deepEqual(redirects, {'/despre-noi/': '/despre-purapa/', '/despre/': '/despre-purapa/'});
});

test('§5.8 legătura spre o ciornă nu apare; publicarea reface singură pagina (pending)', async t => {
  const {store, ids, propagate, html, homeSection, count} = await setup(t);
  const draft = await store.create(SYSTEM, 'produse', {name: 'Filtru nou de test', price: 500, category_id: store.bySlug('categorii', 'filtrare').id});
  const s = homeSection('produse');
  await propagate(() => store.setLinks(SYSTEM, 'sectiuni', s.id, 'products', [ids.kit, draft.id]));
  assert.doesNotMatch(await html('/'), /Filtru nou de test/);
  assert.equal(await count("SELECT COUNT(*) AS n FROM page_deps WHERE path = '/' AND kind = 'pending' AND entity = 'produse' AND entity_id = ?", [draft.id]), 1);
  const {paths} = await propagate(() => store.publish(SYSTEM, 'produse', draft.id));
  assert.ok(paths.includes('/'), paths.join());
  assert.match(await html('/'), /Filtru nou de test/);
});

test('§5.9 o legătură dedusă nu apare pe site; confirmată apare, scoasă dispare', async t => {
  const {store, ids, propagate, html, homeSection} = await setup(t);
  const s = homeSection('produse');
  await propagate(() => store.setLinks(SYSTEM, 'sectiuni', s.id, 'products', [ids.kit, {id: ids.termos, status: 'inferred'}]));
  assert.doesNotMatch(await html('/'), /Termos inteligent/);
  await propagate(() => store.setLinkStatus(SYSTEM, 'sectiuni', s.id, 'products', ids.termos, 'confirmed'));
  assert.match(await html('/'), /Termos inteligent/);
  await propagate(() => store.setLinks(SYSTEM, 'sectiuni', s.id, 'products', [ids.kit]));
  assert.doesNotMatch(await html('/'), /Termos inteligent/);
});

test('§5.10 salvarea unei ciorne: zero evenimente și site-ul neschimbat', async t => {
  const {store, ids, html, count} = await setup(t);
  const before = await html('/');
  const n = await count('SELECT COUNT(*) AS n FROM change_events');
  const rec = await store.update(SYSTEM, 'produse', ids.kit, {name: 'Kit redenumit'});
  assert.equal(rec.draft.name, 'Kit redenumit');
  assert.equal(await count('SELECT COUNT(*) AS n FROM change_events'), n);
  assert.equal(await html('/'), before);
  const preview = renderPath(createContext(store, {preview: true}), store, '/').html;
  assert.match(preview, /Kit redenumit/);
  assert.match(preview, /Previzualizare — conținut nepublicat/);
});

test('§5.12 un fișier media actualizat reface paginile care îl folosesc, cu același ID', async t => {
  const {store, ids, propagate, html} = await setup(t);
  const m = await store.create(SYSTEM, 'media', {src: 'kit.webp', alt: 'Kit Purapa'});
  await propagate(() => store.update(SYSTEM, 'produse', ids.kit, {image_id: m.id}, {publish: true}));
  assert.match(await html('/'), /\/media\/kit\.webp\?v=/);
  const {paths} = await propagate(() => store.update(SYSTEM, 'media', m.id, {alt: 'Kit de filtrare Purapa'}));
  assert.deepEqual(paths, ['/', '/produse/']);
  assert.match(await html('/produse/'), /alt="Kit de filtrare Purapa"/);
  assert.equal(store.get('produse', ids.kit).image_id, m.id);
});

test('§5.14 o pagină care nu se poate randa: evenimentul eșuează, restul rămân valabile, „Reia” îl rezolvă', async t => {
  let broken = false;
  const render = (ctx, store, path) => {
    if (broken && path === '/contact/') throw new Error('randare stricată');
    return renderPath(ctx, store, path);
  };
  const {db, store, sync, propagate, html} = await setup(t, {render});
  broken = true;
  const firma = store.list('firma')[0];
  const {events} = await propagate(() => store.update(SYSTEM, 'firma', firma.id, {phone: '0372 000 222'}));
  const ev = await db.get('SELECT * FROM change_events WHERE id = ?', [events[0].id]);
  assert.equal(ev.status, 'failed');
  assert.match(ev.last_error, /contact.*randare stricată/);
  assert.match(await html('/'), /0372 000 222/);
  await sync.process();
  assert.equal((await db.get('SELECT attempts FROM change_events WHERE id = ?', [ev.id])).attempts, 1, 'reluarea așteaptă pauza');
  broken = false;
  assert.equal((await sync.retry(ev.id)).status, 'done');
  assert.match(await html('/contact/'), /0372 000 222/);
});

test('§5.15 un editor nu poate ocoli aprobarea', async t => {
  const {store, ids} = await setup(t);
  const ed = userFor('Editor', 'editor');
  const q = await store.create(ed, 'intrebari', {question: 'Întrebare nouă?', answer: '<p>Răspuns.</p>'});
  await assert.rejects(async () => store.publish(ed, 'intrebari', q.id), {status: 403});
  await assert.rejects(async () => store.setLinks(ed, 'parametri', ids.params[1], 'recommends', [ids.ok36m]), {status: 403});
  await assert.rejects(async () => store.setLinkStatus(ed, 'parametri', ids.params[1], 'recommends', ids.ok36m, 'confirmed'), {status: 403});
  await assert.rejects(async () => store.setLinkStatus(ed, 'produse', ids.test, 'parameters', ids.params[0], 'inferred'), {status: 403});
  await assert.rejects(async () => store.setStatus(ed, 'intrebari', ids.faqs[0], 'archived'), {status: 403});
  await assert.doesNotReject(async () => store.update(ed, 'produse', ids.kit, {price: 1700}, {publish: true}));
});

test('§5.19 o editare manuală își scrie sursa', async t => {
  const {db, store} = await setup(t);
  const firma = store.list('firma')[0];
  await store.update(userFor('Ana', 'editor'), 'firma', firma.id, {hours: 'Luni – Vineri: 09:00 – 17:00'});
  const p = await db.get(`SELECT s.kind, s.url, p.verified_by FROM provenance p JOIN sources s ON s.id = p.source_id
    WHERE p.entity = 'firma' AND p.field = 'hours' AND s.kind = 'manual'`);
  assert.deepEqual({...p}, {kind: 'manual', url: 'manual:Ana', verified_by: 'Ana'});
});

test('§5.23 o listă fără scope și fără câmpuri declarate e refuzată', async t => {
  const {store} = await setup(t);
  assert.throws(() => createContext(store).query('produse'), /fără scope sau fields/);
});

test('protecția la ștergere, blocarea optimistă și tranzacția anulată', async t => {
  const {store, ids, count} = await setup(t);
  await assert.rejects(async () => store.remove(SYSTEM, 'categorii', store.bySlug('categorii', 'filtrare').id), {status: 409});
  const v = store.get('produse', ids.termos).version;
  await store.update(SYSTEM, 'produse', ids.termos, {price: 95}, {publish: true, version: v});
  await assert.rejects(async () => store.update(SYSTEM, 'produse', ids.termos, {price: 96}, {publish: true, version: v}), {status: 409});
  const n = await count('SELECT COUNT(*) AS n FROM change_events');
  await assert.rejects(async () => store.create(SYSTEM, 'produse', {price: 10}, {publish: true}), {status: 400});
  await assert.rejects(async () => store.setLinks(SYSTEM, 'produse', ids.kit, 'cartridges', [ids.termos]), {status: 400}, 'filtrul only: doar cartușe');
  assert.equal(await count('SELECT COUNT(*) AS n FROM change_events'), n);
  assert.equal(store.get('produse', ids.termos).price, 95, 'modelul din memorie rămâne la ultima scriere reușită');
});

test('o altă instanță vede scrierile: modelul se reîncarcă după marcajul de versiune', async t => {
  const {db, store} = await setup(t);
  const {createStore} = await import('../src/core/store.mjs');
  const other = createStore(db);
  await other.load();
  const firma = store.list('firma')[0];
  await store.update(SYSTEM, 'firma', firma.id, {hours: 'Non-stop'});
  assert.notEqual(other.get('firma', firma.id).hours, 'Non-stop');
  await other.fresh();
  assert.equal(other.get('firma', firma.id).hours, 'Non-stop');
});
