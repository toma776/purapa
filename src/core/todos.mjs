// „De făcut” (§1.8): observații calculate, cu impact și link direct la câmp. Nimic nu e întreținut de mână.
import {ENTITIES, byKey, titleOf} from '../registry/entities.mjs';
import {VALUES} from './values.mjs';
import {inferredCount} from './inferred.mjs';

const RANK = {mare: 0, mediu: 1, mic: 2};
const edit = (key, id, field) => `/manage/entitati/${key}/${id}/detalii/${field ? `?camp=${field}` : ''}`;

export function createTodos(db, store, graph) {
  function forRecord(d, r) {
    const out = [];
    const title = titleOf(d, r);
    const live = d.noStatus || r.status === 'published';
    for (const f of d.fields) {
      if (f.required && f.type !== 'refs' && (r[f.key] == null || r[f.key] === ''))
        out.push({impact: live ? 'mare' : 'mediu', kind: 'obligatoriu', key: d.key, id: r.id, title, text: `„${f.label}” e gol`, href: edit(d.key, r.id, f.key)});
      if (typeof r[f.key] !== 'string') continue;
      if (r[f.key].includes('[[de-validat:'))
        out.push({impact: 'mare', kind: 'de-validat', key: d.key, id: r.id, title, text: `„${f.label}” are text de validat`, href: edit(d.key, r.id, f.key)});
      for (const m of r[f.key].matchAll(/\{([a-z_]+)\}/g))
        if (!VALUES[m[1]]) out.push({impact: 'mare', kind: 'jeton', key: d.key, id: r.id, title, text: `jeton necunoscut {${m[1]}} în „${f.label}”`, href: edit(d.key, r.id, f.key)});
    }
    if (d.approval && (r.status === 'draft' || r.draft))
      out.push({impact: 'mediu', kind: 'aprobare', key: d.key, id: r.id, title, text: r.draft ? 'are o ciornă care așteaptă aprobare' : 'ciornă care așteaptă aprobare', href: edit(d.key, r.id)});
    return out;
  }

  function list() {
    const out = [];
    for (const d of ENTITIES.filter(x => !x.operational)) for (const r of store.list(d.key)) out.push(...forRecord(d, r));
    for (const b of graph.health().broken)
      out.push({impact: 'mare', kind: 'rupt', key: b.from.key, id: b.from.id, title: b.from.title, text: `trimitere ruptă spre ${b.to}`, href: edit(b.from.key, b.from.id)});
    const failed = db.prepare("SELECT COUNT(*) n FROM change_events WHERE status = 'failed'").get().n;
    if (failed) out.push({impact: 'mare', kind: 'propagare', text: `${failed} propagări eșuate`, href: '/manage/#propagare'});
    // Constatările ultimului import (contradicții între surse, sitemap, prețuri): de lămurit de un om.
    const imported = JSON.parse(db.prepare("SELECT value FROM meta WHERE key = 'import_findings'").get()?.value ?? 'null');
    for (const f of imported?.findings ?? []) {
      const product = f.extern_id ? db.prepare('SELECT id FROM products WHERE extern_id = ?').get(f.extern_id) : null;
      out.push({impact: f.impact, kind: `import:${f.kind}`, text: f.text,
        href: product ? edit('produse', product.id, 'price') : '/manage/surse/'});
    }
    const inferred = inferredCount(db);
    if (inferred) out.push({impact: 'mediu', kind: 'legaturi', text: `${inferred} legături de verificat`, href: '/manage/surse/legaturi/'});
    return out.sort((a, b) => RANK[a.impact] - RANK[b.impact]);
  }

  const forEntity = (key, id) => {
    const d = byKey[key], r = store.get(key, id);
    return r ? forRecord(d, r) : [];
  };

  return {list, forEntity};
}
