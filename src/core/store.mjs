// Store: orice modificare trece pe aici și scrie, în aceeași tranzacție, modificarea, istoricul și evenimentul (§3.3).
// Citirile sunt sincrone, dintr-un model în memorie (datele unui site au câteva sute de rânduri);
// modelul se reîncarcă singur când altă instanță a scris (marcajul `data_version`, ca PRAGMA data_version în §3.12).
import {randomUUID} from 'node:crypto';
import {nowIso} from './db.mjs';
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
  const state = {rows: new Map(ENTITIES.map(d => [d.key, new Map()])), rels: new Map(), version: null};
  const def = key => byKey[key] ?? (() => { throw new HttpError(404, `Tip necunoscut: ${key}`); })();
  const fieldOf = (d, key) => d.fields.find(f => f.key === key) ?? (() => { throw new HttpError(404, `Câmp necunoscut: ${d.key}.${key}`); })();
  const user$ = user => user?.name ?? 'Sistem';

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
  const decodeLink = r => ({id: r.dst_id, position: r.position, status: r.status, confidence: r.confidence, source_id: r.source_id,
    note: r.note, attrs: r.attrs ? JSON.parse(r.attrs) : null, created_at: r.created_at, created_by: r.created_by, src_id: r.src_id});
  const linkSort = (a, b) => a.position - b.position || a.id - b.id;

  // --- Modelul în memorie

  const readVersion = async () => (await db.get("SELECT value FROM meta WHERE key = 'data_version'"))?.value ?? '0';

  async function load() {
    const version = await readVersion();
    for (const d of ENTITIES) {
      const map = new Map();
      for (const row of await db.all(`SELECT * FROM "${d.table}" ORDER BY id`)) map.set(row.id, decode(d, row));
      state.rows.set(d.key, map);
      for (const f of relFields(d)) state.rels.set(relTable(d, f), (await db.all(`SELECT * FROM "${relTable(d, f)}"`)).map(decodeLink));
    }
    state.version = version;
  }

  // La începutul fiecărei cereri: reîncarcă doar dacă altcineva a scris între timp.
  async function fresh() {
    if (state.version === null || await readVersion() !== state.version) await load();
  }

  async function refreshRow(key, id) {
    const d = def(key);
    const row = await db.get(`SELECT * FROM "${d.table}" WHERE id = ?`, [id]);
    if (row) state.rows.get(key).set(id, decode(d, row)); else state.rows.get(key).delete(id);
    return row ? state.rows.get(key).get(id) : null;
  }

  async function refreshLinks(d, f, srcId) {
    const t = relTable(d, f);
    const rows = (await db.all(`SELECT * FROM "${t}" WHERE src_id = ?`, [srcId])).map(decodeLink);
    state.rels.set(t, [...state.rels.get(t).filter(l => l.src_id !== srcId), ...rows]);
  }

  // Fiecare scriere: o tranzacție, cu marcajul de versiune schimbat. O tranzacție anulată reîncarcă modelul.
  async function write(fn) {
    try {
      return await db.tx(async () => {
        const result = await fn();
        const v = randomUUID();
        await db.run("INSERT INTO meta (key, value) VALUES ('data_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [v]);
        db.afterCommit(() => { state.version = v; });
        return result;
      });
    } catch (e) {
      if (!db.inTx()) { state.version = null; await load().catch(() => {}); }
      throw e;
    }
  }

  // --- Citiri (sincrone)

  const get = (key, id) => state.rows.get(def(key).key).get(Number(id)) ?? null;
  const list = key => [...state.rows.get(def(key).key).values()];
  const bySlug = (key, slug) => list(key).find(r => r.slug === slug) ?? null;
  const relRows = (d, f) => state.rels.get(relTable(d, f)) ?? [];

  function links(key, id, fieldKey) {
    const d = def(key), f = fieldOf(d, fieldKey);
    return relRows(d, f).filter(l => l.src_id === Number(id)).sort(linkSort).map(({src_id, ...l}) => l);
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

  // Cine trimite spre o înregistrare (nivelul 1 din „Unde apare” și protecția la ștergere).
  function inbound(key, id) {
    const out = [];
    id = Number(id);
    for (const d of ENTITIES) for (const f of d.fields) {
      const target = f.type === 'image' ? 'media' : f.target;
      if (target !== key) continue;
      if (f.type === 'ref' || f.type === 'image') {
        for (const r of list(d.key)) if (r[f.key] === id) out.push({entity: d.key, id: r.id, field: f.key, rel: f.inverseLabel ?? f.label, owned: false, required: !!f.required});
      } else if (f.type === 'refs') {
        for (const l of relRows(d, f)) if (l.id === id) out.push({entity: d.key, id: l.src_id, field: f.key, rel: f.inverseLabel, status: l.status, owned: !!f.owned, required: false});
      }
    }
    return out;
  }

  // --- Scrieri: istoric, eveniment, proveniență

  async function emit(user, action, key, id, before, after, extra = {}) {
    await db.run('INSERT INTO change_events (at, user_name, action, entity, entity_id, label, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nowIso(), user$(user), action, key, id, (after ?? before)?.title ?? extra.label ?? null, JSON.stringify({before, after, ...extra})]);
    db.afterCommit(() => { for (const l of listeners) l({key, id, action}); });
  }

  const audit = (user, action, key, id, label, changes) =>
    db.run('INSERT INTO audit_log (at, user_name, action, entity, entity_id, label, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nowIso(), user$(user), action, key, id, label, JSON.stringify(changes)]);

  // O sursă apare o singură dată; un reimport îi actualizează data descărcării și fișierul din snapshot.
  async function sourceId(src) {
    const found = await db.get('SELECT id FROM sources WHERE url = ?', [src.url]);
    if (found) {
      if (src.fetched_at || src.snapshot_file) await db.run('UPDATE sources SET fetched_at = COALESCE(?, fetched_at), snapshot_file = COALESCE(?, snapshot_file), status = COALESCE(?, status) WHERE id = ?',
        [src.fetched_at ?? null, src.snapshot_file ?? null, src.status ?? null, found.id]);
      return found.id;
    }
    return db.insert('INSERT INTO sources (kind, url, title, fetched_at, method, snapshot_file, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [src.kind, src.url, src.title ?? null, src.fetched_at ?? null, src.method ?? null, src.snapshot_file ?? null, src.status ?? null, src.note ?? null, nowIso()]);
  }

  // Fiecare câmp scris își scrie sursa: importul pe a lui, o editare manuală pe „manual:<autor>” (§1.4).
  async function provenance(user, key, id, fields, src) {
    if (!fields.length) return;
    const s = src ?? {kind: 'manual', url: `manual:${user$(user)}`, title: `Introdus manual de ${user$(user)}`};
    const sid = await sourceId(s);
    const certainty = s.certainty ?? 'confirmed';
    const at = nowIso();
    const manual = s.kind === 'manual' && certainty === 'confirmed';
    for (const field of fields) {
      await db.run(`INSERT INTO provenance (entity, entity_id, field, source_id, excerpt, method, certainty, confidence, verified_at, verified_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (entity, entity_id, field, source_id) DO UPDATE SET excerpt = excluded.excerpt, method = excluded.method,
          certainty = excluded.certainty, verified_at = excluded.verified_at, verified_by = excluded.verified_by, created_at = excluded.created_at`,
        [key, id, field, sid, s.excerpt ?? null, s.method ?? (src ? 'import' : 'editare manuală'), certainty,
          s.confidence ?? null, manual ? at : null, manual ? user$(user) : null, at]);
    }
  }

  function uniqueSlug(d, base, id, allowEmpty) {
    let slug = base;
    if (!slug && !allowEmpty) slug = d.key;
    if (RESERVED_SLUGS.has(slug)) slug = `${slug}-2`;
    const taken = s => list(d.key).some(r => r.slug === s && r.id !== id);
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

  // Scrie coloanele și crește versiunea; cu `expect`, doar dacă versiunea din bază e cea citită (blocare optimistă).
  async function writeColumns(d, id, vals, user, extra = {}, expect = null) {
    const all = {...vals, ...extra, updated_at: nowIso(), updated_by: user$(user)};
    const merged = {...get(d.key, id), ...vals};
    all.search = titleOf(d, merged).toLowerCase();
    const keys = Object.keys(all);
    const r = await db.run(`UPDATE "${d.table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, version = version + 1 WHERE id = ?${expect != null ? ' AND version = ?' : ''}`,
      [...keys.map(k => all[k]), id, ...(expect != null ? [expect] : [])]);
    if (expect != null && r.changes === 0) {
      const current = await refreshRow(d.key, id);
      throw new HttpError(409, 'Înregistrarea a fost modificată între timp', {current});
    }
    return refreshRow(d.key, id);
  }

  // 301 automat la schimbarea adresei: fără lanțuri și fără bucle (§3.8).
  async function autoRedirect(from, to) {
    if (!from || !to || from === to) return;
    await db.run('DELETE FROM redirects WHERE from_path = ?', [to]);
    await db.run('UPDATE redirects SET to_path = ? WHERE to_path = ?', [to, from]);
    await db.run('INSERT INTO redirects (from_path, to_path, auto, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (from_path) DO UPDATE SET to_path = excluded.to_path',
      [from, to, nowIso()]);
  }

  const normalizeItems = items => (items ?? []).map(x => typeof x === 'object' ? {...x, id: Number(x.id)} : {id: Number(x)});

  async function writeLinks(user, d, id, f, items, src) {
    const t = relTable(d, f), target = byKey[f.target];
    const old = new Map(links(d.key, id, f.key).map(l => [l.id, l]));
    const rec = get(d.key, id);
    if (f.max && items.length > f.max) throw new HttpError(400, `Cel mult ${f.max} legături`);
    for (const it of items) {
      const dst = get(target.key, it.id);
      if (!dst) throw new HttpError(400, `${target.one} #${it.id} nu există`);
      if (target.key === d.key && it.id === id) throw new HttpError(400, 'O înregistrare nu se poate lega de ea însăși');
      if (f.only && !f.only(rec, dst, api)) throw new HttpError(400, `${titleOf(target, dst)} nu e permis la „${f.label}”`);
    }
    const sid = src ? await sourceId(src) : null;
    await db.run(`DELETE FROM "${t}" WHERE src_id = ?`, [id]);
    let i = 0;
    for (const it of items) {
      const prev = old.get(it.id);
      await db.run(`INSERT INTO "${t}" (src_id, dst_id, position, status, confidence, source_id, note, attrs, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, it.id, f.ordered ? i++ : 0, it.status ?? prev?.status ?? 'confirmed', it.confidence ?? prev?.confidence ?? null,
          sid ?? prev?.source_id ?? null, it.note ?? prev?.note ?? null,
          it.attrs ? JSON.stringify(it.attrs) : prev?.attrs ? JSON.stringify(prev.attrs) : null,
          prev?.created_at ?? nowIso(), prev?.created_by ?? user$(user)]);
    }
    await refreshLinks(d, f, id);
    const now = links(d.key, id, f.key);
    const key = l => l && [l.status, l.position];
    const touched = [...new Set([...old.keys(), ...now.map(l => l.id)])]
      .filter(dst => !same(key(old.get(dst)), key(now.find(l => l.id === dst))))
      .map(dst => `${f.target}:${dst}`);
    return {old: [...old.values()], now, touched};
  }

  function create(user, key, data, {publish = false, source = null} = {}) {
    const d = def(key);
    need(user, 'content.write');
    if (publish && !d.noStatus) need(user, publishPerm(d));
    return write(async () => {
      if (d.singleton && list(key).length) throw new HttpError(409, `${d.label} există deja`);
      const vals = coerce(d, data, null);
      const at = nowIso();
      const base = {created_at: at, updated_at: at, created_by: user$(user), updated_by: user$(user), search: titleOf(d, vals).toLowerCase()};
      if (!d.noStatus) Object.assign(base, {status: publish ? 'published' : 'draft', published_at: publish ? at : null});
      const row = {...vals, ...base};
      const cols = Object.keys(row);
      const id = await db.insert(`INSERT INTO "${d.table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(c => row[c]));
      await refreshRow(key, id);
      const touched = [];
      for (const f of relFields(d)) if (data[f.key]) touched.push(...(await writeLinks(user, d, id, f, normalizeItems(data[f.key]), source)).touched);
      const rec = get(key, id);
      await provenance(user, key, id, Object.keys(vals).filter(k => vals[k] != null), source);
      await audit(user, 'create', key, id, titleOf(d, rec), {after: rec});
      if (isVisible(d, rec)) await emit(user, 'create', key, id, null, snap(d, rec), {touched});
      return rec;
    });
  }

  // Salvare: pe o înregistrare publicată fără `publish`, scrie ciorna; site-ul rămâne neschimbat (§3.6).
  function update(user, key, id, data, {version = null, publish = false, source = null} = {}) {
    const d = def(key);
    need(user, 'content.write');
    if (publish && !d.noStatus) need(user, publishPerm(d));
    id = Number(id);
    return write(async () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      if (version != null && Number(version) !== cur.version) throw new HttpError(409, 'Înregistrarea a fost modificată între timp', {current: cur});
      const expect = version != null ? Number(version) : null;
      const clean = Object.fromEntries(Object.entries(data).filter(([k]) => d.fields.some(f => f.key === k && f.type !== 'refs')));

      if (!d.noStatus && cur.status === 'published' && !publish) {
        const draft = {...(cur.draft ?? {}), ...clean};
        coerce(d, draft, cur);
        const r = await db.run(`UPDATE "${d.table}" SET draft = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?${expect != null ? ' AND version = ?' : ''}`,
          [JSON.stringify(draft), nowIso(), user$(user), id, ...(expect != null ? [expect] : [])]);
        if (expect != null && r.changes === 0) throw new HttpError(409, 'Înregistrarea a fost modificată între timp', {current: await refreshRow(key, id)});
        await audit(user, 'draft', key, id, titleOf(d, cur), {draft: clean});
        return refreshRow(key, id);
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
        if (source) await provenance(user, key, id, Object.keys(vals), source);
        return cur;
      }
      const rec = await writeColumns(d, id, Object.fromEntries(changed.map(k => [k, vals[k]])), user, extra, expect);
      const after = snap(d, rec);
      if (before.paths[0] && after.paths[0]) await autoRedirect(before.paths[0], after.paths[0]);
      await provenance(user, key, id, source ? Object.keys(vals) : changed, source);
      await audit(user, publish ? 'publish' : 'update', key, id, titleOf(d, rec),
        {fields: Object.fromEntries(changed.map(k => [k, [cur[k] ?? null, rec[k] ?? null]])), before: cur});
      if (isVisible(d, cur) || isVisible(d, rec)) await emit(user, publish && cur.status !== 'published' ? 'publish' : 'update', key, id, before, after);
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
    id = Number(id);
    return write(async () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      if (cur.status === status) return cur;
      const before = snap(d, cur);
      const rec = await writeColumns(d, id, {}, user, {status});
      await audit(user, status, key, id, titleOf(d, rec), {status: [cur.status, status]});
      if (isVisible(d, cur)) await emit(user, status === 'archived' ? 'archive' : 'unpublish', key, id, before, snap(d, rec));
      return rec;
    });
  }

  // Legăturile se editează din capătul sursei; schimbarea e live și ecranul o spune (§2.2).
  function setLinks(user, key, id, fieldKey, items, {source = null} = {}) {
    const d = def(key), f = fieldOf(d, fieldKey);
    if (f.type !== 'refs') throw new HttpError(400, `${fieldKey} nu e o relație multiplă`);
    need(user, 'content.write');
    if (f.sensitive) need(user, 'content.approve');
    id = Number(id);
    return write(async () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      const before = snap(d, cur);
      const {old, now, touched} = await writeLinks(user, d, id, f, normalizeItems(items), source);
      if (!touched.length) return {links: now, live: isVisible(d, cur)};
      const rec = await writeColumns(d, id, {}, user);
      await audit(user, 'links', key, id, titleOf(d, rec), {field: fieldKey, before: old, after: now});
      if (isVisible(d, rec)) await emit(user, 'links', key, id, before, snap(d, rec), {touched, field: fieldKey});
      return {links: now, live: isVisible(d, rec)};
    });
  }

  // Legăturile din capătul invers: aceeași tranzacție, oricâte înregistrări-sursă atinge.
  function setInverse(user, key, id, srcKey, fieldKey, srcIds) {
    const sd = def(srcKey), f = fieldOf(sd, fieldKey);
    if (f.target !== key) throw new HttpError(400, `${srcKey}.${fieldKey} nu trimite la ${key}`);
    const want = new Set(srcIds.map(Number));
    id = Number(id);
    return write(async () => {
      const current = relRows(sd, f).filter(l => l.id === id).map(l => l.src_id);
      for (const s of new Set([...current, ...want])) {
        const items = links(srcKey, s, fieldKey);
        const has = items.some(l => l.id === id);
        if (want.has(s) && !has) await setLinks(user, srcKey, s, fieldKey, [...items, {id}]);
        if (!want.has(s) && has) await setLinks(user, srcKey, s, fieldKey, items.filter(l => l.id !== id));
      }
      return relRows(sd, f).filter(l => l.id === id).map(l => l.src_id);
    });
  }

  // Starea unei legături. NOU (§1.9): cere aprobare dacă relația e sensibilă sau unul din capete are aprobare.
  function setLinkStatus(user, key, id, fieldKey, dst, status) {
    const d = def(key), f = fieldOf(d, fieldKey);
    if (!['confirmed', 'inferred', 'unverified'].includes(status)) throw new HttpError(400, 'Stare invalidă');
    need(user, 'content.write');
    if (f.sensitive || d.approval || byKey[f.target].approval) need(user, 'content.approve');
    id = Number(id); dst = Number(dst);
    return write(async () => {
      const cur = get(key, id);
      const before = snap(d, cur);
      const r = await db.run(`UPDATE "${relTable(d, f)}" SET status = ? WHERE src_id = ? AND dst_id = ? AND status <> ?`, [status, id, dst, status]);
      if (!r.changes) return links(key, id, fieldKey);
      await refreshLinks(d, f, id);
      const rec = await writeColumns(d, id, {}, user);
      await audit(user, 'link-status', key, id, titleOf(d, rec), {field: fieldKey, dst, status});
      if (isVisible(d, rec)) await emit(user, 'link-status', key, id, before, snap(d, rec), {touched: [`${f.target}:${dst}`], field: fieldKey});
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
    return write(async () => {
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
          const row = relRows(d, f).find(l => l.src_id === src && l.id === dst);
          if (!row || row.status === 'confirmed') continue;
          if (action === 'confirm') await db.run(`UPDATE "${t}" SET status = 'confirmed' WHERE src_id = ? AND dst_id = ?`, [src, dst]);
          else {
            await db.run(`DELETE FROM "${t}" WHERE src_id = ? AND dst_id = ?`, [src, dst]);
            const ev = row.source_id ? (await db.get('SELECT url FROM sources WHERE id = ?', [row.source_id]))?.url : null;
            await db.run(`INSERT INTO link_dismissals (relation, src_id, dst_id, evidence, at, by) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (relation, src_id, dst_id) DO UPDATE SET evidence = excluded.evidence, at = excluded.at, by = excluded.by`,
              [`${key}.${fieldKey}`, src, dst, ev ?? row.note ?? null, nowIso(), user$(user)]);
          }
          done.push(dst);
          touched.push(`${f.target}:${dst}`);
        }
        if (!done.length) continue;
        changed += done.length;
        await refreshLinks(d, f, src);
        const rec = await writeColumns(d, src, {}, user);
        await audit(user, action === 'confirm' ? 'links-confirm' : 'links-remove', key, src, titleOf(d, rec), {field: fieldKey, dst: done});
        if (isVisible(d, rec)) records.push({key, id: src, before, after: snap(d, rec)});
      }
      if (records.length) {
        await db.run('INSERT INTO change_events (at, user_name, action, entity, entity_id, label, payload) VALUES (?, ?, ?, ?, NULL, ?, ?)',
          [nowIso(), user$(user), `bulk-${action}`, key, `${changed} legături ${action === 'confirm' ? 'confirmate' : 'scoase'}`, JSON.stringify({records, touched, field: fieldKey})]);
        db.afterCommit(() => { for (const l of listeners) l({key, id: null, action: `bulk-${action}`}); });
      }
      return {changed, records: bySrc.size};
    });
  }

  // Confirmarea unei informații dintr-o sursă: certitudinea devine „confirmată”, cu cine și când (§1.4).
  // NOU (§1.9): pe tipurile cu aprobare cere `content.approve`.
  async function confirmProvenance(user, provId) {
    need(user, 'content.write');
    const p = await db.get('SELECT * FROM provenance WHERE id = ?', [provId]);
    if (!p) throw new HttpError(404, 'Sursa nu există');
    if (byKey[p.entity]?.approval) need(user, 'content.approve');
    return write(async () => {
      await db.run("UPDATE provenance SET certainty = 'confirmed', verified_at = ?, verified_by = ? WHERE id = ?", [nowIso(), user$(user), provId]);
      await audit(user, 'source-confirm', p.entity, p.entity_id, null, {field: p.field, provenance: provId, was: p.certainty});
      return db.get('SELECT * FROM provenance WHERE id = ?', [provId]);
    });
  }

  function remove(user, key, id) {
    const d = def(key);
    need(user, 'content.delete');
    id = Number(id);
    return write(async () => {
      const cur = get(key, id);
      if (!cur) throw new HttpError(404, `${d.one} #${id} nu există`);
      const used = inbound(key, id).filter(u => !u.owned);
      if (used.length) throw new HttpError(409, `${titleOf(d, cur)} e folosit(ă) în ${used.length} locuri`, {usedBy: used});
      const before = snap(d, cur);
      const outLinks = Object.fromEntries(relFields(d).map(f => [f.key, links(key, id, f.key)]));
      await db.run(`DELETE FROM "${d.table}" WHERE id = ?`, [id]);
      await db.run('DELETE FROM provenance WHERE entity = ? AND entity_id = ?', [key, id]);
      await audit(user, 'delete', key, id, titleOf(d, cur), {before: cur, links: outLinks});
      if (isVisible(d, cur)) await emit(user, 'delete', key, id, before, null);
      await load(); // ștergerea în cascadă atinge legăturile și cheile străine ale altora
      return {deleted: true};
    });
  }

  // O modificare fără entitate (de exemplu restaurarea unei copii): reface toate paginile.
  const global = (user, label) => write(() => emit(user, 'global', null, null, null, null, {label}));

  const api = {
    db, def, get, list, bySlug, links, inbound, relRows, snap: (key, rec) => snap(def(key), rec), scopesOf,
    load, fresh, tx: write,
    get version() { return state.version; },
    create, update, publish, setStatus, setLinks, setInverse, setLinkStatus, bulkLinks, confirmProvenance, remove, global, sourceId,
    isVisible: (key, rec) => isVisible(def(key), rec),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); }
  };
  return api;
}
