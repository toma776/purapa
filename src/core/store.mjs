// Store: orice modificare trece pe aici și scrie, în aceeași tranzacție, modificarea, istoricul și evenimentul (§3.3).
import {tx, afterCommit, nowIso} from './db.mjs';
import {ENTITIES, byKey, relFields, relTable, titleOf, publicPath, JSON_TYPES, RESERVED_SLUGS} from '../registry/entities.mjs';
import {sanitizeContent} from './content.mjs';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

export const SYSTEM = {name: 'Sistem', role: 'admin', perms: new Set(['*'])};

export const ROLES = {
  admin: ['*'],
  editor: ['content.read', 'content.write', 'content.publish', 'media.read', 'media.write'],
  viewer: ['content.read', 'media.read']
};
export const userFor = (name, role) => ({name, role, perms: new Set(ROLES[role])});
export const can = (user, perm) => !!user?.perms && (user.perms.has('*') || user.perms.has(perm));
const need = (user, perm) => { if (!can(user, perm)) throw new HttpError(403, `Lipsește dreptul ${perm}`); };

const publishPerm = d => d.approval ? 'content.approve' : 'content.publish';
const isVisible = (d, r) => !!r && !d.operational && (d.noStatus || r.status === 'published');
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function slugify(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

export function createStore(db) {
  const listeners = new Set();
  const def = key => byKey[key] ?? (() => { throw new HttpError(404, `Tip necunoscut: ${key}`); })();
  const fieldOf = (d, key) => d.fields.find(f => f.key === key) ?? (() => { throw new HttpError(404, `Câmp necunoscut: ${d.key}.${key}`); })();

  function decode(d, row) {
    if (!row) return null;
    const r = {...row};
    for (const f of d.fields) {
      if (JSON_TYPES.has(f.type) && r[f.key] != null) r[f.key] = JSON.parse(r[f.key]);
      if (f.type === 'boolean' && r[f.key] != null) r[f.key] = !!r[f.key];
    }
    if (r.draft != null) r.draft = JSON.parse(r.draft);
    return r;
  }

  const get = (key, id) => { const d = def(key); return decode(d, db.prepare(`SELECT * FROM "${d.table}" WHERE id = ?`).get(id)); };
  const list = key => { const d = def(key); return db.prepare(`SELECT * FROM "${d.table}" ORDER BY id`).all().map(r => decode(d, r)); };
  const bySlug = (key, slug) => { const d = def(key); return decode(d, db.prepare(`SELECT * FROM "${d.table}" WHERE slug = ?`).get(slug)); };

  function links(key, id, fieldKey) {
    const d = def(key), f = fieldOf(d, fieldKey);
    return db.prepare(`SELECT * FROM "${relTable(d, f)}" WHERE src_id = ? ORDER BY position, dst_id`).all(id)
      .map(r => ({id: r.dst_id, position: r.position, status: r.status, confidence: r.confidence, source_id: r.source_id,
        note: r.note, attrs: r.attrs ? JSON.parse(r.attrs) : null, created_at: r.created_at, created_by: r.created_by}));
  }

  // Scope-urile unei înregistrări: vecinătățile relațiilor ei (cheile străine și legăturile confirmate).
  function scopesOf(d, rec) {
    const out = [];
    for (const f of d.fields) {
      if (f.type === 'ref' && rec[f.key] != null) out.push(`${f.target}:${rec[f.key]}`);
      if (f.type === 'refs') for (const l of links(d.key, rec.id, f.key)) if (l.status === 'confirmed') out.push(`${f.target}:${l.id}`);
    }
    return out;
  }

  // Instantaneul din eveniment: tot ce trebuie ca affected() să decidă fără să recitească baza.
  function snap(d, rec) {
    if (!rec) return null;
    const visible = isVisible(d, rec);
    const vals = {};
    for (const f of d.fields) if (f.type !== 'refs' && f.type !== 'richtext' && !JSON_TYPES.has(f.type)) vals[f.key] = rec[f.key] ?? null;
    const path = visible ? publicPath(d, rec) : null;
    return {status: d.noStatus ? 'published' : rec.status, paths: path ? [path] : [], scopes: scopesOf(d, rec), title: titleOf(d, rec), vals};
  }

  function emit(user, action, key, id, before, after, extra = {}) {
    db.prepare('INSERT INTO change_events (at, user_name, action, entity, entity_id, label, payload) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(nowIso(), user?.name ?? 'Sistem', action, key, id, (after ?? before)?.title ?? null, JSON.stringify({before, after, ...extra}));
    afterCommit(db, () => { for (const l of listeners) l({key, id, action}); });
  }

  function audit(user, action, key, id, label, changes) {
    db.prepare('INSERT INTO audit_log (at, user_name, action, entity, entity_id, label, changes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(nowIso(), user?.name ?? 'Sistem', action, key, id, label, JSON.stringify(changes));
  }

  // O sursă apare o singură dată; un reimport îi actualizează data descărcării și fișierul din snapshot.
  function sourceId(src) {
    const found = db.prepare('SELECT id FROM sources WHERE url = ?').get(src.url);
    if (found) {
      if (src.fetched_at || src.snapshot_file) db.prepare('UPDATE sources SET fetched_at = COALESCE(?, fetched_at), snapshot_file = COALESCE(?, snapshot_file), status = COALESCE(?, status) WHERE id = ?')
        .run(src.fetched_at ?? null, src.snapshot_file ?? null, src.status ?? null, found.id);
      return found.id;
    }
    return Number(db.prepare('INSERT INTO sources (kind, url, title, fetched_at, method, snapshot_file, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(src.kind, src.url, src.title ?? null, src.fetched_at ?? null, src.method ?? null, src.snapshot_file ?? null, src.status ?? null, src.note ?? null, nowIso()).lastInsertRowid);
  }

  // Fiecare câmp scris își scrie sursa: importul pe a lui, o editare manuală pe „manual:<autor>” (§1.4).
  function provenance(user, key, id, fields, src) {
    if (!fields.length) return;
    const s = src ?? {kind: 'manual', url: `manual:${user?.name ?? 'Sistem'}`, title: `Introdus manual de ${user?.name ?? 'Sistem'}`};
    const sid = sourceId(s);
    const certainty = s.certainty ?? 'confirmed';
    const at = nowIso();
    const stmt = db.prepare(`INSERT INTO provenance (entity, entity_id, field, source_id, excerpt, method, certainty, confidence, verified_at, verified_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (entity, entity_id, field, source_id) DO UPDATE SET excerpt = excluded.excerpt, method = excluded.method,
        certainty = excluded.certainty, verified_at = excluded.verified_at, verified_by = excluded.verified_by, created_at = excluded.created_at`);
    for (const field of fields) {
      const manual = s.kind === 'manual' && certainty === 'confirmed';
      stmt.run(key, id, field, sid, s.excerpt ?? null, s.method ?? (src ? 'import' : 'editare manuală'), certainty,
        s.confidence ?? null, manual ? at : null, manual ? user?.name ?? 'Sistem' : null, at);
    }
  }

  function uniqueSlug(d, base, id, allowEmpty) {
    let slug = base;
    if (!slug && !allowEmpty) slug = d.key;
    if (RESERVED_SLUGS.has(slug)) slug = `${slug}-2`;
    const taken = s => db.prepare(`SELECT id FROM "${d.table}" WHERE slug = ? AND id IS NOT ?`).get(s, id ?? null);
    for (let n = 2; taken(slug); n++) slug = `${base || d.key}-${n}`;
    return slug;
  }

  // Codează fiecare câmp după tip și aplică regulile; întoarce doar coloanele prezente în `data`.
  function coerce(d, data, cur) {
    const out = {}, errors = {};
    for (const f of d.fields) {
      if (f.type === 'refs') continue;
      let present = Object.hasOwn(data, f.key);
      if (!present && !cur && f.type === 'slug' && f.from && data[f.from] != null) { data = {...data, [f.key]: slugify(data[f.from])}; present = true; }
      if (!present) {
        if (!cur && f.required) errors[f.key] = 'obligatoriu';
        continue;
      }
      if (f.readonly && cur) continue;
      let v = data[f.key];
      if (v === '' && !(f.type === 'slug' && f.allowEmpty)) v = null;
      if (v == null) {
        if (f.required) errors[f.key] = 'obligatoriu';
        out[f.key] = null;
        continue;
      }
      switch (f.type) {
        case 'int': v = Number.parseInt(v, 10); if (!Number.isFinite(v)) errors[f.key] = 'număr întreg'; break;
        case 'number': case 'money': v = Number(v); if (!Number.isFinite(v)) errors[f.key] = 'număr'; break;
        case 'boolean': v = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
        case 'email': v = String(v).trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.key] = 'email invalid'; break;
        case 'url': v = String(v).trim(); if (!/^(https?:\/\/|\/|ref:|mailto:|tel:)/.test(v)) errors[f.key] = 'adresă invalidă'; break;
        // Orice formă de adresă YouTube (watch, youtu.be, embed, shorts) sau doar codul; se păstrează codul.
        case 'youtube': {
          const m = /^(?:https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/))?([\w-]{11})(?:[?&#/].*)?$/.exec(String(v).trim());
          if (m) v = m[1]; else errors[f.key] = 'adresă YouTube invalidă';
          break;
        }
        case 'select': v = String(v); if (f.options && !f.options.includes(v)) errors[f.key] = `una din: ${f.options.join(', ')}`; break;
        case 'slug': v = uniqueSlug(d, slugify(v), cur?.id, f.allowEmpty); break;
        case 'richtext': v = sanitizeContent(String(v)); break;
        case 'ref': case 'image': {
          v = Number(v);
          const target = f.type === 'image' ? 'media' : f.target;
          const t = get(target, v);
          if (!t) errors[f.key] = `${byKey[target].one} #${v} nu există`;
          else if (f.only && !f.only(cur ?? data, t, api)) errors[f.key] = 'ținta nu e permisă aici';
          break;
        }
        default:
          if (JSON_TYPES.has(f.type)) v = JSON.stringify(v);
          else v = String(v).trim();
      }
      if (f.max && typeof v === 'string' && v.length > f.max) errors[f.key] = `cel mult ${f.max} caractere`;
      out[f.key] = v;
    }
    if (d.validate) Object.assign(errors, d.validate({...cur, ...data}) ?? {});
    if (Object.keys(errors).length) throw new HttpError(400, 'Date invalide', {errors});
    return out;
  }

  const changedFields = (d, cur, vals) => Object.keys(vals).filter(k => {
    const f = d.fields.find(x => x.key === k);
    const old = f && JSON_TYPES.has(f.type) && cur[k] != null ? JSON.stringify(cur[k]) : f?.type === 'boolean' && cur[k] != null ? Number(cur[k]) : cur[k];
    return !same(old, vals[k]);
  });

  function writeColumns(d, id, vals, user, extra = {}) {
    const all = {...vals, ...extra, updated_at: nowIso(), updated_by: user?.name ?? 'Sistem'};
    const keys = Object.keys(all);
    db.prepare(`UPDATE "${d.table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, version = version + 1 WHERE id = ?`)
      .run(...keys.map(k => all[k]), id);
    const rec = get(d.key, id);
    db.prepare(`UPDATE "${d.table}" SET search = ? WHERE id = ?`).run(titleOf(d, rec).toLowerCase(), id);
  }

  // 301 automat la schimbarea adresei: fără lanțuri și fără bucle (§3.8).
  function autoRedirect(from, to) {
    if (!from || !to || from === to) return;
    const at = nowIso();
    db.prepare('DELETE FROM redirects WHERE from_path = ?').run(to);
    db.prepare('UPDATE redirects SET to_path = ? WHERE to_path = ?').run(to, from);
    db.prepare('INSERT INTO redirects (from_path, to_path, auto, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (from_path) DO UPDATE SET to_path = excluded.to_path')
      .run(from, to, at);
  }

  function normalizeItems(items) {
    return (items ?? []).map(x => typeof x === 'object' ? {...x, id: Number(x.id)} : {id: Number(x)});
  }

  function writeLinks(user, d, id, f, items, src) {
    const t = relTable(d, f), target = byKey[f.target];
    const old = new Map(links(d.key, id, f.key).map(l => [l.id, l]));
    const rec = get(d.key, id);
    if (f.max && items.length > f.max) throw new HttpError(400, `Cel mult ${f.max} legături`);
    const sid = src ? sourceId(src) : null;
    db.prepare(`DELETE FROM "${t}" WHERE src_id = ?`).run(id);
    const ins = db.prepare(`INSERT INTO "${t}" (src_id, dst_id, position, status, confidence, source_id, note, attrs, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    items.forEach((it, i) => {
      const dst = get(target.key, it.id);
      if (!dst) throw new HttpError(400, `${target.one} #${it.id} nu există`);
      if (f.only && !f.only(rec, dst, api)) throw new HttpError(400, `${titleOf(target, dst)} nu e permis la „${f.label}”`);
      const prev = old.get(it.id);
      ins.run(id, it.id, f.ordered ? i : 0, it.status ?? prev?.status ?? 'confirmed', it.confidence ?? prev?.confidence ?? null,
        sid ?? prev?.source_id ?? null, it.note ?? prev?.note ?? null,
        it.attrs ? JSON.stringify(it.attrs) : prev?.attrs ? JSON.stringify(prev.attrs) : null,
        prev?.created_at ?? nowIso(), prev?.created_by ?? user?.name ?? 'Sistem');
    });
    const now = links(d.key, id, f.key);
    const touched = [...new Set([...old.keys(), ...now.map(l => l.id)])]
      .filter(dst => !same(old.get(dst) && [old.get(dst).status, old.get(dst).position], now.find(l => l.id === dst) && [now.find(l => l.id === dst).status, now.find(l => l.id === dst).position]))
      .map(dst => `${f.target}:${dst}`);
    return {old: [...old.values()], now, touched};
  }

  function create(user, key, data, {publish = false, source = null} = {}) {
    const d = def(key);
    need(user, 'content.write');
    if (publish && !d.noStatus) need(user, publishPerm(d));
    return tx(db, () => {
      if (d.singleton && db.prepare(`SELECT 1 FROM "${d.table}" LIMIT 1`).get()) throw new HttpError(409, `${d.label} există deja`);
      const vals = coerce(d, data, null);
      const at = nowIso();
      const base = {created_at: at, updated_at: at, created_by: user?.name ?? 'Sistem', updated_by: user?.name ?? 'Sistem'};
      if (!d.noStatus) Object.assign(base, {status: publish ? 'published' : 'draft', published_at: publish ? at : null});
      const row = {...vals, ...base};
      const cols = Object.keys(row);
      const id = Number(db.prepare(`INSERT INTO "${d.table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map(c => row[c])).lastInsertRowid);
      const touched = [];
      for (const f of relFields(d)) if (data[f.key]) touched.push(...writeLinks(user, d, id, f, normalizeItems(data[f.key]), source).touched);
      const rec = get(key, id);
      db.prepare(`UPDATE "${d.table}" SET search = ? WHERE id = ?`).run(titleOf(d, rec).toLowerCase(), id);
      provenance(user, key, id, Object.keys(vals).filter(k => vals[k] != null), source);
      audit(user, 'create', key, id, titleOf(d, rec), {after: rec});
      if (isVisible(d, rec)) emit(user, 'create', key, id, null, snap(d, rec), {touched});
      return get(key, id);
    });
  }

  // Salvare: pe o înregistrare publicată fără `publish`, scrie ciorna; site-ul rămâne neschimbat (§3.6).
  function update(user, key, id, data, {version = null, publish = false, source = null} = {}) {
    const d = def(key);
    need(user, 'content.write');
    if (publish && !d.noStatus) need(user, publishPerm(d));
    return tx(db, () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      if (version != null && Number(version) !== cur.version) throw new HttpError(409, 'Înregistrarea a fost modificată între timp', {current: cur});
      const clean = Object.fromEntries(Object.entries(data).filter(([k]) => d.fields.some(f => f.key === k && f.type !== 'refs')));

      if (!d.noStatus && cur.status === 'published' && !publish) {
        const draft = {...(cur.draft ?? {}), ...clean};
        coerce(d, draft, cur);
        db.prepare(`UPDATE "${d.table}" SET draft = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?`)
          .run(JSON.stringify(draft), nowIso(), user?.name ?? 'Sistem', id);
        audit(user, 'draft', key, id, titleOf(d, cur), {draft: clean});
        return get(key, id);
      }

      const merged = publish ? {...(cur.draft ?? {}), ...clean} : clean;
      const vals = coerce(d, merged, cur);
      const changed = changedFields(d, cur, vals);
      const before = snap(d, cur);
      const extra = {};
      if (!d.noStatus && publish) Object.assign(extra, {status: 'published', draft: null, published_at: cur.published_at ?? nowIso()});
      // Nimic de schimbat (de exemplu un reimport identic): niciun eveniment; importul își reîmprospătează doar sursele.
      const nothing = !changed.length && (d.noStatus || !publish || (cur.status === 'published' && !cur.draft));
      if (nothing) {
        if (source) provenance(user, key, id, Object.keys(vals), source);
        return cur;
      }
      writeColumns(d, id, Object.fromEntries(changed.map(k => [k, vals[k]])), user, extra);
      const rec = get(key, id);
      const after = snap(d, rec);
      if (before.paths[0] && after.paths[0]) autoRedirect(before.paths[0], after.paths[0]);
      provenance(user, key, id, source ? Object.keys(vals) : changed, source);
      audit(user, publish ? 'publish' : 'update', key, id, titleOf(d, rec),
        {fields: Object.fromEntries(changed.map(k => [k, [cur[k] ?? null, rec[k] ?? null]])), before: cur});
      if (isVisible(d, cur) || isVisible(d, rec)) emit(user, publish && cur.status !== 'published' ? 'publish' : 'update', key, id, before, after);
      return rec;
    });
  }

  const publish = (user, key, id, opts = {}) => update(user, key, id, {}, {...opts, publish: true});

  function setStatus(user, key, id, status) {
    const d = def(key);
    if (d.noStatus) throw new HttpError(400, `${d.label} nu au stare`);
    if (!['draft', 'published', 'archived'].includes(status)) throw new HttpError(400, 'Stare invalidă');
    if (status === 'published') return publish(user, key, id);
    need(user, 'content.write');
    // NOU (§1.9): retragerea sau arhivarea unui tip cu aprobare cere și ea aprobare.
    need(user, publishPerm(d));
    return tx(db, () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      if (cur.status === status) return cur;
      const before = snap(d, cur);
      writeColumns(d, id, {}, user, {status});
      const rec = get(key, id);
      audit(user, status, key, id, titleOf(d, rec), {status: [cur.status, status]});
      if (isVisible(d, cur)) emit(user, status === 'archived' ? 'archive' : 'unpublish', key, id, before, snap(d, rec));
      return rec;
    });
  }

  // Legăturile se editează din capătul sursei; schimbarea e live și ecranul o spune (§2.2).
  function setLinks(user, key, id, fieldKey, items, {source = null} = {}) {
    const d = def(key), f = fieldOf(d, fieldKey);
    if (f.type !== 'refs') throw new HttpError(400, `${fieldKey} nu e o relație multiplă`);
    need(user, 'content.write');
    if (f.sensitive) need(user, 'content.approve');
    return tx(db, () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      const before = snap(d, cur);
      const {old, now, touched} = writeLinks(user, d, id, f, normalizeItems(items), source);
      if (!touched.length) return {links: now, live: isVisible(d, cur)};
      writeColumns(d, id, {}, user);
      const rec = get(key, id);
      audit(user, 'links', key, id, titleOf(d, rec), {field: fieldKey, before: old, after: now});
      if (isVisible(d, rec)) emit(user, 'links', key, id, before, snap(d, rec), {touched, field: fieldKey});
      return {links: now, live: isVisible(d, rec)};
    });
  }

  // Legăturile din capătul invers: aceeași tranzacție, oricâte înregistrări-sursă atinge.
  function setInverse(user, key, id, srcKey, fieldKey, srcIds) {
    const sd = def(srcKey), f = fieldOf(sd, fieldKey);
    if (f.target !== key) throw new HttpError(400, `${srcKey}.${fieldKey} nu trimite la ${key}`);
    const want = new Set(srcIds.map(Number));
    return tx(db, () => {
      const current = db.prepare(`SELECT src_id FROM "${relTable(sd, f)}" WHERE dst_id = ?`).all(id).map(r => r.src_id);
      for (const s of new Set([...current, ...want])) {
        const items = links(srcKey, s, fieldKey);
        const has = items.some(l => l.id === id);
        if (want.has(s) && !has) setLinks(user, srcKey, s, fieldKey, [...items, {id}]);
        if (!want.has(s) && has) setLinks(user, srcKey, s, fieldKey, items.filter(l => l.id !== id));
      }
      return db.prepare(`SELECT src_id FROM "${relTable(sd, f)}" WHERE dst_id = ?`).all(id).map(r => r.src_id);
    });
  }

  // Starea unei legături. NOU (§1.9): cere aprobare dacă relația e sensibilă sau unul din capete are aprobare.
  function setLinkStatus(user, key, id, fieldKey, dst, status) {
    const d = def(key), f = fieldOf(d, fieldKey);
    if (!['confirmed', 'inferred', 'unverified'].includes(status)) throw new HttpError(400, 'Stare invalidă');
    need(user, 'content.write');
    if (f.sensitive || d.approval || byKey[f.target].approval) need(user, 'content.approve');
    return tx(db, () => {
      const cur = get(key, id);
      const before = snap(d, cur);
      const r = db.prepare(`UPDATE "${relTable(d, f)}" SET status = ? WHERE src_id = ? AND dst_id = ? AND status != ?`).run(status, id, dst, status);
      if (!r.changes) return links(key, id, fieldKey);
      writeColumns(d, id, {}, user);
      const rec = get(key, id);
      audit(user, 'link-status', key, id, titleOf(d, rec), {field: fieldKey, dst, status});
      if (isVisible(d, rec)) emit(user, 'link-status', key, id, before, snap(d, rec), {touched: [`${f.target}:${dst}`], field: fieldKey});
      return links(key, id, fieldKey);
    });
  }

  // Confirmarea sau scoaterea în masă (§2.5): o singură tranzacție, istoricul fiecărei înregistrări atinse, un singur eveniment.
  // Ce se scoate se ține minte, ca să nu mai fie propus din aceeași dovadă (§1.5).
  function bulkLinks(user, key, fieldKey, pairs, action) {
    const d = def(key), f = fieldOf(d, fieldKey);
    if (!['confirm', 'remove'].includes(action)) throw new HttpError(400, 'Acțiune invalidă');
    if (pairs.length > 5000) throw new HttpError(400, 'Cel mult 5.000 de perechi într-o operațiune');
    need(user, 'content.write');
    if (f.sensitive || d.approval || byKey[f.target].approval) need(user, 'content.approve');
    const t = relTable(d, f);
    return tx(db, () => {
      const bySrc = new Map();
      for (const [src, dst] of pairs) bySrc.set(Number(src), [...(bySrc.get(Number(src)) ?? []), Number(dst)]);
      const records = [], touched = [];
      let changed = 0;
      for (const [src, dsts] of bySrc) {
        const cur = get(key, src);
        if (!cur) continue;
        const before = snap(d, cur);
        const done = [];
        for (const dst of dsts) {
          const row = db.prepare(`SELECT * FROM "${t}" WHERE src_id = ? AND dst_id = ?`).get(src, dst);
          if (!row || row.status === 'confirmed') continue;
          if (action === 'confirm') db.prepare(`UPDATE "${t}" SET status = 'confirmed' WHERE src_id = ? AND dst_id = ?`).run(src, dst);
          else {
            db.prepare(`DELETE FROM "${t}" WHERE src_id = ? AND dst_id = ?`).run(src, dst);
            const ev = row.source_id ? db.prepare('SELECT url FROM sources WHERE id = ?').get(row.source_id)?.url : null;
            db.prepare(`INSERT INTO link_dismissals (relation, src_id, dst_id, evidence, at, by) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (relation, src_id, dst_id) DO UPDATE SET evidence = excluded.evidence, at = excluded.at, by = excluded.by`)
              .run(`${key}.${fieldKey}`, src, dst, ev ?? row.note ?? null, nowIso(), user?.name ?? 'Sistem');
          }
          done.push(dst);
          touched.push(`${f.target}:${dst}`);
        }
        if (!done.length) continue;
        changed += done.length;
        writeColumns(d, src, {}, user);
        const rec = get(key, src);
        audit(user, action === 'confirm' ? 'links-confirm' : 'links-remove', key, src, titleOf(d, rec), {field: fieldKey, dst: done});
        if (isVisible(d, rec)) records.push({key, id: src, before, after: snap(d, rec)});
      }
      if (records.length) {
        db.prepare('INSERT INTO change_events (at, user_name, action, entity, entity_id, label, payload) VALUES (?, ?, ?, ?, NULL, ?, ?)')
          .run(nowIso(), user?.name ?? 'Sistem', `bulk-${action}`, key, `${changed} legături ${action === 'confirm' ? 'confirmate' : 'scoase'}`,
            JSON.stringify({records, touched, field: fieldKey}));
        afterCommit(db, () => { for (const l of listeners) l({key, id: null, action: `bulk-${action}`}); });
      }
      return {changed, records: bySrc.size};
    });
  }

  // Confirmarea unei informații dintr-o sursă: certitudinea devine „confirmată”, cu cine și când (§1.4).
  // NOU (§1.9): pe tipurile cu aprobare cere `content.approve`.
  function confirmProvenance(user, provId) {
    need(user, 'content.write');
    const p = db.prepare('SELECT * FROM provenance WHERE id = ?').get(provId);
    if (!p) throw new HttpError(404, 'Sursa nu există');
    if (byKey[p.entity]?.approval) need(user, 'content.approve');
    return tx(db, () => {
      db.prepare("UPDATE provenance SET certainty = 'confirmed', verified_at = ?, verified_by = ? WHERE id = ?").run(nowIso(), user?.name ?? 'Sistem', provId);
      audit(user, 'source-confirm', p.entity, p.entity_id, null, {field: p.field, provenance: provId, was: p.certainty});
      return db.prepare('SELECT * FROM provenance WHERE id = ?').get(provId);
    });
  }

  // Cine trimite spre o înregistrare (nivelul 1 din „Unde apare” și protecția la ștergere).
  function inbound(key, id) {
    const out = [];
    for (const d of ENTITIES) for (const f of d.fields) {
      const target = f.type === 'image' ? 'media' : f.target;
      if (target !== key) continue;
      if (f.type === 'ref' || f.type === 'image') {
        for (const r of db.prepare(`SELECT id FROM "${d.table}" WHERE "${f.key}" = ?`).all(id))
          out.push({entity: d.key, id: r.id, field: f.key, rel: f.inverseLabel ?? f.label, owned: false, required: !!f.required});
      } else if (f.type === 'refs') {
        for (const r of db.prepare(`SELECT src_id, status FROM "${relTable(d, f)}" WHERE dst_id = ?`).all(id))
          out.push({entity: d.key, id: r.src_id, field: f.key, rel: f.inverseLabel, status: r.status, owned: !!f.owned, required: false});
      }
    }
    return out;
  }

  function remove(user, key, id) {
    const d = def(key);
    need(user, 'content.delete');
    return tx(db, () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      const used = inbound(key, id).filter(u => !u.owned);
      if (used.length) throw new HttpError(409, `${titleOf(d, cur)} e folosit(ă) în ${used.length} locuri`, {usedBy: used});
      const before = snap(d, cur);
      const outLinks = Object.fromEntries(relFields(d).map(f => [f.key, links(key, id, f.key)]));
      db.prepare(`DELETE FROM "${d.table}" WHERE id = ?`).run(id);
      db.prepare('DELETE FROM provenance WHERE entity = ? AND entity_id = ?').run(key, id);
      audit(user, 'delete', key, id, titleOf(d, cur), {before: cur, links: outLinks});
      if (isVisible(d, cur)) emit(user, 'delete', key, id, before, null);
      return {deleted: true};
    });
  }

  // O modificare fără entitate (de exemplu restaurarea unei copii): reface toate paginile.
  const global = (user, label) => tx(db, () => emit(user, 'global', null, null, null, null, {label}));

  const api = {
    db, def, get, list, bySlug, links, inbound, snap: (key, rec) => snap(def(key), rec), scopesOf,
    create, update, publish, setStatus, setLinks, setInverse, setLinkStatus, bulkLinks, confirmProvenance, remove, global, sourceId,
    isVisible: (key, rec) => isVisible(def(key), rec),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); }
  };
  return api;
}
