// /manage: autentificarea, confirmarea în masă, harta, „De făcut” și paginile, prin HTTP.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {SYSTEM, userFor} from '../src/core/store.mjs';
import {createSync} from '../src/core/sync.mjs';
import {createGraph} from '../src/core/graph.mjs';
import {createTodos} from '../src/core/todos.mjs';
import {inferredGroups} from '../src/core/inferred.mjs';
import {createAuth, hashPassword, verifyPassword} from '../src/auth/auth.mjs';
import {createApp} from '../src/app.mjs';
import {seed} from '../src/import/seed.mjs';
import {testStore, testDb} from './helpers.mjs';

async function setup(t) {
  const {db, store} = await testStore(t);
  const ids = await seed(store);
  const sync = createSync(db, store);
  await sync.scan();
  const graph = createGraph(db, store);
  return {db, store, sync, ids, graph, todos: createTodos(db, store, graph), auth: createAuth(db)};
}

test('parolele: scrypt cu sare, verificare corectă', () => {
  const h = hashPassword('o-parola-lunga');
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(h, hashPassword('o-parola-lunga'));
  assert.ok(verifyPassword('o-parola-lunga', h));
  assert.ok(!verifyPassword('alta-parola', h));
});

test('login: sesiune cu token stocat doar ca hash; după 5 eșecuri, 429', async t => {
  const {db, auth} = await setup(t);
  const ana = await auth.createUser({email: 'ana@test.ro', name: 'Ana', role: 'editor', password: 'parola-ana-123'});
  const {token} = await auth.login('ana@test.ro', 'parola-ana-123', '1.2.3.4');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM sessions WHERE token = ?', [token])).n, 0, 'tokenul nu se stochează în clar');
  const req = {headers: {cookie: `purapa_session=${token}`}, socket: {remoteAddress: '1.2.3.4'}};
  assert.equal((await auth.userFromRequest(req)).name, 'Ana');
  for (let i = 0; i < 5; i++) await assert.rejects(auth.login('ana@test.ro', 'gresit', '5.6.7.8'), {status: 401});
  await assert.rejects(auth.login('ana@test.ro', 'parola-ana-123', '5.6.7.8'), {status: 429});
  await auth.updateUser(ana.id, {active: false});
  assert.equal(await auth.userFromRequest(req), null, 'dezactivarea închide sesiunile');
});

test('mod local fără parolă doar cât nu există niciun cont și doar de pe localhost', async t => {
  const {auth} = await setup(t);
  const local = {headers: {}, socket: {remoteAddress: '127.0.0.1'}};
  const remote = {headers: {}, socket: {remoteAddress: '10.0.0.5'}};
  assert.ok((await auth.userFromRequest(local)).setup);
  assert.equal(await auth.userFromRequest(remote), null);
  assert.equal(await auth.userFromRequest({headers: {'x-forwarded-for': '8.8.8.8'}, socket: {remoteAddress: '127.0.0.1'}}), null, 'prin proxy nu e local');
  const admin = await auth.createUser({email: 'admin@test.ro', name: 'Admin', role: 'admin', password: 'parola-admin-1'});
  assert.equal(await auth.userFromRequest(local), null);
  await assert.rejects(auth.updateUser(admin.id, {role: 'editor'}), {status: 409}, 'rămâne un administrator');
});

test('§2.5 confirmarea în masă: o tranzacție, un eveniment, cere aprobare pe relația sensibilă', async t => {
  const {db, store, sync, ids} = await setup(t);
  const groups = await inferredGroups(store);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].relation, 'parametri.recommends');
  const pairs = groups[0].items.map(i => [i.src, i.dst]);
  await assert.rejects(async () => store.bulkLinks(userFor('Ed', 'editor'), 'parametri', 'recommends', pairs, 'confirm'), {status: 403});
  const count = async () => (await db.get('SELECT COUNT(*) AS n FROM change_events')).n;
  const before = await count();
  const res = await store.bulkLinks(SYSTEM, 'parametri', 'recommends', pairs, 'confirm');
  assert.equal(res.changed, 1);
  assert.equal(await count(), before + 1);
  assert.equal(store.links('parametri', ids.params[1], 'recommends')[0].status, 'confirmed');
  assert.equal(await sync.process(), 1);
  assert.equal((await inferredGroups(store)).length, 0);
});

test('§1.5 o legătură scoasă se ține minte', async t => {
  const {db, store, ids} = await setup(t);
  await store.bulkLinks(SYSTEM, 'parametri', 'recommends', [[ids.params[1], ids.ok36m]], 'remove');
  assert.equal(store.links('parametri', ids.params[1], 'recommends').length, 0);
  const d = await db.get('SELECT * FROM link_dismissals');
  assert.deepEqual([d.relation, d.src_id, d.dst_id], ['parametri.recommends', ids.params[1], ids.ok36m]);
});

test('§5.21–22 harta: traseul are lungimea așteptată; 0 trimiteri rupte și 0 obligatorii goale pe datele importate', async t => {
  const {graph, ids} = await setup(t);
  const steps = graph.path(['produse', ids.ok36m], ['produse', ids.kit]);
  assert.equal(steps.length, 2, 'cartușul e legat direct de kit');
  const viaTest = graph.path(['parametri', ids.params[0]], ['pagini', ids.home]);
  assert.ok(viaTest && viaTest.length <= 7);
  const h = graph.health();
  assert.equal(h.broken.length, 0);
  assert.equal(h.requiredEmpty.length, 0);
  const ov = graph.overview();
  assert.ok(ov.relations.find(r => r.id === 'produse.parameters').count === 16);
  assert.ok(ov.relations.some(r => r.possible), 'perechile posibile, nefolosite, apar');
});

test('harta: o trimitere din text spre o înregistrare ștearsă apare ca ruptă și în „De făcut”', async t => {
  const {store, graph, todos, ids} = await setup(t);
  const q = await store.create(SYSTEM, 'produse', {name: 'Produs temporar de test', category_id: store.bySlug('categorii', 'accesorii').id}, {publish: true});
  await store.update(SYSTEM, 'intrebari', ids.faqs[0], {answer: `<p>Vezi <a data-ref="produse:${q.id}">produsul</a>.</p>`}, {publish: true});
  await store.remove(SYSTEM, 'produse', q.id);
  assert.equal(graph.health().broken.length, 1);
  assert.ok((await todos.list()).some(t => t.kind === 'rupt'));
});

test('§1.6 b numele găsit în text, cu granițe de cuvânt, fără legătură salvată', async t => {
  const {store, graph, ids} = await setup(t);
  const prefiltrare = store.list('etape').find(e => e.name === 'Prefiltrare').id;
  const pas = store.list('pasi')[0].id;
  await store.update(SYSTEM, 'pasi', pas, {text: '<p>Începe cu Prefiltrare, apoi restul.</p>'});
  assert.ok((await graph.mentionsOf('etape', prefiltrare)).some(m => m.key === 'pasi'));
  await store.update(SYSTEM, 'pasi', pas, {text: '<p>Prefiltrarea e prima etapă.</p>'});
  assert.ok(!(await graph.mentionsOf('etape', prefiltrare)).some(m => m.key === 'pasi'), '„Prefiltrarea” nu e „Prefiltrare”');
  assert.equal((await graph.mentionsOf('produse', ids.termos)).length, 0);
});

test('/manage prin HTTP: login, pagini, refuzuri', async t => {
  const {url} = await testDb(t);
  const app = await createApp({database: url});
  t.after(() => app.db.close());
  await seed(app.store);
  await app.sync.scan();
  await app.auth.createUser({email: 'admin@test.ro', name: 'Admin', role: 'admin', password: 'parola-admin-1'});
  await app.auth.createUser({email: 'ed@test.ro', name: 'Ed', role: 'editor', password: 'parola-ed-1234'});
  const srv = http.createServer(app.handle).listen(0);
  await new Promise(r => srv.on('listening', r));
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const go = (path, {cookie = '', method = 'GET', body, headers = {}} = {}) => fetch(base + path, {method, redirect: 'manual',
    headers: {'content-type': 'application/json', cookie, ...headers}, body: body && JSON.stringify(body)});
  const loginAs = async (email, password) => (await go('/api/manage/auth/login', {method: 'POST', body: {email, password}})).headers.get('set-cookie').split(';')[0];

  const anon = await go('/manage/');
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location'), /^\/manage\/login\//);
  assert.equal((await go('/api/manage/sync')).status, 401);

  const admin = await loginAs('admin@test.ro', 'parola-admin-1');
  for (const p of ['/manage/', '/manage/entitati/', '/manage/entitati/produse/', '/manage/entitati/produse/1/', '/manage/entitati/produse/1/detalii/',
    '/manage/entitati/produse/1/relatii/', '/manage/entitati/produse/1/surse/', '/manage/entitati/produse/1/unde-apare/', '/manage/entitati/produse/1/istoric/',
    '/manage/entitati/pagini/1/relatii/', '/manage/harta/', '/manage/surse/', '/manage/surse/legaturi/', '/manage/utilizatori/', '/manage/previzualizare/']) {
    const r = await go(p, {cookie: admin});
    assert.equal(r.status, 200, `${p}: ${r.status === 200 ? '' : await r.text()}`);
    assert.equal(r.headers.get('cache-control'), 'no-store', p);
  }
  const home = await go('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('vercel-cache-tag') ?? '', /^p:\/$/);

  const ed = await loginAs('ed@test.ro', 'parola-ed-1234');
  assert.equal((await go('/manage/utilizatori/', {cookie: ed})).status, 403);
  assert.equal((await go('/api/manage/inferred/parametri.recommends', {cookie: ed, method: 'POST', body: {action: 'confirm', pairs: [[2, 3]]}})).status, 403);
  assert.equal((await go('/api/manage/sync/scan', {cookie: admin, method: 'POST', headers: {origin: 'https://alt-site.ro'}})).status, 403);

  const kit = app.store.bySlug('produse', 'kit-filtrare-11000l');
  const saved = await (await go(`/api/manage/entities/produse/${kit.id}`, {cookie: ed, method: 'PUT', body: {data: {price: 1700}, publish: true, version: kit.version}})).json();
  assert.equal(saved.record.price, 1700);
  assert.ok(Array.isArray(saved.observations));
  assert.equal((await go(`/api/manage/entities/produse/${kit.id}`, {cookie: ed, method: 'PUT', body: {data: {price: 1}, publish: true, version: kit.version}})).status, 409);
  // Propagarea a rulat înainte de răspuns: pagina publică arată deja prețul nou.
  assert.match(await (await go('/')).text(), /1\.700 lei/);
});
