// Contextul urmărit (§3.1, §3.2): site-ul nu citește baza direct; fiecare citire devine o dependență,
// cu componenta și motivul ei. Regulile de publicare stau aici, într-un singur loc.
import {byKey, publicPath, titleOf} from '../registry/entities.mjs';
import {esc} from '../core/content.mjs';
import {fillTokens} from '../core/values.mjs';

// `staticSite`: randare pentru exportul static (fără server), de exemplu fără formulare care trimit la /api.
export function createContext(store, {preview = false, staticSite = false} = {}) {
  const deps = [];
  const layouts = new Map();
  let sink = deps;
  let cur = {component: '', reason: ''};

  const dep = (kind, entity, entity_id = null, extra = {}) =>
    sink.push({kind, entity, entity_id, component: cur.component, reason: cur.reason, scope: '', fields: null, ...extra});

  // Pe site există doar ce e publicat; previzualizarea arată și ciornele (§3.1, §3.6).
  const visible = (key, r) => !!r && (byKey[key].noStatus || r.status === 'published' || (preview && r.status === 'draft'));
  const view = r => preview && r?.draft ? {...r, ...r.draft} : r;

  const ctx = {
    deps, layouts, preview, staticSite,
    get component() { return cur.component; },

    within(component, reason, fn) {
      const prev = cur;
      cur = {component, reason};
      try { return fn(); } finally { cur = prev; }
    },

    // Pagina proprie a unei entități.
    page(key, id) {
      dep('page', key, id);
      const r = store.get(key, id);
      return visible(key, r) ? view(r) : null;
    },

    get(key, id) {
      if (id == null) return null;
      const r = store.get(key, id);
      dep(r && !visible(key, r) ? 'pending' : 'direct', key, id);
      return visible(key, r) ? view(r) : null;
    },

    one(key) {
      const r = store.list(key)[0] ?? null;
      dep('direct', key, r?.id ?? null);
      return r ? view(r) : null;
    },

    bySlug(key, slug) {
      const r = store.bySlug(key, slug);
      if (!r) return null;
      dep(visible(key, r) ? 'direct' : 'pending', key, r.id);
      return visible(key, r) ? view(r) : null;
    },

    // Legăturile unei relații: doar cele confirmate ajung pe site (§1.5). O țintă încă nepublicată lasă `pending`.
    related(key, id, field) {
      const f = byKey[key].fields.find(x => x.key === field);
      const out = [];
      for (const l of store.links(key, id, field)) {
        if (l.status !== 'confirmed') continue;
        const r = store.get(f.target, l.id);
        if (visible(f.target, r)) { dep('list', f.target, l.id); out.push({...view(r), _link: l}); }
        else if (r?.status === 'draft') dep('pending', f.target, l.id);
      }
      return out;
    },

    // O listă își declară scope-ul sau câmpurile după care filtrează (NOU §3.2); altfel e refuzată.
    // `as: 'link'` pentru liste care afișează doar linkuri (meniuri): elementele devin dependențe `link`.
    query(key, {where = () => true, scope = null, fields = null, sort = null, as = 'list'} = {}) {
      if (!scope && !fields) throw new Error(`ctx.query('${key}') fără scope sau fields (standard §3.2)`);
      dep('query', key, null, {scope: scope ?? '', fields: fields ? JSON.stringify(fields) : null});
      let rows = store.list(key).filter(r => visible(key, r)).map(view).filter(where);
      if (sort) rows = rows.sort(sort);
      // Cu `fields`, câmpurile acoperă și conținutul elementelor; cu `scope`, fiecare element e o dependență `list`.
      if (scope || as === 'link') for (const r of rows) dep(as, key, r.id);
      return rows;
    },

    // Are secțiunea legături (de orice stare)? Nu scrie dependență: legăturile sunt ale înregistrării deja citite.
    hasLinks(key, id, field) { return store.links(key, id, field).length > 0; },

    // Link spre o entitate: `ref:tip:id[?parametri][#ancoră]`, `tip:id` sau o adresă obișnuită.
    // Un link spre ceva nepublicat întoarce null (devine text) și lasă `pending` (§3.1).
    link(ref) {
      if (!ref) return null;
      const m = /^(?:ref:)?([a-z-]+):(\d+)([?#].*)?$/.exec(ref);
      if (!m || !byKey[m[1]]) return ref;
      const [, key, id, rest = ''] = m;
      const d = byKey[key], r = store.get(key, Number(id));
      if (!visible(key, r)) { if (r) dep('pending', key, Number(id)); return null; }
      dep('link', key, Number(id));
      const href = publicPath(d, view(r)) ?? d.anchor?.(view(r)) ?? d.external?.(view(r)) ?? null;
      return href ? href + rest : null;
    },

    linkTitle(key, id) {
      const r = store.get(key, id);
      return visible(key, r) ? titleOf(byKey[key], view(r)) : null;
    },

    media(id) {
      if (id == null) return null;
      dep('media', 'media', id);
      const r = store.get('media', id);
      if (!r) return null;
      const external = /^https?:\/\//.test(r.src);
      return {src: external ? r.src : `/media/${r.src}?v=${encodeURIComponent(r.updated_at)}`, alt: r.alt ?? '', width: r.width ?? null, height: r.height ?? null};
    },

    // Componentele comune își scriu dependențele o singură dată, sub `#layout:<componentă>` (§3.2).
    layout(name, fn) {
      if (!layouts.has(name)) {
        const prevSink = sink, prevCur = cur;
        sink = [];
        cur = {component: name, reason: ''};
        try { layouts.set(name, {html: fn(), deps: sink}); }
        finally { sink = prevSink; cur = prevCur; }
      }
      dep('layout', '#layout', null, {component: name});
      return layouts.get(name).html;
    },

    // Textul bogat la afișare: jetoane, `data-ref` cu adresa curentă, `data-media` cu fișierul curent (§1.6 c).
    rich(html) {
      // Textele propuse, marcate [[de-validat:notă]]: eticheta apare doar în previzualizare (§1.8).
      let out = String(html ?? '').replace(/\[\[de-validat:([^\]]*)\]\]\s*/g, (m, note) =>
        preview ? `<mark title="${esc(note)}">De validat</mark> ` : '');
      out = fillTokens(ctx, out, esc);
      out = out.replace(/<a\b([^>]*?)\sdata-ref="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (all, a, ref, b, text) => {
        const href = ctx.link(ref);
        const attrs = `${a}${b}`.replace(/\s?href="[^"]*"/g, '');
        return href ? `<a href="${esc(href)}"${attrs}>${text}</a>` : text;
      });
      out = out.replace(/<(img|a)\b([^>]*?)\sdata-media="(\d+)"([^>]*)>/g, (all, tag, a, id, b) => {
        const m = ctx.media(Number(id));
        if (!m) return tag === 'a' ? '<a>' : '';
        const attr = tag === 'img' ? 'src' : 'href';
        const rest = `${a}${b}`.replace(new RegExp(`\\s?${attr}="[^"]*"`, 'g'), '');
        return `<${tag} ${attr}="${esc(m.src)}"${rest}>`;
      });
      return out;
    },

    text(s) { return fillTokens(ctx, esc(s), esc); }
  };
  return ctx;
}
