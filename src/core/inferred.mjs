// „Legături de verificat” (§2.5): legăturile deduse sau neverificate, grupate pe relație și pe dovadă,
// cu o recomandare pe grup și ordonate după scorul de încredere.
import {ENTITIES, byKey, titleOf} from '../registry/entities.mjs';

const THRESHOLD = 0.9;

function evidenceOf(src) {
  if (!src) return {key: 'fara-dovada', label: 'Fără dovadă salvată'};
  if (src.url?.startsWith('rule:')) return {key: src.url, label: `Regulă: ${src.title ?? src.url.slice(5)}`};
  if (src.url?.startsWith('text:')) return {key: 'nume-in-text', label: 'Numele în text'};
  if (src.kind === 'site') return {key: 'site', label: 'Mențiune extrasă la import, cu fragment'};
  if (src.kind === 'endpoint') return {key: 'endpoint', label: 'Din datele unui partener'};
  return {key: src.kind, label: src.method ?? src.kind};
}

const unconfirmed = store => ENTITIES.flatMap(d => d.fields.filter(f => f.type === 'refs')
  .flatMap(f => store.relRows(d, f).filter(l => l.status !== 'confirmed').map(l => ({d, f, l}))));

export async function inferredGroups(store) {
  const rows = unconfirmed(store);
  const ids = [...new Set(rows.map(r => r.l.source_id).filter(Boolean))];
  const sources = new Map();
  if (ids.length) for (const s of await store.db.all(`SELECT * FROM sources WHERE id IN (${ids.map(() => '?').join(', ')})`, ids)) sources.set(s.id, s);
  const groups = new Map();
  for (const {d, f, l} of rows) {
    const src = sources.get(l.source_id) ?? null;
    const ev = evidenceOf(src);
    const id = `${d.key}.${f.key}|${ev.key}`;
    const g = groups.get(id) ?? {id, relation: `${d.key}.${f.key}`, source: d.key, field: f.key, target: f.target,
      label: `${d.label} ${f.rel ?? f.label} ${byKey[f.target].label}`, evidence: ev.label, sensitive: !!f.sensitive,
      approval: !!(f.sensitive || d.approval || byKey[f.target].approval), threshold: f.threshold ?? THRESHOLD, items: []};
    g.items.push({src: l.src_id, dst: l.id, srcTitle: titleOf(d, store.get(d.key, l.src_id)), dstTitle: titleOf(byKey[f.target], store.get(f.target, l.id)),
      status: l.status, confidence: l.confidence, note: l.note, source: src?.url ?? null, created_by: l.created_by});
    groups.set(id, g);
  }
  return [...groups.values()].map(g => {
    g.items.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const conf = g.items.map(i => i.confidence ?? 0);
    g.recommendation = conf.every(c => c >= g.threshold) ? 'confirmă' : conf.every(c => c > 0 && c < 0.3) ? 'scoate' : 'una câte una';
    return g;
  }).sort((a, b) => b.items.length - a.items.length);
}

export const inferredCount = store => unconfirmed(store).length;
