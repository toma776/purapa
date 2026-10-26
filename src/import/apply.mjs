// Etapa 3, import (§1.3): din analiză în Brain, într-o singură tranzacție.
// - potrivire după chei naturale (extern_id, slug, platformă), deci un import repetat dă aceleași ID-uri;
// - fiecare câmp importat își scrie sursa, cu fișierul din snapshot;
// - refuză să suprascrie editările oamenilor (și ciornele nepublicate) fără `overwriteEdits`;
// - verificarea dus-întors a textelor; valorile scrise de mână devin jetoane (values:link).
import {copyFile, mkdir, access, readFile} from 'node:fs/promises';
import {imageSize} from '../core/media.mjs';
import {join, extname} from 'node:path';
import {nowIso} from '../core/db.mjs';
import {HttpError} from '../core/store.mjs';
import {sanitizeContent, esc, phoneKey} from '../core/content.mjs';
import {createContext} from '../site/context.mjs';
import {blocks, fold} from './analyze.mjs';

export const IMPORT_USER = {name: 'Import', role: 'admin', perms: new Set(['*'])};

const exists = p => access(p).then(() => true, () => false);
const sameValue = (a, b) => (a == null || a === '') && (b == null || b === '') ? true
  : typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : String(a) === String(b);

// Caută `needle` în `hay` ignorând diacriticele și majusculele; întoarce pozițiile din textul original.
function foldedIndexes(hay, needle) {
  const f = s => s.split('').map(c => c.normalize('NFD')[0].toLowerCase()).join('');
  const H = f(hay), N = f(needle), out = [];
  for (let i = H.indexOf(N); i !== -1 && N; i = H.indexOf(N, i + N.length)) out.push(i);
  return out.map(i => [i, i + needle.length]);
}

// values:link: telefonul, emailul, adresa, firma, CUI-ul și Reg. Com. scrise de mână devin jetoane.
// O valoare care contrazice Date firmă nu se înlocuiește (rămâne pentru „De făcut”).
export function linkValues(html, f, rendered) {
  let out = html;
  const replaced = [];
  const swap = (re, token, label) => { out = out.replace(re, () => { replaced.push(label); return token; }); };
  if (f.phone) {
    const key = phoneKey(f.phone);
    swap(new RegExp(`tel:\\+?(?:40)?${key.replace(/^0/, '0?')}`, 'g'), '{telefon_link}', 'tel:');
    out = out.replace(/(?<!\d)(?:\+40[\s.-]?|0)\d{3}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g, m => phoneKey(m) === key ? (replaced.push('telefon'), '{telefon}') : m);
  }
  if (f.email) swap(new RegExp(f.email.replace(/[.+]/g, '\\$&'), 'gi'), '{email}', 'email');
  for (const [token, value] of [['{adresa_completa}', rendered.adresa_completa], ['{firma}', f.legal_name], ['{cui}', f.cui], ['{reg_com}', f.reg_com]]) {
    if (!value) continue;
    for (const [a, b] of foldedIndexes(out, value).reverse()) { out = out.slice(0, a) + token + out.slice(b); replaced.push(token); }
  }
  return {html: out, replaced};
}

function parseAddress(address, knownForms) {
  if (!address) return null;
  const parts = address.split(/,\s*/);
  const county = parts.find(p => /^jud(\.|ețul)\s*/i.test(p))?.replace(/^jud(\.|ețul)\s*/i, '') ?? null;
  const building = parts.find(p => /^(hala|corp|bloc|et\.|etaj|sc\.)\b/i.test(p)) ?? null;
  let street = parts[0];
  const city = parts.filter(p => p !== parts[0] && p !== building && !/^jud/i.test(p)).at(-1) ?? null;
  // Forma cu diacritice, dacă apare în altă parte a site-ului și e aceeași adresă.
  const better = knownForms.map(a => a.split(/,\s*/)[0]).find(s => fold(s) === fold(street) && /[ăâîșțşţ]/i.test(s));
  if (better) street = better;
  return {street, building, city, county};
}

export async function applyImport(store, analysis, {overwriteEdits = false, mediaDir = 'data/media', snapshotDir = 'reference/snapshot', user = IMPORT_USER} = {}) {
  const db = store.db;
  const report = {at: nowIso(), created: [], updated: [], unchanged: 0, media: 0, tokens: 0, roundtrip: [], conflicts: [], findings: [...analysis.findings]};
  const ops = [];
  const src = (kind, url, file, fetched_at, excerpt, title) => ({kind, url, title: title ?? url, fetched_at, snapshot_file: file, method: 'import din snapshot', excerpt});

  // Câmpurile scrise de oameni: proveniență manuală confirmată, cu autor.
  const humanFields = async (key, id) => new Set((await db.all(`SELECT p.field FROM provenance p JOIN sources s ON s.id = p.source_id
    WHERE p.entity = ? AND p.entity_id = ? AND s.kind = 'manual' AND p.certainty = 'confirmed' AND p.verified_by IS NOT NULL AND p.verified_by NOT IN ('Import', 'Sistem')`, [key, id])).map(r => r.field));

  // --- Planul: ce se schimbă, fără să scrie nimic.
  const firma = store.list('firma')[0];
  const c = analysis.company;
  if (firma && c.source) {
    const addr = parseAddress(c.address, Object.values(analysis.contacts.addresses).flatMap(a => a.forms));
    const data = {legal_name: c.legal_name, cui: c.cui, reg_com: c.reg_com, ...(addr ?? {})};
    const phones = Object.keys(analysis.contacts.phones), emails = Object.keys(analysis.contacts.emails);
    if (phones.length === 1 && phoneKey(firma.phone) !== phones[0]) data.phone = analysis.contacts.phones[phones[0]].forms[0];
    if (emails.length === 1 && firma.email?.toLowerCase() !== emails[0]) data.email = emails[0];
    ops.push({key: 'firma', id: firma.id, data: Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)),
      source: src('site', c.source.url, c.source.file, c.source.fetched_at, `${c.legal_name}, ${c.address}, ${c.reg_com}, CUI ${c.cui}`, 'purapa.ro — Termeni și condiții')});
  }

  const listing = analysis.pages.find(p => p.path === '/produse/');
  for (const p of analysis.products) {
    if (!p.extern_id) continue;
    const cur = store.list('produse').find(r => r.extern_id === p.extern_id) ?? null;
    const image = p.images[0] ?? null;
    if (p.retailer) {
      ops.push({key: 'produse', id: cur?.id ?? null, match: {extern_id: p.extern_id}, create: {name: p.name, extern_id: p.extern_id, position: p.position},
        data: {price: p.retailer.price, list_price: p.retailer.list_price, availability: p.retailer.availability, buy_url: p.buy_url},
        image: image && {...image, alt: p.name},
        source: src('endpoint', p.extern_id, p.retailer.file, p.retailer.fetched_at, `${p.retailer.name}: ${p.retailer.price} lei${p.retailer.list_price ? ` (tăiat ${p.retailer.list_price} lei)` : ''}, ${p.retailer.availability ?? ''}`, `Portalia — ${p.retailer.name}`)});
    }
    if (p.description && listing) {
      ops.push({key: 'produse', id: cur?.id ?? null, match: {extern_id: p.extern_id}, create: {name: p.name, extern_id: p.extern_id, position: p.position},
        data: {description: `<p>${esc(p.description)}</p>`},
        source: src('site', listing.url, listing.file, listing.fetched_at, p.description.slice(0, 160), 'purapa.ro — Produse')});
    }
  }

  for (const s of analysis.socials) {
    const cur = store.list('retele').find(r => r.platform === s.platform);
    const home = analysis.pages.find(p => p.path === '/');
    ops.push({key: 'retele', id: cur?.id ?? null, create: {platform: s.platform, position: store.list('retele').length},
      data: {url: s.url, ...(s.handle ? {handle: s.handle} : {})}, source: src('site', home.url, home.file, home.fetched_at, s.url, 'purapa.ro — subsol')});
  }

  // Imaginile site-ului: logo-ul pe Date firmă, celelalte pe secțiunea cu același titlu din pagina lor.
  for (const img of analysis.images ?? []) {
    const image = {url: img.url, file: img.file, sha1: img.sha1, alt: img.alt};
    const source = src('site', img.url, img.file, img.fetched_at, img.alt, `purapa.ro${img.path}`);
    if (/logo/i.test(img.alt) || /logo/i.test(img.path)) {
      // Logo-ul firmei e cel din antetul site-ului; alte variante (de exemplu din aplicația de test) nu-l înlocuiesc.
      if (firma && img.uses.some(u => u.section === 'Antet')) ops.push({key: 'firma', id: firma.id, data: {}, image, imageField: 'logo_id', source});
      continue;
    }
    for (const use of img.uses) {
      const pageRec = store.list('pagini').find(r => (r.slug === '' ? '/' : `/${r.slug}/`) === use.page);
      if (!pageRec || !use.section) continue;
      const section = store.links('pagini', pageRec.id, 'sections').map(l => store.get('sectiuni', l.id)).find(s => fold(String(s.title ?? '').replace(/\*/g, '')) === fold(use.section));
      if (section) ops.push({key: 'sectiuni', id: section.id, data: {}, image, imageField: 'image_id', source});
    }
  }

  for (const page of analysis.pages) {
    const brain = store.list('pagini').find(r => (r.slug === '' ? '/' : `/${r.slug}/`) === page.path);
    if (!brain || !page.description) continue;
    ops.push({key: 'pagini', id: brain.id, data: {seo_description: page.description.slice(0, 170)},
      source: src('site', page.url, page.file, page.fetched_at, page.description, `purapa.ro${page.path}`)});
  }

  // Conflictele: un câmp scris de un om sau o ciornă nepublicată pe care importul ar schimba-o.
  for (const op of ops) {
    if (!op.id) continue;
    const cur = store.get(op.key, op.id);
    const human = await humanFields(op.key, op.id);
    for (const [k, v] of Object.entries(op.data)) {
      if (human.has(k) && !sameValue(cur[k], v)) report.conflicts.push({key: op.key, id: op.id, field: k, current: cur[k], incoming: v, why: 'modificat de un om'});
    }
    const imgField = op.image && (op.imageField ?? 'image_id');
    if (imgField && human.has(imgField) && store.get('media', cur[imgField])?.sha1 !== op.image.sha1)
      report.conflicts.push({key: op.key, id: op.id, field: imgField, current: cur[imgField], incoming: op.image.url, why: 'imagine aleasă de un om'});
    // Importul publică ce scrie; o ciornă a unui om pe aceeași înregistrare ar fi publicată odată cu el.
    if (cur.draft && !report.conflicts.some(c => c.key === op.key && c.id === op.id && c.why === 'ciornă nepublicată'))
      report.conflicts.push({key: op.key, id: op.id, field: Object.keys(cur.draft).join(','), why: 'ciornă nepublicată'});
  }
  const legalTargets = analysis.legal.map(l => ({l, page: store.bySlug('pagini', l.slug)})).filter(x => x.page);
  for (const {page} of legalTargets) {
    const section = store.links('pagini', page.id, 'sections').map(s => store.get('sectiuni', s.id)).find(s => s.kind === 'text');
    if (section && (await humanFields('sectiuni', section.id)).has('text')) report.conflicts.push({key: 'sectiuni', id: section.id, field: 'text', why: 'modificat de un om'});
  }
  if (report.conflicts.length && !overwriteEdits) {
    throw new HttpError(409, `Importul ar suprascrie ${report.conflicts.length} modificări făcute de oameni. Rulează cu --overwrite-edits ca să le suprascrii.`, {conflicts: report.conflicts});
  }

  // Fișierele media se copiază înainte de tranzacție, cu numele din amprentă (același conținut, un singur fișier).
  await mkdir(mediaDir, {recursive: true});
  for (const op of ops.filter(o => o.image)) {
    const name = `${op.image.sha1}${extname(op.image.file)}`;
    if (!await exists(join(mediaDir, name))) await copyFile(join(snapshotDir, op.image.file), join(mediaDir, name));
    op.image.name = name;
    Object.assign(op.image, imageSize(await readFile(join(mediaDir, name))) ?? {});
  }

  // --- Scrierea: totul sau nimic.
  await store.tx(async () => {
    const track = (key, before, after) => {
      if (!before) report.created.push(`${key}:${after.id}`);
      else if (after.version !== before.version) report.updated.push(`${key}:${after.id}`);
      else report.unchanged++;
    };
    const ids = {};
    for (const op of ops) {
      const matchKey = op.match && JSON.stringify(op.match);
      let id = op.id ?? ids[matchKey] ?? null;
      const before = id ? store.get(op.key, id) : null;
      const data = {...op.data};
      if (op.image) {
        let media = store.list('media').find(m => m.sha1 === op.image.sha1) ?? null;
        if (!media) {
          media = await store.create(user, 'media', {src: op.image.name, alt: op.image.alt, sha1: op.image.sha1, width: op.image.width, height: op.image.height},
            {source: {...op.source, excerpt: op.image.url}});
          report.media++;
        }
        data[op.imageField ?? 'image_id'] = media.id;
      }
      const d = store.def(op.key);
      const rec = before
        ? await store.update(user, op.key, id, data, {publish: !d.noStatus, source: op.source})
        : await store.create(user, op.key, {...op.create, ...data}, {publish: true, source: op.source});
      if (matchKey) ids[matchKey] = rec.id;
      track(op.key, before, rec);
    }

    // Textele legale: întregi, curățate, verificate dus-întors, cu valorile legate.
    const ctx = createContext(store);
    const firmaNow = ctx.one('firma');
    const rendered = {adresa_completa: [firmaNow.street, firmaNow.building, firmaNow.city, firmaNow.county && `jud. ${firmaNow.county}`].filter(Boolean).join(', ')};
    for (const {l, page} of legalTargets) {
      const original = blocks(l.html);
      const stored = sanitizeContent(l.html);
      const back = blocks(stored);
      const exact = JSON.stringify(original) === JSON.stringify(back);
      const {html, replaced} = linkValues(stored, firmaNow, rendered);
      const filled = blocks(ctx.rich(html));
      const sameMeaning = JSON.stringify(original.map(([t, s]) => [t, fold(s)])) === JSON.stringify(filled.map(([t, s]) => [t, fold(s)]));
      report.roundtrip.push({path: l.path, blocks: original.length, exact, tokens: replaced.length, sameMeaning,
        ...(exact && sameMeaning ? {} : {first_diff: original.find((b, i) => JSON.stringify(b) !== JSON.stringify(back[i]) || fold(b[1]) !== fold(filled[i]?.[1] ?? ''))})});
      report.tokens += replaced.length;
      const section = store.links('pagini', page.id, 'sections').map(s => store.get('sectiuni', s.id)).find(s => s.kind === 'text');
      const source = {...src('site', l.url, l.file, l.fetched_at, l.title, `purapa.ro${l.path}`), certainty: exact && sameMeaning ? 'confirmed' : 'unverified'};
      if (!exact || !sameMeaning) report.findings.push({impact: 'mare', kind: 'dus-intors', text: `${l.title}: textul importat nu dă aceleași blocuri la recitire.`, path: l.path});
      const before = section ? store.get('sectiuni', section.id) : null;
      const rec = section
        ? await store.update(user, 'sectiuni', section.id, {title: l.title, text: html}, {source})
        : await store.create(user, 'sectiuni', {kind: 'text', title: l.title, text: html}, {source});
      if (!section) await store.setLinks(user, 'pagini', page.id, 'sections', [...store.links('pagini', page.id, 'sections'), {id: rec.id}]);
      track('sectiuni', before, rec);
      const pageBefore = store.get('pagini', page.id);
      track('pagini', pageBefore, await store.update(user, 'pagini', page.id, {title: l.title}, {publish: true, source}));
    }

    await db.run("INSERT INTO meta (key, value) VALUES ('import_findings', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [JSON.stringify({at: report.at, findings: report.findings})]);
    await db.run("INSERT INTO meta (key, value) VALUES ('last_import', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [report.at]);
  });
  return report;
}
