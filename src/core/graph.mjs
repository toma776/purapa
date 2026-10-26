// Graful hărții (§2.4): muchiile se calculează din relațiile salvate, din imagini și din texte (data-ref, ref:).
// Datele purapa sunt mici, deci graful se calculează la cerere; nimic nu e întreținut de mână.
import {ENTITIES, byKey, relTable, titleOf, RELATION_TYPES} from '../registry/entities.mjs';

const LINK_RE = /data-ref="([a-z-]+):(\d+)"|\bref:([a-z-]+):(\d+)/g;
const MEDIA_RE = /data-media="(\d+)"/g;

export const LAYERS = ['relatii', 'imagini', 'texte'];

export function createGraph(db, store) {
  const types = () => ENTITIES.filter(d => !d.operational);
  const titleFor = (key, id) => titleOf(byKey[key], store.get(key, id));

  // Toate muchiile, pe straturi. `broken` = ținta nu mai există.
  function edges({layers = LAYERS} = {}) {
    const out = [];
    for (const d of types()) {
      for (const f of d.fields) {
        if (f.type === 'ref' && layers.includes('relatii')) {
          for (const r of db.prepare(`SELECT id, "${f.key}" v FROM "${d.table}" WHERE "${f.key}" IS NOT NULL`).all())
            out.push({rel: `${d.key}.${f.key}`, from: [d.key, r.id], to: [f.target, r.v], status: 'confirmed', layer: 'relatii'});
        }
        if (f.type === 'image' && layers.includes('imagini')) {
          for (const r of db.prepare(`SELECT id, "${f.key}" v FROM "${d.table}" WHERE "${f.key}" IS NOT NULL`).all())
            out.push({rel: `${d.key}.${f.key}`, from: [d.key, r.id], to: ['media', r.v], status: 'confirmed', layer: 'imagini'});
        }
        if (f.type === 'refs' && layers.includes('relatii')) {
          for (const r of db.prepare(`SELECT * FROM "${relTable(d, f)}"`).all())
            out.push({rel: `${d.key}.${f.key}`, from: [d.key, r.src_id], to: [f.target, r.dst_id], status: r.status, confidence: r.confidence,
              note: r.note, created_by: r.created_by, created_at: r.created_at, sensitive: !!f.sensitive, layer: 'relatii'});
        }
        if ((f.type === 'richtext' || f.key === 'cta_link') && layers.includes('texte')) {
          for (const r of db.prepare(`SELECT id, "${f.key}" v FROM "${d.table}" WHERE "${f.key}" IS NOT NULL`).all()) {
            for (const m of String(r.v).matchAll(LINK_RE)) {
              const key = m[1] ?? m[3], id = Number(m[2] ?? m[4]);
              if (!byKey[key]) continue;
              out.push({rel: `${d.key}.${f.key}~text`, from: [d.key, r.id], to: [key, id], status: 'confirmed', layer: 'texte', broken: !store.get(key, id)});
            }
            for (const m of String(r.v).matchAll(MEDIA_RE))
              out.push({rel: `${d.key}.${f.key}~media`, from: [d.key, r.id], to: ['media', Number(m[1])], status: 'confirmed', layer: 'texte', broken: !store.get('media', Number(m[1]))});
          }
        }
      }
    }
    return out;
  }

  const counts = () => Object.fromEntries(types().map(d => [d.key, db.prepare(`SELECT COUNT(*) n FROM "${d.table}"`).get().n]));

  // Nivelul 1: tipurile, pe categorii, și legăturile dintre ele (grosime ∝ √n în interfață).
  function overview({layers = LAYERS} = {}) {
    const n = counts();
    const agg = new Map();
    for (const e of edges({layers})) {
      const id = e.layer === 'texte' ? `${e.from[0]}→${e.to[0]}~texte` : e.rel;
      const a = agg.get(id) ?? {id, source: e.from[0], target: e.to[0], layer: e.layer, count: 0, unconfirmed: 0, broken: 0,
        verb: RELATION_TYPES.find(r => r.id === e.rel)?.verb ?? 'trimite în text la', sensitive: !!e.sensitive};
      a.count++;
      if (e.status !== 'confirmed') a.unconfirmed++;
      if (e.broken) a.broken++;
      agg.set(id, a);
    }
    // Perechile posibile, declarate în registru dar încă nefolosite, apar punctate.
    for (const r of RELATION_TYPES) {
      if (agg.has(r.id) || byKey[r.source].operational) continue;
      const layer = r.storage.includes('.') && byKey[r.source].fields.find(f => f.key === r.field)?.type === 'image' ? 'imagini' : 'relatii';
      if (layers.includes(layer)) agg.set(r.id, {id: r.id, source: r.source, target: r.target, layer, count: 0, unconfirmed: 0, broken: 0, verb: r.verb, sensitive: r.sensitive, possible: true});
    }
    const cats = [...new Set(types().map(d => d.category))];
    return {
      categories: cats,
      types: types().map(d => ({key: d.key, label: d.label, one: d.one, category: d.category, color: d.color, count: n[d.key], hub: d.hub !== false})),
      relations: [...agg.values()]
    };
  }

  function degrees(layers = LAYERS) {
    const deg = new Map();
    const bump = ([k, id]) => deg.set(`${k}:${id}`, (deg.get(`${k}:${id}`) ?? 0) + 1);
    for (const e of edges({layers})) { bump(e.from); bump(e.to); }
    return deg;
  }

  // Nivelul 2: membrii unui tip, cei mai conectați primii, câte 40 pe pagină.
  function members(key, {q = '', page = 1, per = 40} = {}) {
    const d = store.def(key);
    const deg = degrees();
    const needle = q.toLowerCase();
    const all = store.list(key).map(r => ({id: r.id, title: titleOf(d, r), status: d.noStatus ? 'published' : r.status, degree: deg.get(`${key}:${r.id}`) ?? 0}))
      .filter(r => !needle || r.title.toLowerCase().includes(needle))
      .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title, 'ro'));
    return {key, label: d.label, total: all.length, page, pages: Math.max(1, Math.ceil(all.length / per)), items: all.slice((page - 1) * per, page * per)};
  }

  // Nivelul 3: o entitate, cu intrările (stânga), ieșirile (dreapta) și paginile care o afișează.
  function neighbors(key, id, {layers = LAYERS} = {}) {
    const d = store.def(key), rec = store.get(key, id);
    if (!rec) return null;
    const item = (k, i, e, dir) => {
      const r = RELATION_TYPES.find(x => x.id === e.rel);
      return {key: k, id: i, title: titleFor(k, i), type: byKey[k].one, color: byKey[k].color, rel: dir === 'out' ? r?.verb ?? 'trimite în text la' : r?.inverseLabel ?? 'Menționat în',
        relId: e.rel, status: e.status, confidence: e.confidence ?? null, sensitive: !!e.sensitive, note: e.note ?? null, created_by: e.created_by ?? null,
        layer: e.layer, broken: !!e.broken};
    };
    const incoming = [], outgoing = [];
    for (const e of edges({layers})) {
      if (e.to[0] === key && e.to[1] === id) incoming.push(item(e.from[0], e.from[1], e, 'in'));
      if (e.from[0] === key && e.from[1] === id) outgoing.push(item(e.to[0], e.to[1], e, 'out'));
    }
    const group = list => Object.values(list.reduce((acc, x) => ((acc[x.key] ??= {key: x.key, label: byKey[x.key].label, color: byKey[x.key].color, items: []}).items.push(x), acc), {}));
    return {
      node: {key, id, title: titleOf(d, rec), type: d.one, color: d.color, status: d.noStatus ? 'published' : rec.status},
      incoming: group(incoming), outgoing: group(outgoing), pages: pagesOf(key, id)
    };
  }

  // Paginile care afișează o înregistrare, grupate pe componentă (din dependențele măsurate).
  function pagesOf(key, id) {
    const rows = db.prepare("SELECT path, kind, component, reason FROM page_deps WHERE entity = ? AND entity_id = ? AND kind != 'pending'").all(key, id);
    const out = [];
    for (const r of rows) {
      if (!r.path.startsWith('#layout:')) { out.push(r); continue; }
      const name = r.path.slice(8);
      for (const p of db.prepare("SELECT DISTINCT path FROM page_deps WHERE kind = 'layout' AND component = ?").all(name))
        out.push({...r, path: p.path, via: name});
    }
    const byPath = new Map();
    for (const r of out) {
      const g = byPath.get(r.path) ?? {path: r.path, uses: []};
      const label = `${r.component || 'pagina'}${r.reason ? ` — ${r.reason}` : ''}`;
      if (!g.uses.some(u => u.label === label)) g.uses.push({label, kind: r.kind, via: r.via ?? null});
      byPath.set(r.path, g);
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  // Traseul cel mai scurt: BFS, cel mult 6 pași, fără media ca intermediar.
  function path(from, to, {max = 6} = {}) {
    const adj = new Map();
    const link = (a, b, e) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, e]); };
    for (const e of edges({layers: ['relatii', 'texte']})) {
      if (e.status !== 'confirmed') continue;
      const a = e.from.join(':'), b = e.to.join(':');
      link(a, b, e); link(b, a, e);
    }
    const start = from.join(':'), goal = to.join(':');
    const prev = new Map([[start, null]]);
    let frontier = [start];
    for (let depth = 0; depth < max && frontier.length && !prev.has(goal); depth++) {
      const next = [];
      for (const node of frontier) {
        if (node !== start && node.startsWith('media:')) continue;
        for (const [nb, e] of adj.get(node) ?? []) {
          if (prev.has(nb)) continue;
          prev.set(nb, [node, e]);
          next.push(nb);
        }
      }
      frontier = next;
    }
    if (!prev.has(goal)) return null;
    const steps = [];
    for (let cur = goal; cur; cur = prev.get(cur)?.[0]) {
      const [k, id] = cur.split(':');
      const e = prev.get(cur)?.[1];
      steps.unshift({key: k, id: Number(id), title: titleFor(k, Number(id)), type: byKey[k].one, color: byKey[k].color,
        via: e ? RELATION_TYPES.find(r => r.id === e.rel)?.verb ?? 'în text' : null});
    }
    return steps;
  }

  function search(q, limit = 20) {
    const needle = `%${String(q ?? '').toLowerCase()}%`;
    if (needle === '%%') return [];
    const out = [];
    for (const d of types()) {
      for (const r of db.prepare(`SELECT id FROM "${d.table}" WHERE search LIKE ? LIMIT ?`).all(needle, limit))
        out.push({key: d.key, id: r.id, title: titleFor(d.key, r.id), type: d.one, color: d.color});
    }
    return out.slice(0, limit);
  }

  // Panoul unei relații (clic pe o muchie): stocarea, cifrele reale, de unde se editează, ce se întâmplă la ștergere.
  function relation(relId) {
    const r = RELATION_TYPES.find(x => x.id === relId);
    if (!r) return null;
    const d = byKey[r.source], f = d.fields.find(x => x.key === r.field);
    const es = edges().filter(e => e.rel === relId);
    const requiredEmpty = f.required && f.type !== 'refs' ? db.prepare(`SELECT COUNT(*) n FROM "${d.table}" WHERE "${f.key}" IS NULL`).get().n : 0;
    return {
      ...r, sourceLabel: d.label, targetLabel: byKey[r.target].label,
      links: es.length, sources: new Set(es.map(e => e.from[1])).size, targets: new Set(es.map(e => e.to[1])).size,
      unconfirmed: es.filter(e => e.status !== 'confirmed').length, broken: es.filter(e => e.broken).length, requiredEmpty,
      examples: es.slice(0, 3).map(e => `${titleFor(...e.from)} → ${titleFor(...e.to)}`),
      editedFrom: f.type === 'refs' ? `${d.label} (câmpul „${f.label}”) și din ${byKey[r.target].label} (tab-ul „${r.inverseLabel}”)` : `${d.label} (câmpul „${f.label}”)`,
      onDelete: f.type === 'refs'
        ? `ștergerea oricărui capăt scoate legătura${f.owned ? '; legătura e deținută, nu blochează ștergerea' : `; o țintă folosită aici nu se poate șterge`}`
        : f.required ? 'ștergerea țintei e blocată cât timp e folosită' : 'la ștergerea țintei câmpul se golește'
    };
  }

  // Tabelul „Toate legăturile”: fiecare relație, cu numărul de legături și câte sunt rupte.
  function allRelations() {
    const es = edges();
    const rows = RELATION_TYPES.filter(r => !byKey[r.source].operational).map(r => {
      const mine = es.filter(e => e.rel === r.id);
      return {id: r.id, group: byKey[r.source].category, source: byKey[r.source].label, verb: r.verb, target: byKey[r.target].label,
        cardinality: r.cardinality, count: mine.length, unconfirmed: mine.filter(e => e.status !== 'confirmed').length, broken: 0, sensitive: r.sensitive};
    });
    const text = new Map();
    for (const e of es.filter(e => e.layer === 'texte')) {
      const id = `${e.from[0]}→${e.to[0]}~texte`;
      const t = text.get(id) ?? {id, group: byKey[e.from[0]].category, source: byKey[e.from[0]].label, verb: 'trimite în text la', target: byKey[e.to[0]].label,
        cardinality: 'text', count: 0, unconfirmed: 0, broken: 0};
      t.count++;
      if (e.broken) t.broken++;
      text.set(id, t);
    }
    return [...rows, ...text.values()];
  }

  // Sănătatea hărții (§2.4): tipuri izolate, relații nefolosite, trimiteri rupte, obligatorii goale, orfane.
  function health() {
    const es = edges();
    const n = counts();
    const touchedTypes = new Set(es.flatMap(e => [e.from[0], e.to[0]]));
    const deg = degrees();
    const requiredEmpty = [];
    for (const d of types()) for (const f of d.fields) {
      if (!f.required || f.type === 'refs') continue;
      const rows = db.prepare(`SELECT id FROM "${d.table}" WHERE "${f.key}" IS NULL OR "${f.key}" = ''`).all();
      for (const r of rows) requiredEmpty.push({key: d.key, id: r.id, field: f.key, title: titleFor(d.key, r.id), label: f.label});
    }
    const orphans = [];
    for (const d of types()) {
      if (d.singleton || d.key === 'media' || d.noStatus && d.hub === false) continue;
      for (const r of store.list(d.key)) if (!deg.get(`${d.key}:${r.id}`)) orphans.push({key: d.key, id: r.id, title: titleOf(d, r), type: d.one});
    }
    return {
      isolatedTypes: types().filter(d => n[d.key] > 0 && !touchedTypes.has(d.key) && !d.singleton).map(d => ({key: d.key, label: d.label})),
      unusedRelations: allRelations().filter(r => r.cardinality !== 'text' && r.count === 0).map(r => ({id: r.id, label: `${r.source} ${r.verb} ${r.target}`})),
      broken: es.filter(e => e.broken).map(e => ({from: {key: e.from[0], id: e.from[1], title: titleFor(...e.from)}, to: `${e.to[0]}:${e.to[1]}`, rel: e.rel})),
      requiredEmpty, orphans
    };
  }

  // Numele entităților găsite în texte fără legătură salvată (nivelul 4 din „Unde apare”, §1.6 b).
  // Doar la tipurile cu `mentions`, doar nume lungi (≥ 8 caractere sau ≥ 2 cuvinte), cu granițe de cuvânt.
  function mentionsOf(key, id) {
    const d = store.def(key), rec = store.get(key, id);
    if (!d.mentions || !rec) return [];
    const names = [titleOf(d, rec), ...db.prepare('SELECT alias FROM aliases WHERE entity = ? AND entity_id = ?').all(key, id).map(a => a.alias)]
      .filter(n => n.length >= 8 || n.trim().split(/\s+/).length >= 2);
    if (!names.length) return [];
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
    const linked = new Set(edges({layers: ['relatii', 'texte']}).filter(e => e.to[0] === key && e.to[1] === id).map(e => e.from.join(':')));
    const out = [];
    for (const od of types()) {
      const textFields = od.fields.filter(f => ['richtext', 'textarea', 'text'].includes(f.type) && f.key !== od.title);
      if (!textFields.length) continue;
      for (const r of store.list(od.key)) {
        if (od.key === key && r.id === id) continue;
        if (linked.has(`${od.key}:${r.id}`)) continue;
        for (const f of textFields) {
          const plain = String(r[f.key] ?? '').replace(/<[^>]+>/g, ' ');
          const m = re.exec(plain);
          if (m) {
            const at = m.index;
            out.push({key: od.key, id: r.id, title: titleOf(od, r), field: f.key, excerpt: `…${plain.slice(Math.max(0, at - 40), at + m[0].length + 40).trim()}…`});
            break;
          }
        }
      }
    }
    return out;
  }

  return {edges, overview, members, neighbors, pagesOf, path, search, relation, allRelations, health, mentionsOf};
}
