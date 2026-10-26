// API-ul /api/manage (Anexa C). Autorizarea se face pe server, la fiecare cerere (§1.9).
import {HttpError, can} from '../core/store.mjs';
import {ENTITIES, byKey, RELATION_TYPES, relFields, titleOf} from '../registry/entities.mjs';
import {inferredGroups} from '../core/inferred.mjs';
import {LAYERS} from '../core/graph.mjs';

const need = (user, perm) => { if (!can(user, perm)) throw new HttpError(403, `Lipsește dreptul ${perm}`); };
const parseRef = s => { const [k, id] = String(s ?? '').split(':'); if (!byKey[k] || !Number(id)) throw new HttpError(400, `Referință invalidă: ${s}`); return [k, Number(id)]; };
const layersOf = q => q.get('straturi') ? q.get('straturi').split(',').filter(l => LAYERS.includes(l)) : LAYERS;
const notFound = msg => { throw new HttpError(404, msg); };

export function createApi({db, store, sync, graph, todos, auth}) {
  // „Unde apare” pe patru niveluri, ținute separat (§2.3).
  async function whereUsed(key, id) {
    const d = store.def(key);
    const rec = store.get(key, id);
    if (!rec) throw new HttpError(404, `${d.one} #${id} nu există`);
    const outgoing = relFields(d).flatMap(f => store.links(key, id, f.key).map(l => ({field: f.key, rel: f.rel, target: f.target, ...l,
      title: titleOf(byKey[f.target], store.get(f.target, l.id))})));
    const incoming = store.inbound(key, id).map(u => ({...u, title: titleOf(byKey[u.entity], store.get(u.entity, u.id))}));
    const pages = await graph.pagesOf(key, id);
    // Nivelul 3: listele în care intră înregistrarea prin regulă (scope sau câmpuri), nu prin legătură.
    const scopes = new Set(store.scopesOf(d, rec));
    const lists = (await db.all("SELECT DISTINCT path, component, scope, fields FROM page_deps WHERE entity = ? AND kind = 'query'", [key]))
      .filter(q => !q.scope || scopes.has(q.scope))
      .map(q => ({path: q.path, component: q.component, rule: q.scope ? `toate ${d.label.toLowerCase()} din ${q.scope}` : `toate ${d.label.toLowerCase()} publicate`}));
    const pending = await db.all("SELECT DISTINCT path, component FROM page_deps WHERE entity = ? AND entity_id = ? AND kind = 'pending'", [key, id]);
    return {
      relations: {outgoing, incoming},
      pages, appearsIn: new Set(pages.map(p => p.path).filter(p => !p.startsWith('#'))).size,
      lists, pendingPublish: pending,
      unverified: [...outgoing.filter(l => l.status !== 'confirmed'), ...incoming.filter(l => l.status && l.status !== 'confirmed')],
      mentions: await graph.mentionsOf(key, id)
    };
  }

  // „Apare în N pagini” pentru toate înregistrările unui tip, dintr-o singură citire a dependențelor.
  async function appearsInAll(key) {
    const rows = await db.all("SELECT path, entity_id, kind FROM page_deps WHERE entity = ? AND kind <> 'pending' AND kind <> 'query'", [key]);
    const layoutPages = new Map();
    for (const r of await db.all("SELECT DISTINCT component, path FROM page_deps WHERE kind = 'layout'"))
      layoutPages.set(r.component, [...(layoutPages.get(r.component) ?? []), r.path]);
    const by = new Map();
    for (const r of rows) {
      const set = by.get(r.entity_id) ?? new Set();
      if (r.path.startsWith('#layout:')) for (const p of layoutPages.get(r.path.slice(8)) ?? []) set.add(p);
      else set.add(r.path);
      by.set(r.entity_id, set);
    }
    return id => by.get(id)?.size ?? 0;
  }
  const appearsIn = async (key, id) => (await appearsInAll(key))(id);

  const provenanceOf = (key, id) => db.all(`SELECT p.id, p.field, p.certainty, p.confidence, p.excerpt, p.method, p.verified_by, p.verified_at, p.created_at,
      s.kind, s.url, s.title FROM provenance p JOIN sources s ON s.id = p.source_id WHERE p.entity = ? AND p.entity_id = ? ORDER BY p.field, p.id`, [key, id]);

  const historyOf = async (key, id) => (await db.all('SELECT id, at, user_name, action, label, changes FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC', [key, id]))
    .map(r => ({...r, changes: JSON.parse(r.changes)}));

  const routes = [
    ['GET', /^\/me$/, u => ({name: u.name, role: u.role, email: u.email ?? null, setup: !!u.setup, perms: [...u.perms]})],
    ['GET', /^\/entities$/, u => { need(u, 'content.read'); return ENTITIES.map(d => ({key: d.key, label: d.label, category: d.category, hub: d.hub !== false, count: store.list(d.key).length})); }],
    ['GET', /^\/entities\/([a-z-]+)$/, async (u, [key]) => {
      need(u, 'content.read');
      const count = await appearsInAll(key);
      return store.list(key).map(r => ({...r, _appearsIn: count(r.id)}));
    }],
    ['POST', /^\/entities\/([a-z-]+)$/, async (u, [key], body) => {
      if (store.def(key).creatable === false) throw new HttpError(400, `${store.def(key).label} nu se creează din /manage`);
      const record = await store.create(u, key, body.data ?? {}, {publish: !!body.publish});
      return {record, observations: todos.forEntity(key, record.id)};
    }],
    ['GET', /^\/entities\/([a-z-]+)\/(\d+)$/, async (u, [key, id]) => {
      need(u, 'content.read');
      const rec = store.get(key, Number(id)) ?? notFound('Nu există');
      const links = Object.fromEntries(relFields(store.def(key)).map(f => [f.key, store.links(key, Number(id), f.key)]));
      return {record: rec, links, provenance: await provenanceOf(key, Number(id)), observations: todos.forEntity(key, Number(id)), appearsIn: await appearsIn(key, Number(id))};
    }],
    // După salvare, răspunsul conține observațiile noi (§3.11).
    ['PUT', /^\/entities\/([a-z-]+)\/(\d+)$/, async (u, [key, id], body) => {
      const record = await store.update(u, key, Number(id), body.data ?? {}, {version: body.version ?? null, publish: !!body.publish});
      return {record, observations: todos.forEntity(key, Number(id))};
    }],
    ['DELETE', /^\/entities\/([a-z-]+)\/(\d+)$/, (u, [key, id]) => store.remove(u, key, Number(id))],
    ['POST', /^\/entities\/([a-z-]+)\/(\d+)\/publish$/, (u, [key, id]) => store.publish(u, key, Number(id))],
    ['POST', /^\/entities\/([a-z-]+)\/(\d+)\/status$/, (u, [key, id], body) => store.setStatus(u, key, Number(id), body.status)],
    ['PUT', /^\/entities\/([a-z-]+)\/(\d+)\/links\/([a-z_]+)$/, (u, [key, id, field], body) => store.setLinks(u, key, Number(id), field, body.items ?? [])],
    ['PUT', /^\/entities\/([a-z-]+)\/(\d+)\/inverse\/([a-z-]+)\/([a-z_]+)$/, (u, [key, id, src, field], body) =>
      store.setInverse(u, key, Number(id), src, field, body.ids ?? [])],
    ['PUT', /^\/entities\/([a-z-]+)\/(\d+)\/links\/([a-z_]+)\/(\d+)\/status$/, (u, [key, id, field, dst], body) =>
      store.setLinkStatus(u, key, Number(id), field, Number(dst), body.status)],
    ['GET', /^\/entities\/([a-z-]+)\/(\d+)\/where$/, (u, [key, id]) => { need(u, 'content.read'); return whereUsed(key, Number(id)); }],
    ['GET', /^\/entities\/([a-z-]+)\/(\d+)\/history$/, (u, [key, id]) => { need(u, 'content.read'); return historyOf(key, Number(id)); }],
    ['GET', /^\/options\/([a-z-]+)$/, (u, [key], body, q) => {
      need(u, 'content.read');
      const d = store.def(key), needle = (q.get('q') ?? '').toLowerCase();
      return store.list(key).map(r => ({id: r.id, title: titleOf(d, r), status: d.noStatus ? 'published' : r.status}))
        .filter(r => !needle || r.title.toLowerCase().includes(needle)).slice(0, 200);
    }],
    ['GET', /^\/relations$/, u => { need(u, 'content.read'); return RELATION_TYPES; }],

    ['GET', /^\/graph\/overview$/, (u, m, b, q) => { need(u, 'content.read'); return graph.overview({layers: layersOf(q)}); }],
    ['GET', /^\/graph\/members\/([a-z-]+)$/, (u, [key], b, q) => { need(u, 'content.read'); return graph.members(key, {q: q.get('q') ?? '', page: Number(q.get('pagina') ?? 1)}); }],
    ['GET', /^\/graph\/neighbors\/([a-z-]+)\/(\d+)$/, async (u, [key, id], b, q) => {
      need(u, 'content.read');
      return (await graph.neighbors(key, Number(id), {layers: layersOf(q)})) ?? notFound('Nu există');
    }],
    ['GET', /^\/graph\/path$/, (u, m, b, q) => { need(u, 'content.read'); return {steps: graph.path(parseRef(q.get('de')), parseRef(q.get('la')))}; }],
    ['GET', /^\/graph\/search$/, (u, m, b, q) => { need(u, 'content.read'); return graph.search(q.get('q')); }],
    ['GET', /^\/graph\/relation\/([a-z-]+\.[a-z_]+)$/, (u, [id]) => { need(u, 'content.read'); return graph.relation(id) ?? notFound('Relație necunoscută'); }],
    ['GET', /^\/graph\/health$/, u => { need(u, 'content.read'); return graph.health(); }],
    ['GET', /^\/graph\/edges$/, u => { need(u, 'content.read'); return graph.allRelations(); }],

    ['GET', /^\/inferred$/, u => { need(u, 'content.read'); return inferredGroups(store); }],
    ['POST', /^\/inferred\/([a-z-]+)\.([a-z_]+)$/, (u, [key, field], body) => store.bulkLinks(u, key, field, body.pairs ?? [], body.action)],
    ['POST', /^\/provenance\/(\d+)\/confirm$/, (u, [id]) => store.confirmProvenance(u, Number(id))],
    ['GET', /^\/sources$/, u => {
      need(u, 'content.read');
      return db.all(`SELECT s.id, s.kind, s.url, s.title, s.fetched_at, s.snapshot_file, COUNT(p.id) AS uses,
        SUM(CASE WHEN p.certainty = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN p.certainty = 'unverified' THEN 1 ELSE 0 END) AS unverified,
        SUM(CASE WHEN p.certainty = 'inferred' THEN 1 ELSE 0 END) AS inferred
        FROM sources s LEFT JOIN provenance p ON p.source_id = s.id
        GROUP BY s.id, s.kind, s.url, s.title, s.fetched_at, s.snapshot_file ORDER BY s.kind, s.url`);
    }],
    ['GET', /^\/todos$/, u => { need(u, 'content.read'); return todos.list(); }],

    ['GET', /^\/sync$/, async u => {
      need(u, 'content.read');
      return {...await sync.status(),
        events: await db.all('SELECT id, at, user_name, action, entity, entity_id, label, status, attempts, last_error, affected FROM change_events ORDER BY id DESC LIMIT 50')};
    }],
    ['GET', /^\/sync\/(\d+)$/, (u, [id]) => { need(u, 'content.read'); return db.all('SELECT path, action, detail, at FROM sync_log WHERE event_id = ? ORDER BY id', [Number(id)]); }],
    ['POST', /^\/sync\/retry\/(\d+)$/, (u, [id]) => { need(u, 'content.write'); return sync.retry(Number(id)); }],
    ['POST', /^\/sync\/scan$/, u => { need(u, 'content.write'); return sync.scan(); }],

    ['GET', /^\/users$/, u => { need(u, 'users.write'); return auth.listUsers(); }],
    ['POST', /^\/users$/, (u, m, body) => { need(u, 'users.write'); return auth.createUser(body); }],
    ['PUT', /^\/users\/(\d+)$/, (u, [id], body) => { need(u, 'users.write'); return auth.updateUser(Number(id), body); }]
  ];

  async function handle(method, path, user, body, query = new URLSearchParams()) {
    for (const [m, re, fn] of routes) {
      if (m !== method) continue;
      const match = re.exec(path);
      if (match) return fn(user, match.slice(1), body ?? {}, query);
    }
    throw new HttpError(404, `Ruta nu există: ${method} ${path}`);
  }

  return Object.assign(handle, {whereUsed, provenanceOf, historyOf, appearsIn, appearsInAll});
}
