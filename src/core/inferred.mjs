// „Legături de verificat” (§2.5): legăturile deduse sau neverificate, grupate pe relație și pe dovadă,
// cu o recomandare pe grup și ordonate după scorul de încredere.
import {ENTITIES, byKey, relTable, titleOf} from '../registry/entities.mjs';

const THRESHOLD = 0.9;

function evidenceOf(row) {
  if (!row.s_kind) return {key: 'fara-dovada', label: 'Fără dovadă salvată'};
  if (row.s_url?.startsWith('rule:')) return {key: row.s_url, label: `Regulă: ${row.s_title ?? row.s_url.slice(5)}`};
  if (row.s_url?.startsWith('text:')) return {key: 'nume-in-text', label: 'Numele în text'};
  if (row.s_kind === 'site') return {key: `site`, label: 'Mențiune extrasă la import, cu fragment'};
  if (row.s_kind === 'endpoint') return {key: 'endpoint', label: 'Din datele unui partener'};
  return {key: row.s_kind, label: row.s_method ?? row.s_kind};
}

export function inferredGroups(db, store) {
  const groups = new Map();
  for (const d of ENTITIES) {
    for (const f of d.fields.filter(x => x.type === 'refs')) {
      const rows = db.prepare(`SELECT r.*, s.kind s_kind, s.url s_url, s.title s_title, s.method s_method
        FROM "${relTable(d, f)}" r LEFT JOIN sources s ON s.id = r.source_id WHERE r.status != 'confirmed'`).all();
      for (const row of rows) {
        const ev = evidenceOf(row);
        const id = `${d.key}.${f.key}|${ev.key}`;
        const g = groups.get(id) ?? {id, relation: `${d.key}.${f.key}`, source: d.key, field: f.key, target: f.target,
          label: `${d.label} ${f.rel ?? f.label} ${byKey[f.target].label}`, evidence: ev.label, sensitive: !!f.sensitive,
          approval: !!(f.sensitive || d.approval || byKey[f.target].approval), threshold: f.threshold ?? THRESHOLD, items: []};
        g.items.push({src: row.src_id, dst: row.dst_id, srcTitle: titleOf(d, store.get(d.key, row.src_id)),
          dstTitle: titleOf(byKey[f.target], store.get(f.target, row.dst_id)), status: row.status, confidence: row.confidence,
          note: row.note, source: row.s_url, created_by: row.created_by});
        groups.set(id, g);
      }
    }
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const conf = g.items.map(i => i.confidence ?? 0);
    g.recommendation = conf.every(c => c >= g.threshold) ? 'confirmă' : conf.every(c => c > 0 && c < 0.3) ? 'scoate' : 'una câte una';
    return g;
  }).sort((a, b) => b.items.length - a.items.length);
}

export const inferredCount = (db) => ENTITIES.flatMap(d => d.fields.filter(f => f.type === 'refs')
  .map(f => db.prepare(`SELECT COUNT(*) n FROM "${relTable(d, f)}" WHERE status != 'confirmed'`).get().n)).reduce((a, b) => a + b, 0);
