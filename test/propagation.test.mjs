// Testele obligatorii din standard (§5), pe datele purapa. Un test pică și dacă se refac MAI MULTE pagini decât trebuie.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore, SYSTEM, userFor} from '../src/core/store.mjs';
import {createSync} from '../src/core/sync.mjs';
import {createContext} from '../src/site/context.mjs';
import {renderPath} from '../src/site/render.mjs';
import {seed} from '../src/import/seed.mjs';

const ALL = ['/', '/ambassadors/', '/contact/', '/despre-noi/', '/politica-de-confidentialitate/', '/politica-de-cookie/',
  '/produse/', '/termeni-si-conditii/', '/testare-apa/'];

function setup(opts = {}) {
  const db = openDb();
  migrate(db);
  const store = createStore(db);
  const ids = seed(store);
  const sync = createSync(db, store, opts);
  sync.scan();
  const maxEvent = () => db.prepare('SELECT COALESCE(MAX(id), 0) n FROM change_events').get().n;
  // Rulează schimbarea, procesează evenimentele noi și întoarce paginile refăcute.
  const propagate = fn => {
    const from = maxEvent();
    const result = fn();
    sync.process();
    const paths = db.prepare("SELECT DISTINCT path FROM sync_log WHERE event_id > ? AND action = 'rendered' ORDER BY path").all(from).map(r => r.path);
    return {paths, result, events: db.prepare('SELECT * FROM change_events WHERE id > ? ORDER BY id').all(from)};
  };
  const html = path => sync.get(path).html;
  const homeSection = kind => store.links('pagini', ids.home, 'sections').map(l => store.get('sectiuni', l.id)).find(s => s.kind === kind);
  return {db, store, sync, ids, propagate, html, homeSection};
}

test('scanarea indexează toate paginile publice și completează toate jetoanele', () => {
  const {db, html} = setup();
  assert.deepEqual(db.prepare("SELECT path FROM page_index WHERE path NOT LIKE '#%' ORDER BY path").all().map(r => r.path), ALL);
  for (const p of ALL) assert.doesNotMatch(html(p), /\{[a-z_]+\}/, `jeton necompletat pe ${p}`);
});

test('§5.1 telefonul nou apare peste tot, cel vechi dispare, inclusiv din tel:', () => {
  const {store, propagate, html} = setup();
  const firma = store.list('firma')[0];
  const {paths} = propagate(() => store.update(SYSTEM, 'firma', firma.id, {phone: '0372 000 111'}));
  assert.deepEqual(paths, ALL);
  for (const p of ALL) {
    assert.doesNotMatch(html(p), /0372 887 572|tel:0372887572/, p);
    assert.match(html(p), /tel:0372000111/, p);
  }
});

test('§5.2 un preț schimbat reface doar paginile care îl afișează', () => {
  const {store, ids, propagate, html} = setup();
  assert.deepEqual(propagate(() => store.update(SYSTEM, 'produse', ids.termos, {price: 99}, {publish: true})).paths, ['/produse/']);
  assert.match(html('/produse/'), /99 lei/);
  assert.deepEqual(propagate(() => store.update(SYSTEM, 'produse', ids.kit, {price: 1750}, {publish: true})).paths, ['/', '/produse/']);
  assert.match(html('/'), /1\.750 lei/);
});

test('§5.3 un produs mutat în altă categorie iese din lista veche și intră în cea nouă', () => {
  const {store, ids, propagate, html} = setup();
  const filtrare = store.bySlug('categorii', 'filtrare').id, accesorii = store.bySlug('categorii', 'accesorii').id;
  const cat = {};
  for (const [slug, id] of [['filtrare', filtrare], ['accesorii', accesorii]]) {
    const page = store.create(SYSTEM, 'pagini', {title: `Categoria ${slug}`, slug: `categorie-${slug}`,
      sections: [store.create(SYSTEM, 'sectiuni', {kind: 'produse', title: slug, category_id: id}).id]}, {publish: true});
    cat[slug] = `/${page.slug}/`;
  }
  propagate(() => {});
  html(cat.filtrare); html(cat.accesorii);
  const {paths} = propagate(() => store.update(SYSTEM, 'produse', ids.termos, {category_id: filtrare}, {publish: true}));
  assert.ok(paths.includes(cat.filtrare) && paths.includes(cat.accesorii), paths.join());
  assert.match(html(cat.filtrare), /Termos inteligent/);
  assert.doesNotMatch(html(cat.accesorii), /Termos inteligent/);
});

test('§5.4 un câmp care nu contează pentru link nu reface paginile care au doar linkul', () => {
  const {store, ids, propagate} = setup();
  assert.deepEqual(propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {seo_description: 'Altă descriere'}, {publish: true})).paths, ['/despre-noi/']);
});

test('§5.5 eticheta din meniu schimbată reface toate paginile cu meniul', () => {
  const {store, ids, propagate, html} = setup();
  assert.deepEqual(propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {menu_label: 'Despre noi'}, {publish: true})).paths, ALL);
  assert.match(html('/contact/'), />Despre noi</);
});

test('§5.6 adresa nouă: 301 fără lanț, linkuri actualizate, adresa veche își pierde dependențele', () => {
  const {db, store, ids, propagate, html} = setup();
  propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {slug: 'despre'}, {publish: true}));
  assert.equal(db.prepare('SELECT to_path FROM redirects WHERE from_path = ?').get('/despre-noi/').to_path, '/despre/');
  assert.match(html('/'), /href="\/despre\/"/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM page_deps WHERE path = '/despre-noi/'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM page_index WHERE path = '/despre-noi/'").get().n, 0);
  propagate(() => store.update(SYSTEM, 'pagini', ids.despre, {slug: 'despre-purapa'}, {publish: true}));
  const redirects = Object.fromEntries(db.prepare('SELECT from_path, to_path FROM redirects').all().map(r => [r.from_path, r.to_path]));
  assert.deepEqual(redirects, {'/despre-noi/': '/despre-purapa/', '/despre/': '/despre-purapa/'});
});

test('§5.8 legătura spre o ciornă nu apare; publicarea reface singură pagina (pending)', () => {
  const {db, store, ids, propagate, html, homeSection} = setup();
  const draft = store.create(SYSTEM, 'produse', {name: 'Filtru nou de test', price: 500, category_id: store.bySlug('categorii', 'filtrare').id});
  const s = homeSection('produse');
  propagate(() => store.setLinks(SYSTEM, 'sectiuni', s.id, 'products', [ids.kit, draft.id]));
  assert.doesNotMatch(html('/'), /Filtru nou de test/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM page_deps WHERE path = '/' AND kind = 'pending' AND entity = 'produse' AND entity_id = ?").get(draft.id).n, 1);
  const {paths} = propagate(() => store.publish(SYSTEM, 'produse', draft.id));
  assert.ok(paths.includes('/'), paths.join());
  assert.match(html('/'), /Filtru nou de test/);
});

test('§5.9 o legătură dedusă nu apare pe site; confirmată apare, scoasă dispare', () => {
  const {store, ids, propagate, html, homeSection} = setup();
  const s = homeSection('produse');
  propagate(() => store.setLinks(SYSTEM, 'sectiuni', s.id, 'products', [ids.kit, {id: ids.termos, status: 'inferred'}]));
  assert.doesNotMatch(html('/'), /Termos inteligent/);
  propagate(() => store.setLinkStatus(SYSTEM, 'sectiuni', s.id, 'products', ids.termos, 'confirmed'));
  assert.match(html('/'), /Termos inteligent/);
  propagate(() => store.setLinks(SYSTEM, 'sectiuni', s.id, 'products', [ids.kit]));
  assert.doesNotMatch(html('/'), /Termos inteligent/);
});

test('§5.10 salvarea unei ciorne: zero evenimente și niciun cache atins', () => {
  const {db, store, ids, sync, html} = setup();
  const before = html('/');
  const cached = sync.cache.get('/');
  const n = db.prepare('SELECT COUNT(*) n FROM change_events').get().n;
  const rec = store.update(SYSTEM, 'produse', ids.kit, {name: 'Kit redenumit'});
  assert.equal(rec.draft.name, 'Kit redenumit');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM change_events').get().n, n);
  assert.equal(sync.cache.get('/'), cached);
  assert.equal(html('/'), before);
  const preview = renderPath(createContext(store, {preview: true}), store, '/').html;
  assert.match(preview, /Kit redenumit/);
  assert.match(preview, /Previzualizare — conținut nepublicat/);
});

test('§5.12 un fișier media actualizat reface paginile care îl folosesc, cu același ID', () => {
  const {store, ids, propagate, html} = setup();
  const m = store.create(SYSTEM, 'media', {src: 'kit.webp', alt: 'Kit Purapa'});
  propagate(() => store.update(SYSTEM, 'produse', ids.kit, {image_id: m.id}, {publish: true}));
  assert.match(html('/'), /\/media\/kit\.webp\?v=/);
  const {paths} = propagate(() => store.update(SYSTEM, 'media', m.id, {alt: 'Kit de filtrare Purapa'}));
  assert.deepEqual(paths, ['/', '/produse/']);
  assert.match(html('/produse/'), /alt="Kit de filtrare Purapa"/);
  assert.equal(store.get('produse', ids.kit).image_id, m.id);
});

test('§5.14 o pagină care nu se poate randa: evenimentul eșuează, restul rămân valabile, „Reia” îl rezolvă', () => {
  let broken = true;
  const render = (ctx, store, path) => {
    if (broken && path === '/contact/') throw new Error('randare stricată');
    return renderPath(ctx, store, path);
  };
  const {db, store, sync, propagate, html} = setup({render});
  broken = false;
  html('/contact/');
  broken = true;
  const firma = store.list('firma')[0];
  const {events} = propagate(() => store.update(SYSTEM, 'firma', firma.id, {phone: '0372 000 222'}));
  const ev = db.prepare('SELECT * FROM change_events WHERE id = ?').get(events[0].id);
  assert.equal(ev.status, 'failed');
  assert.match(ev.last_error, /contact.*randare stricată/);
  assert.match(html('/'), /0372 000 222/);
  sync.process();
  assert.equal(db.prepare('SELECT attempts FROM change_events WHERE id = ?').get(ev.id).attempts, 1, 'reluarea așteaptă pauza');
  broken = false;
  assert.equal(sync.retry(ev.id).status, 'done');
  assert.match(html('/contact/'), /0372 000 222/);
});

test('§5.15 un editor nu poate ocoli aprobarea', () => {
  const {store, ids} = setup();
  const ed = userFor('Editor', 'editor');
  const q = store.create(ed, 'intrebari', {question: 'Întrebare nouă?', answer: '<p>Răspuns.</p>'});
  assert.throws(() => store.publish(ed, 'intrebari', q.id), {status: 403});
  assert.throws(() => store.setLinks(ed, 'parametri', ids.params[1], 'recommends', [ids.ok36m]), {status: 403});
  assert.throws(() => store.setLinkStatus(ed, 'parametri', ids.params[1], 'recommends', ids.ok36m, 'confirmed'), {status: 403});
  assert.throws(() => store.setLinkStatus(ed, 'produse', ids.test, 'parameters', ids.params[0], 'inferred'), {status: 403});
  assert.throws(() => store.setStatus(ed, 'intrebari', ids.faqs[0], 'archived'), {status: 403});
  assert.doesNotThrow(() => store.update(ed, 'produse', ids.kit, {price: 1700}, {publish: true}));
});

test('§5.19 o editare manuală își scrie sursa', () => {
  const {db, store} = setup();
  const firma = store.list('firma')[0];
  store.update(userFor('Ana', 'editor'), 'firma', firma.id, {hours: 'Luni – Vineri: 09:00 – 17:00'});
  const p = db.prepare(`SELECT s.kind, s.url, p.verified_by FROM provenance p JOIN sources s ON s.id = p.source_id
    WHERE p.entity = 'firma' AND p.field = 'hours' AND s.kind = 'manual'`).get();
  assert.deepEqual({...p}, {kind: 'manual', url: 'manual:Ana', verified_by: 'Ana'});
});

test('§5.23 o listă fără scope și fără câmpuri declarate e refuzată', () => {
  const {store} = setup();
  assert.throws(() => createContext(store).query('produse'), /fără scope sau fields/);
});

test('protecția la ștergere, blocarea optimistă și tranzacția anulată', () => {
  const {db, store, ids} = setup();
  assert.throws(() => store.remove(SYSTEM, 'categorii', store.bySlug('categorii', 'filtrare').id), {status: 409});
  const v = store.get('produse', ids.termos).version;
  store.update(SYSTEM, 'produse', ids.termos, {price: 95}, {publish: true, version: v});
  assert.throws(() => store.update(SYSTEM, 'produse', ids.termos, {price: 96}, {publish: true, version: v}), {status: 409});
  const n = db.prepare('SELECT COUNT(*) n FROM change_events').get().n;
  assert.throws(() => store.create(SYSTEM, 'produse', {price: 10}, {publish: true}), {status: 400});
  assert.throws(() => store.setLinks(SYSTEM, 'produse', ids.kit, 'cartridges', [ids.termos]), {status: 400}, 'filtrul only: doar cartușe');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM change_events').get().n, n);
});
