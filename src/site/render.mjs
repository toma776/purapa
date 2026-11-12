// Site-ul public, randat din Brain prin contextul urmărit. Fiecare citire are o componentă și un motiv (§3.2).
// Aspectul și mișcarea: src/site/assets/site.css și site.js. Aici e doar structura (semantică, accesibilă) și datele.
// Clasa `fx-js` (pusă în <head>) ascunde ce apare la derulare; dacă scriptul nu pornește în 4 secunde, `fx-still` arată tot.
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {esc} from '../core/content.mjs';
import {byKey, publicPath} from '../registry/entities.mjs';
import {icon} from './icons.mjs';
import {SCENES} from './scenes.mjs';
import {TUTORIAL_SCENES, DEFS, sceneSeconds} from './tutorial.mjs';
import {ANALYSIS, TEST_PARAMS} from './testrapid.mjs';

const ASSETS = new URL('./assets/', import.meta.url);
// Imaginile pregătite dinainte (npm run bake:images), după numele fișierului din media: peticele și decupajul scenelor,
// imaginea scenei în WebP și logo-ul micșorat.
const baked = (file, kind) => { const f = `baked/${file.replace(/\.\w+$/, '')}-${kind}.webp`; return existsSync(new URL(f, ASSETS)) ? `/assets/${f}` : null; };
const ASSET_V = createHash('sha1').update(readFileSync(new URL('site.css', ASSETS))).update(readFileSync(new URL('site.js', ASSETS))).digest('hex').slice(0, 10);
const SITE_URL = (process.env.SITE_URL ?? 'https://purapa.ro').replace(/\/$/, '');
// Cât purapa.ro e încă site-ul vechi, site-ul nou nu se indexează nicăieri. Doar SITE_INDEX=1 (în ziua lansării) îl deschide.
// Se citește la fiecare cerere, ca exportul (--indexabil) să-l poată schimba după import.
export const indexable = () => process.env.SITE_INDEX === '1';
// Fără Disallow: Google trebuie să poată citi paginile ca să vadă „noindex”. O adresă blocată în robots.txt
// poate ajunge totuși în index, din linkurile altor site-uri.
export const robotsTxt = () => indexable()
  ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
  : '# Previzualizare: paginile au „noindex” și nu apar în motoarele de căutare.\nUser-agent: *\nAllow: /\n';

const num = n => new Intl.NumberFormat('ro-RO', {maximumFractionDigits: 2}).format(n);
const lei = n => n == null ? '' : `${num(n)} lei`;
const microns = n => `${String(n).replace('.', ',')} µm`;
const plainTitle = t => String(t ?? '').replace(/\*/g, '');

// Aceeași formulă ca în site.js (calculatorul din browser): economia = apa îmbuteliată − cartușele.
export function calc({liters, cost, yearly, kit, bottle}) {
  const monthly = liters * cost - yearly / 12;
  const loss = monthly <= 0;
  const months = !loss && kit ? Math.ceil(kit / monthly) : null;
  return {
    loss,
    monthly: loss ? '—' : lei(Math.round(monthly)),
    annual: loss ? '—' : lei(Math.round(monthly * 12)),
    bottles: num(Math.round(liters * 12 / bottle)),
    payback: months == null ? '—' : months > 60 ? 'peste 5 ani' : `${months} ${months === 1 ? 'lună' : 'luni'}`
  };
}

export function publicPaths(store) {
  return ['pagini', 'articole'].flatMap(key => store.list(key).filter(p => p.status === 'published').map(p => publicPath(byKey[key], p))).filter(Boolean);
}

function findArticle(store, path, preview) {
  return store.list('articole').find(a => (a.status === 'published' || (preview && a.status === 'draft'))
    && publicPath(byKey.articole, preview && a.draft ? {...a, ...a.draft} : a) === path);
}

// Data unui articol, „AAAA-LL-ZZ” → „11 noiembrie 2026” (citită ca UTC, ca să nu se mute cu o zi).
const postDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')
  ? new Intl.DateTimeFormat('ro-RO', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${d}T00:00:00Z`)) : '';
const newestFirst = (a, b) => String(b.published_on ?? '').localeCompare(String(a.published_on ?? '')) || b.id - a.id;

function findPage(store, path, preview) {
  return store.list('pagini').find(p => (p.status === 'published' || (preview && p.status === 'draft'))
    && publicPath(byKey.pagini, preview && p.draft ? {...p, ...p.draft} : p) === path);
}

// Titlul unei secțiuni: *cuvinte* devin evidențiate.
const title = (ctx, t) => ctx.text(t).replace(/\*([^*]+)\*/g, '<em class="accent">$1</em>');

function button(ctx, label, ref, cls = 'btn') {
  if (!label || !ref) return '';
  const href = ctx.link(ref);
  if (!href) return '';
  const external = /^https?:/.test(href);
  return `<a class="${cls}" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${ctx.text(label)}${external
    ? `${icon('external')}<span class="sr-only"> (se deschide într-o fereastră nouă)</span>` : icon('arrow')}</a>`;
}

const buttons = (ctx, s, light = false) => {
  const html = button(ctx, s.cta_label, s.cta_link, light ? 'btn light' : 'btn') + button(ctx, s.cta2_label, s.cta2_link, light ? 'btn ghost-light' : 'btn ghost');
  return html ? `<div class="actions">${html}</div>` : '';
};

// O imagine întreagă, la proporțiile ei. Dacă pentru fișierul ei există o scenă (scenes.mjs), imaginea e desenată în SVG:
// întreagă dedesubt, apoi peticele de fundal care ascund figurile din ea și, deasupra, câte o copie pentru fiecare felie,
// decupată cu o mască cu margini moi. Feliile se mișcă din CSS; fără mișcare, peticele sunt ascunse, iar feliile se
// suprapun exact peste imagine, deci se vede imaginea neschimbată.
function picture(ctx, id, uid, {sizes = ''} = {}) {
  const m = ctx.media(id);
  if (!m) return {html: '', tall: false};
  const tall = m.height > m.width * 1.15;
  const file = /\/media\/([^?]+)/.exec(m.src)?.[1], sc = SCENES[file];
  if (!sc) {
    const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
    return {tall, html: `<img src="${esc(m.src)}" alt="${esc(m.alt)}"${dims}${sizes ? ` sizes="${sizes}"` : ''} loading="lazy" decoding="async">`};
  }
  const img = `<image href="${esc(baked(file, 'base') ?? m.src)}" width="${sc.width}" height="${sc.height}"/>`, patch = baked(file, 'patch');
  const box = `maskUnits="userSpaceOnUse" x="0" y="0" width="${sc.width}" height="${sc.height}"`;
  const blur = (id, d) => `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${d}"/></filter>`;
  const grad = (p, k) => Array.isArray(p.fill) ? `<linearGradient id="${uid}-g${k}" gradientUnits="userSpaceOnUse" x1="${p.fill[0]}" y1="${p.fill[1]}" x2="${p.fill[3]}" y2="${p.fill[4]}"><stop stop-color="${p.fill[2]}"/><stop offset="1" stop-color="${p.fill[5]}"/></linearGradient>` : '';
  return {tall, html: `<svg class="fx-scene" viewBox="0 0 ${sc.width} ${sc.height}" width="${sc.width}" height="${sc.height}" role="img" aria-label="${esc(m.alt)}">
    <defs>${blur(`${uid}-fp`, 2)}${sc.parts.map((p, k) => `${blur(`${uid}-f${k}`, p.blur ?? 3)}${grad(p, k)}<mask id="${uid}-${k}" ${box}><polygon points="${p.points}" fill="#fff" filter="url(#${uid}-f${k})"/></mask>`).join('')}</defs>
    ${img}<g class="fx-patches">${patch ? `<image href="${patch}" width="${sc.width}" height="${sc.height}" filter="url(#${uid}-fp)"/>` : sc.parts.map((p, k) => p.patch ? `<polygon points="${p.patch}" fill="${Array.isArray(p.fill) ? `url(#${uid}-g${k})` : p.fill}" filter="url(#${uid}-fp)"/>` : '').join('')}</g>
    ${sc.parts.map((p, k) => `<g class="fx-part fx-part-${p.name}" style="transform-origin:${p.origin[0]}px ${p.origin[1]}px" mask="url(#${uid}-${k})">${img}</g>`).join('')}</svg>`};
}

// Figurile unei scene, fără fundal, pentru picătura din hero (scenes.mjs → cutout). Imaginea fără fundal e pregătită
// dinainte (npm run bake:images); fără ea, secțiunea arată imaginea simplă. Aici e doar structura: imaginea de bază
// fără locurile feliilor, feliile deasupra și o mască rotundă care stinge marginile, ca figurile să pară în apă.
function cutout(ctx, id, uid) {
  const m = id == null ? null : ctx.media(id);
  const file = m && /\/media\/([^?]+)/.exec(m.src)?.[1], sc = file && SCENES[file], src = sc?.cutout && baked(file, 'cutout');
  if (!src) return null;
  const [vx, vy, vs] = sc.cutout.view, r = vs / 2;
  const img = `<image href="${src}" width="${sc.width}" height="${sc.height}"/>`;
  const box = `maskUnits="userSpaceOnUse" x="0" y="0" width="${sc.width}" height="${sc.height}"`;
  const blur = (fid, d) => `<filter id="${fid}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${d}"/></filter>`;
  return `<svg class="fx-scene fx-cutout" viewBox="${vx} ${vy} ${vs} ${vs}" role="img" aria-label="${esc(m.alt)}">
    <defs>${blur(`${uid}-fp`, 2)}
    <radialGradient id="${uid}-v" gradientUnits="userSpaceOnUse" cx="${vx + r}" cy="${vy + r}" r="${r}"><stop offset=".76" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
    <mask id="${uid}-vm" maskUnits="userSpaceOnUse" x="${vx}" y="${vy}" width="${vs}" height="${vs}"><circle cx="${vx + r}" cy="${vy + r}" r="${r}" fill="url(#${uid}-v)"/></mask>
    <mask id="${uid}-b" ${box}><rect width="${sc.width}" height="${sc.height}" fill="#fff"/>${sc.parts.map(p => p.patch ? `<polygon points="${p.patch}" fill="#000" filter="url(#${uid}-fp)"/>` : '').join('')}</mask>
    ${sc.parts.map((p, k) => `${blur(`${uid}-f${k}`, p.blur ?? 3)}<mask id="${uid}-${k}" ${box}><polygon points="${p.points}" fill="#fff" filter="url(#${uid}-f${k})"/></mask>`).join('')}</defs>
    <g mask="url(#${uid}-vm)"><g mask="url(#${uid}-b)">${img}</g>
    ${sc.parts.map((p, k) => `<g class="fx-part fx-part-${p.name}" style="transform-origin:${p.origin[0]}px ${p.origin[1]}px" mask="url(#${uid}-${k})">${img}</g>`).join('')}</g></svg>`;
}

function image(ctx, id, {cls = '', eager = false, sizes = ''} = {}) {
  const m = ctx.media(id);
  if (!m) return '';
  const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(m.src)}" alt="${esc(m.alt)}"${dims}${sizes ? ` sizes="${sizes}"` : ''}
    ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`;
}

function priceBlock(p, {cls = 'price'} = {}) {
  if (p.price == null) return '';
  const old = p.list_price > p.price ? p.list_price : null;
  const save = old ? Math.round((1 - p.price / old) * 100) : 0;
  return `<p class="${cls}"><span class="now"><span class="sr-only">Preț: </span>${lei(p.price)}</span>${old
    ? ` <del><span class="sr-only">Preț vechi: </span>${lei(old)}</del>${save >= 5 ? ` <span class="save">−${save}%</span>` : ''}` : ''}</p>`;
}

function head(ctx, s, {center = false, h1 = false} = {}) {
  const tag = h1 ? 'h1' : 'h2';
  return `<div class="head${center ? ' center' : ''}">${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}
    ${s.title ? `<${tag} id="s-${s.id}">${title(ctx, s.title)}</${tag}>` : ''}${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}</div>`;
}

const wrap = (s, inner, extra = '') =>
  `<section class="section ${s.theme ?? 'alb'}${extra}"${s.title ? ` aria-labelledby="s-${s.id}"` : ''}><div class="container">${inner}</div></section>`;

// Varianta youtube-nocookie: fără cookie-uri de urmărire până la pornirea videoului; se încarcă doar când ajunge în ecran.
const video = s => s.video ? `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(s.video)}?rel=0" title="${esc(plainTitle(s.title) || 'Video Purapa')}" loading="lazy"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : '';

// Cifrele-cheie ale unui produs, din câmpurile și relațiile lui (nimic scris de mână).
function productFacts(ctx, p) {
  const stages = ctx.within(ctx.component, 'Etapele produsului', () => ctx.related('produse', p.id, 'stages'));
  return [
    p.capacity_l && {value: `${num(p.capacity_l)} L`, label: 'capacitate cartuș'},
    p.lifetime_months && {value: `${p.lifetime_months} luni`, label: 'durata cartușului'},
    stages.length && {value: stages.map(e => microns(e.microns)).join(' + '), label: `filtrare în ${stages.length} etape`}
  ].filter(Boolean);
}

// Liniile „titlu | text” ale unei secțiuni (cifrele din hero, punctele din text), cu jetoane.
const factLines = (ctx, s) => String(s.facts ?? '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(([v]) => v)
  .map(([v, l = '']) => ({value: ctx.text(v), label: ctx.text(l)}));

// Culorile padurilor de pe banda de test (decorative).
const PADS = ['#f6d76b', '#f2b65c', '#ee8f6b', '#e86f8a', '#d96bb0', '#b56fd0', '#8b78dd', '#6b8fe6', '#58a9e8', '#4fc3e0', '#4fd0bf', '#62d39a', '#8fd67a', '#bfd866', '#e3d062', '#f0c36a'];
const ripples = '<span class="fx-ripples" aria-hidden="true"><i></i><i></i><i></i></span>';
// Mișcarea e doar în atribute (data-reveal, data-stagger, data-zone…): fără JavaScript, pagina e aceeași, statică.
const rhead = (ctx, s, opts) => head(ctx, s, opts).replace('class="head', 'data-reveal class="head');
const flush = html => html.replace('class="head"', 'class="head" style="margin-bottom:0"');
const ractions = (html, attrs = 'data-reveal') => html.replace('class="actions"', 'class="actions" ' + attrs);

// Dovezile: recenziile clienților de la retailer (entitatea „recenzii”), doar cele publicate.
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 5.95 6.55.85-4.8 4.55 1.2 6.5L12 17.3l-5.8 3.15 1.2-6.5-4.8-4.55 6.55-.85z"/></svg>';
const dec = v => Number(v).toFixed(1).replace('.', ',');
const stars = v => `<span class="stars" role="img" aria-label="${dec(v)} din 5 stele" style="--v:${Math.max(0, Math.min(1, v / 5))}">
  <span class="stars-bg">${STAR.repeat(5)}</span><span class="stars-fill">${STAR.repeat(5)}</span></span>`;
const reviewWord = n => n === 1 ? 'recenzie' : 'recenzii';
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthYear = d => { const [y, m] = String(d ?? '').split('-').map(Number); return y && m ? `${MONTHS[m - 1]} ${y}` : ''; };
const shortProduct = name => String(name).split(/,| – | - /)[0].trim();
function reviewsOf(ctx, productIds = null) {
  return ctx.within(ctx.component, 'Recenziile produselor', () => ctx.query('recenzii', {
    fields: ['product_id', 'rating', 'verified', 'posted_at', 'author', 'title', 'text', 'url'],
    where: r => !productIds || productIds.includes(r.product_id)}));
}
const summarize = rs => rs.length ? {n: rs.length, avg: rs.reduce((a, r) => a + r.rating, 0) / rs.length,
  verified: Math.round(100 * rs.filter(r => r.verified).length / rs.length)} : null;

// Cardul de produs: nota și recenziile (spre retailer), scurta descriere, cifrele-cheie, prețul, disponibilitatea.
function productCard(ctx, p, rs, retailer, cat = null) {
  const sum = summarize(rs);
  const tags = [p.capacity_l && `${num(p.capacity_l)} L`, p.lifetime_months && `${p.lifetime_months} luni`].filter(Boolean);
  const out = p.availability === 'indisponibil';
  return `<article class="product" aria-labelledby="p-${p.id}" data-reveal data-spot${cat ? ` data-cat="${esc(cat.slug)}"` : ''}>
    <div class="media">${p.list_price > p.price ? '<span class="badge">Ofertă</span>' : ''}${image(ctx, p.image_id, {sizes: '(max-width: 600px) 92vw, 280px'})}</div>
    <div class="body">${cat ? `<p class="cat">${esc(cat.name)}</p>` : ''}<h3 id="p-${p.id}">${esc(p.name)}</h3>
      ${sum ? `<a class="rating" href="${esc(rs[0].url)}" target="_blank" rel="noopener">${stars(sum.avg)}<strong>${dec(sum.avg)}</strong><span>${sum.n} ${reviewWord(sum.n)}</span><span class="sr-only"> pe ${esc(retailer?.name ?? 'site-ul retailerului')} (se deschide într-o fereastră nouă)</span></a>` : ''}
      ${p.summary ? `<p>${ctx.text(p.summary)}</p>` : ''}
      ${tags.length ? `<ul class="tags" aria-label="Pe scurt">${tags.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
      <div class="buy">${priceBlock(p)}${p.availability ? `<span class="stock${out ? ' out' : ''}">${esc(p.availability)}</span>` : ''}</div>
      ${p.buy_url ? `<a class="btn small${out ? ' ghost' : ''}" href="${esc(p.buy_url)}" target="_blank" rel="noopener">Comandă pe ${esc(retailer?.name ?? 'site-ul retailerului')}${icon('external')}<span class="sr-only"> ${esc(p.name)} (se deschide într-o fereastră nouă)</span></a>` : ''}</div>
  </article>`;
}

const SECTIONS = {
  // Hero: textul în stânga, picătura 3D în dreapta; dacă există o imagine (a secțiunii sau a produsului), plutește în picătură.
  hero: (ctx, s, i) => {
    const product = ctx.within(ctx.component, 'Produsul din hero', () => ctx.related('sectiuni', s.id, 'products'))[0];
    // Cifrele-cheie: cele scrise în secțiune („valoare | etichetă”, cu jetoane), altfel cele calculate din produs.
    const facts = s.facts ? factLines(ctx, s)
      : product ? productFacts(ctx, product).map(f => ({value: esc(f.value), label: esc(f.label)})) : [];
    // Imaginea secțiunii, dacă are o scenă cu decupaj, intră în picătură fără fundal, cu figurile în mișcare.
    const cut = cutout(ctx, s.image_id, `hc${s.id}`);
    const visual = cut ?? image(ctx, s.image_id ?? product?.image_id, {eager: true, sizes: '(max-width: 880px) 60vw, 380px'});
    // Lebăda din logo, în picătură: site.js o decupează din imaginea logo-ului și o arată refractată prin apă.
    const brand = !visual && s.drop_mark === 'lebada' ? ctx.within(ctx.component, 'Semnul din picătură', () => ctx.one('firma')) : null;
    const markMedia = brand?.logo_id ? ctx.within(ctx.component, 'Semnul din picătură', () => ctx.media(brand.logo_id)) : null;
    const mark = markMedia ? ` data-mark="${esc(markMedia.src)}"` : '';
    const tag = i === 0 ? 'h1' : 'h2';
    return `<section class="fx-hero${visual ? '' : ' solo'}" aria-labelledby="s-${s.id}" data-zone><div class="container fx-hero-grid">
      <div class="copy">${s.kicker ? `<p class="eyebrow" data-reveal>${ctx.text(s.kicker)}</p>` : ''}
        <${tag} id="s-${s.id}" data-split>${title(ctx, s.title)}</${tag}>
        ${s.text ? `<div class="lead" data-reveal style="--i:3">${ctx.rich(s.text)}</div>` : ''}
        ${ractions(buttons(ctx, s), 'data-reveal style="--i:4"')}
        ${facts.length ? `<ul class="facts" aria-label="Pe scurt" data-reveal style="--i:5">${facts.map(f => `<li><strong data-count>${f.value}</strong><span>${f.label}</span></li>`).join('')}</ul>` : ''}
      </div>
      <div class="fx-stage"><canvas class="fx-drop" aria-hidden="true"${mark}></canvas>
        ${cut ? `<div class="fx-product cut in">${cut}</div>` : visual ? `<div class="fx-product"><div class="fx-float">${visual}</div></div>` : ''}
        ${visual && product?.price != null ? `<div class="fx-chip fx-chip-price"><span class="label">Preț</span>${priceBlock(product, {cls: 'pc-price'})}
          ${product.availability ? `<span class="stock">${esc(product.availability)}</span>` : ''}</div>` : ''}
      </div>
    </div></section>`;
  },

  beneficii: (ctx, s) => {
    const items = ctx.within(ctx.component, 'Beneficiile secțiunii', () => ctx.related('sectiuni', s.id, 'benefits'));
    // Cu imagine: text și listă lângă imaginea întreagă, la proporțiile ei, pe un fundal de culoarea apei.
    if (s.image_id) {
      const pic = picture(ctx, s.image_id, `sc${s.id}`, {sizes: '(max-width: 880px) 80vw, 520px'});
      return `<section class="section fx-impact" aria-labelledby="s-${s.id}"><div class="container fx-impact-grid">
        <div class="fx-impact-media${pic.tall ? ' tall' : ''}" data-reveal>${pic.html}</div>
        <div>${rhead(ctx, s)}
          <ul class="fx-impact-list" data-stagger>${items.map(b => `<li data-reveal><span class="icon">${icon(b.icon)}</span><div><h3>${ctx.text(b.title)}</h3><p>${ctx.text(b.text)}</p></div></li>`).join('')}</ul>
          ${ractions(buttons(ctx, s))}</div></div></section>`;
    }
    return wrap(s, `${rhead(ctx, s, {center: true})}<div class="fx-cards" data-stagger>${items.map((b, k) =>
      `<article class="fx-card" data-reveal data-spot><span class="n" aria-hidden="true">${String(k + 1).padStart(2, '0')}</span><span class="icon">${icon(b.icon)}</span>
        <h3>${ctx.text(b.title)}</h3><p>${ctx.text(b.text)}</p></article>`).join('')}</div>
      ${s.cta_label ? `<div class="actions fx-center" data-reveal>${button(ctx, s.cta_label, s.cta_link, 'btn ghost')}</div>` : ''}`);
  },

  produse: (ctx, s) => {
    let items;
    if (s.category_id) {
      items = ctx.within(ctx.component, 'Produsele categoriei', () => ctx.query('produse', {
        scope: `categorii:${s.category_id}`, where: p => p.category_id === s.category_id, sort: (a, b) => (a.position ?? 0) - (b.position ?? 0)}));
    } else if (ctx.hasLinks('sectiuni', s.id, 'products')) {
      items = ctx.within(ctx.component, 'Produsele alese în secțiune', () => ctx.related('sectiuni', s.id, 'products'));
    } else {
      items = ctx.within(ctx.component, 'Toate produsele', () => ctx.query('produse', {
        fields: ['name', 'summary', 'price', 'list_price', 'availability', 'image_id', 'buy_url', 'position', 'capacity_l', 'lifetime_months', 'category_id', 'retailer_id'],
        sort: (a, b) => (a.position ?? 0) - (b.position ?? 0)}));
    }
    // Un singur produs ales: vitrină, cu produsul care se înclină după cursor. Mai multe: grilă.
    if (items.length === 1 && !s.category_id) {
      const p = items[0];
      const cartridges = ctx.within(ctx.component, 'Cartușele produsului', () => ctx.related('produse', p.id, 'cartridges'));
      const stages = ctx.within(ctx.component, 'Etapele produsului', () => ctx.related('produse', p.id, 'stages'));
      const retailer = ctx.within(ctx.component, 'Retailerul produsului', () => ctx.get('retaileri', p.retailer_id));
      const rs = reviewsOf(ctx, [p.id]);
      const ticks = [
        p.capacity_l && `Capacitate de <strong>${num(p.capacity_l)} L</strong>${p.lifetime_months ? `, până la ${p.lifetime_months} luni de folosire` : ''}`,
        stages.length && `Filtrare în ${stages.length} etape: ${stages.map(e => `${esc(e.name.toLowerCase())} ${microns(e.microns)}`).join(', ')}`,
        cartridges.length && `Cartușe de schimb: ${cartridges.map(c => esc(c.name.replace(/,? Purapa.*$/, ''))).join(' și ')}`,
        p.availability && `${esc(p.availability[0].toUpperCase() + p.availability.slice(1))}${retailer ? `, livrare prin ${esc(retailer.name)}` : ''}`
      ].filter(Boolean);
      return wrap(s, `${rhead(ctx, s, {center: true})}<article class="fx-kit" aria-labelledby="p-${p.id}">
        <div class="fx-kit-stage" data-zone>${ripples}${p.list_price > p.price ? '<span class="badge">Ofertă</span>' : ''}
          <div class="fx-tilt" data-reveal><div class="fx-float">${image(ctx, p.image_id, {sizes: '(max-width: 880px) 80vw, 440px'})}</div></div></div>
        <div class="fx-kit-body" data-reveal><h3 id="p-${p.id}">${esc(p.name)}</h3>${p.summary ? `<p class="summary">${ctx.text(p.summary)}</p>` : ''}${priceBlock(p)}
          <ul class="ticks" data-stagger>${ticks.map(t => `<li data-reveal>${icon('check')}<span>${t}</span></li>`).join('')}</ul>
          ${(sum => sum ? `<a class="rating big" href="${esc(rs[0].url)}" target="_blank" rel="noopener">${stars(sum.avg)}<strong>${dec(sum.avg)}</strong><span>${sum.n} ${reviewWord(sum.n)}${retailer ? ` pe ${esc(retailer.name)}` : ''}</span><span class="sr-only"> (se deschide într-o fereastră nouă)</span></a>` : '')(summarize(rs))}
          <div class="actions">${p.buy_url ? `<a class="btn" href="${esc(p.buy_url)}" target="_blank" rel="noopener">Comandă pe ${esc(retailer?.name ?? 'site-ul retailerului')}${icon('external')}<span class="sr-only"> (se deschide într-o fereastră nouă)</span></a>` : ''}
            ${button(ctx, s.cta_label, s.cta_link, 'btn ghost')}</div>
          ${retailer ? `<p class="note">Comanda, plata și livrarea se fac prin ${esc(retailer.name)}, partenerul nostru autorizat.</p>` : ''}</div>
      </article>`);
    }
    // Grila: deasupra, dovezile (nota medie, numărul de recenzii, achizițiile verificate, cine livrează), calculate din
    // recenzii; când secțiunea arată tot catalogul, produsele sunt grupate pe categorii, cu un cuprins de categorii.
    const rs = reviewsOf(ctx, items.map(p => p.id));
    const sum = summarize(rs);
    const retailers = ctx.within(ctx.component, 'Retailerul produselor', () => ctx.query('retaileri', {fields: ['name']}));
    const retailerOf = p => retailers.find(r => r.id === p.retailer_id) ?? (retailers.length === 1 ? retailers[0] : null);
    const shop = retailers.length === 1 ? retailers[0] : null;
    const proof = sum ? `<ul class="proof" data-reveal aria-label="De ce să ai încredere">
      <li><span class="proof-big">${dec(sum.avg)}</span>${stars(sum.avg)}<span>nota medie din ${sum.n} ${reviewWord(sum.n)}${shop ? ` pe ${esc(shop.name)}` : ''}</span></li>
      <li><span class="proof-big">${sum.verified}%</span><span>dintre recenzii vin de la clienți cu achiziție verificată</span></li>
      ${shop ? `<li><span class="proof-icon">${icon('truck')}</span><span>Comanda, plata și livrarea se fac prin ${esc(shop.name)}, partenerul nostru autorizat</span></li>` : ''}</ul>` : '';
    // Tot catalogul: fiecare card își arată categoria, iar deasupra e un filtru pe categorii (site.js îl activează;
    // fără JavaScript, filtrul rămâne ascuns și se văd toate produsele).
    const grouped = !s.category_id && !ctx.hasLinks('sectiuni', s.id, 'products');
    const cats = grouped ? ctx.within(ctx.component, 'Categoriile produselor', () => ctx.query('categorii', {fields: ['name', 'slug']}))
      .map(c => ({...c, n: items.filter(p => p.category_id === c.id).length})).filter(c => c.n) : [];
    const catOf = p => cats.find(c => c.id === p.category_id);
    const card = p => productCard(ctx, p, rs.filter(r => r.product_id === p.id), retailerOf(p), catOf(p));
    const body = `${cats.length > 1 ? `<div class="cat-nav" role="group" aria-label="Filtrează după categorie" data-filter hidden>
        <button type="button" aria-pressed="true" data-cat="">Toate<span>${items.length}</span></button>
        ${cats.map(c => `<button type="button" aria-pressed="false" data-cat="${esc(c.slug)}">${esc(c.name)}<span>${c.n}</span></button>`).join('')}</div>` : ''}
      <div class="products" data-stagger>${items.map(card).join('')}</div>`;
    return wrap(s, `${rhead(ctx, s)}${proof}${body}${ractions(buttons(ctx, s))}`, ' shop');
  },

  // Recenziile clienților: rezumatul (nota medie, distribuția pe stele, achizițiile verificate) și cardurile.
  // Doar ale produselor alese în secțiune, altfel toate. Întâi cele cu text consistent, apoi cele mai noi;
  // după primele 6, restul se deschid la cerere (fără JavaScript, sunt toate vizibile).
  recenzii: (ctx, s) => {
    const chosen = ctx.hasLinks('sectiuni', s.id, 'products') ? ctx.within(ctx.component, 'Produsele secțiunii', () => ctx.related('sectiuni', s.id, 'products')) : null;
    const rs = reviewsOf(ctx, chosen?.map(p => p.id) ?? null);
    const sum = summarize(rs);
    if (!sum) return '';
    const products = Object.fromEntries(ctx.within(ctx.component, 'Produsele recenziilor', () => ctx.query('produse', {fields: ['name']})).map(p => [p.id, p]));
    const shop = ctx.within(ctx.component, 'Retailerul', () => ctx.query('retaileri', {fields: ['name']}))[0];
    const weight = r => (String(r.text ?? '').length > 70 ? 2 : 0) + (r.verified ? 1 : 0);
    const sorted = [...rs].sort((a, b) => weight(b) - weight(a) || String(b.posted_at).localeCompare(String(a.posted_at)));
    const dist = [5, 4, 3, 2, 1].map(n => [n, rs.filter(r => r.rating === n).length]);
    const SHOW = 6;
    return wrap(s, `<div class="reviews">
      <aside class="reviews-summary" data-reveal>${flush(head(ctx, s))}
        <div class="score"><span class="proof-big">${dec(sum.avg)}</span><div>${stars(sum.avg)}<p>din ${sum.n} ${reviewWord(sum.n)}${shop ? ` pe ${esc(shop.name)}` : ''}</p></div></div>
        <ul class="dist" aria-label="Distribuția notelor">${dist.map(([n, c]) => `<li><span>${n} ${STAR}</span><i style="--w:${c / sum.n}"></i><span>${c}</span></li>`).join('')}</ul>
        <p class="verified-share">${icon('shield')}<span><strong>${sum.verified}%</strong> dintre recenzii vin de la clienți cu achiziție verificată.</span></p>
        ${buttons(ctx, s)}</aside>
      <div class="reviews-list"><ul class="review-cards" data-stagger>${sorted.map((r, i) => { const p = products[r.product_id];
        return `<li class="review${i >= SHOW ? ' more' : ''}" data-reveal><figure>
          <div class="review-top">${stars(r.rating)}${r.verified ? `<span class="verified">${icon('check')}Achiziție verificată</span>` : ''}</div>
          ${r.title ? `<h3>${esc(r.title)}</h3>` : ''}${r.text ? `<blockquote><p>${esc(r.text)}</p></blockquote>` : ''}
          <figcaption><span class="avatar" aria-hidden="true">${esc(r.author[0] ?? '·')}</span><span><strong>${esc(r.author)}</strong>
            <span>${monthYear(r.posted_at)}${p ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(shortProduct(p.name))}<span class="sr-only"> (recenzia pe ${esc(shop?.name ?? 'site-ul retailerului')}, se deschide într-o fereastră nouă)</span></a>` : ''}</span></span></figcaption>
        </figure></li>`; }).join('')}</ul>
        ${rs.length > SHOW ? `<p class="reviews-more" hidden><button class="btn ghost" type="button" aria-expanded="false">Arată toate cele ${rs.length} ${reviewWord(rs.length)}</button></p>` : ''}
        <p class="reviews-source">Recenziile sunt preluate de pe ${esc(shop?.name ?? 'site-ul retailerului')}, unde au fost scrise de clienți; numele sunt scurtate.</p></div>
    </div>`, ' reviews-section');
  },

  // Calculatorul de economii: costul anual al cartușelor vine din prețul și durata lor (nu e scris de mână);
  // serverul randează rezultatul pentru valorile implicite, browserul îl recalculează pe loc.
  calculator: (ctx, s) => {
    const p = {persoane: 3, litri_persoana_zi: 1.5, cost_litru: 3.5, sticla_l: 2, ...(s.params ?? {})};
    const kit = ctx.within(ctx.component, 'Kitul din calculator', () => ctx.related('sectiuni', s.id, 'products'))[0];
    const cartridges = kit ? ctx.within(ctx.component, 'Cartușele kitului', () => ctx.related('produse', kit.id, 'cartridges')) : [];
    const parts = cartridges.filter(c => c.price != null && c.lifetime_months).map(c => ({name: c.name.replace(/,? Purapa.*$/, ''), price: c.price, months: c.lifetime_months,
      yearly: c.price * 12 / c.lifetime_months}));
    const yearly = Math.round(parts.reduce((sum, c) => sum + c.yearly, 0) * 100) / 100;
    const liters = Math.round(p.persoane * p.litri_persoana_zi * 30);
    const r = calc({liters, cost: p.cost_litru, yearly, kit: kit?.price ?? null, bottle: p.sticla_l});
    const data = {yearly, kit: kit?.price ?? null, perPersonMonth: p.litri_persoana_zi * 30, bottle: p.sticla_l};
    const field = (id, label, input, hint = '') => `<div class="calc-field"><label for="${id}">${label}</label>${input}${hint ? `<small id="${id}-h">${hint}</small>` : ''}</div>`;
    return wrap(s, `<div class="calc-grid"><div data-reveal>${flush(head(ctx, s))}
      <details class="assumptions"><summary>Cum calculăm</summary><ul>
        <li>Consum: ${num(p.litri_persoana_zi)} L de apă de băut pe persoană pe zi, adică ${num(p.litri_persoana_zi * 30)} L pe lună.</li>
        ${parts.length ? `<li>Cartușele kitului: ${parts.map(c => `${esc(c.name)}, ${lei(c.price)} la ${c.months} ${c.months === 1 ? 'lună' : 'luni'}`).join('; ')}. În total ${lei(Math.round(yearly))} pe an, la prețurile actuale.</li>` : ''}
        ${kit?.price != null ? `<li>Kitul costă ${lei(kit.price)}, plătit o singură dată; din el se calculează amortizarea.</li>` : ''}
        <li>Sticlele PET sunt socotite de ${num(p.sticla_l)} L.</li></ul></details></div>
      <form class="calc" data-reveal data-calc='${esc(JSON.stringify(data))}' aria-labelledby="calc-${s.id}" onsubmit="return false">
        <div class="calc-head"><span class="icon">${icon('drop')}</span><h3 id="calc-${s.id}">Calculează-ți economiile</h3></div>
        ${field(`c${s.id}-p`, 'Persoane în casă', `<div class="stepper"><button type="button" data-step="-1" aria-label="O persoană mai puțin">−</button>
          <input id="c${s.id}-p" name="persoane" type="number" inputmode="numeric" min="1" max="15" value="${p.persoane}">
          <button type="button" data-step="1" aria-label="O persoană în plus">+</button></div>`)}
        ${field(`c${s.id}-l`, 'Apă îmbuteliată pe lună (litri)', `<input id="c${s.id}-l" name="litri" type="number" inputmode="numeric" min="1" step="1" value="${liters}" aria-describedby="c${s.id}-l-h">`,
          'Se completează după numărul de persoane; îl poți schimba.')}
        ${field(`c${s.id}-c`, 'Cost apă îmbuteliată (lei/litru)', `<input id="c${s.id}-c" name="cost" type="number" inputmode="decimal" min="0.1" step="0.1" value="${p.cost_litru}">`)}
        <dl class="results">
          <div class="r main"><dt>Economisești pe an</dt><dd data-r="annual">${r.annual}</dd></div>
          <div class="r"><dt>Pe lună</dt><dd data-r="monthly">${r.monthly}</dd></div>
          <div class="r"><dt>Sticle PET evitate / an</dt><dd data-r="bottles">${r.bottles}</dd></div>
          ${kit?.price != null ? `<div class="r"><dt>Kitul se amortizează în</dt><dd data-r="payback">${r.payback}</dd></div>` : ''}
        </dl>
        <p class="calc-warn"${r.loss ? '' : ' hidden'}>La acest consum, cartușele costă mai mult decât apa îmbuteliată.</p>
        <p class="sr-only" aria-live="polite" data-r="summary"></p>
        ${s.cta_label ? `<div class="actions">${button(ctx, s.cta_label, s.cta_link)}</div>` : ''}
      </form></div>`);
  },

  test: (ctx, s) => {
    const params = ctx.within(ctx.component, 'Parametrii testului', () => ctx.related('sectiuni', s.id, 'parameters'));
    const count = ctx.text('{nr_parametri}');
    // Fără imagine și cu familii: câte un panou pe familie, cu ce indică fiecare parametru.
    const groups = [...new Set(params.map(p => p.group).filter(Boolean))];
    if (!s.image_id && groups.length) {
      const GROUP_ICON = {'Duritate și echilibru': 'balance', 'Dezinfectare': 'flask', 'Contaminanți': 'alert', 'Metale': 'metal'};
      const sets = [...groups, null].map(g => [g, params.filter(p => (p.group ?? null) === g)]).filter(([, ps]) => ps.length);
      return wrap(s, `<div class="params-head" data-reveal>${flush(head(ctx, s))}
        ${/^\d+$/.test(count) ? `<p class="params-stat"><strong data-count>${count}</strong><span>parametri analizați, în ${sets.length} familii</span></p>` : ''}</div>
        <div class="param-groups">${sets.map(([g, ps]) => `<div class="param-group" data-reveal data-spot>
          <header><span class="icon">${icon(GROUP_ICON[g] ?? 'drop')}</span><h3>${esc(g ?? 'Alți parametri')}</h3><span class="n">${ps.length}</span></header>
          <dl>${ps.map(p => `<div><dt>${esc(p.name)}${p.symbol && !p.name.includes(p.symbol) ? ` <abbr>${esc(p.symbol)}</abbr>` : ''}</dt>${p.indicates ? `<dd>${ctx.text(p.indicates)}</dd>` : ''}</div>`).join('')}</dl>
        </div>`).join('')}</div>
        ${buttons(ctx, s) ? `<div class="actions fx-center" data-reveal>${button(ctx, s.cta_label, s.cta_link)}${button(ctx, s.cta2_label, s.cta2_link, 'btn ghost')}</div>` : ''}`);
    }
    if (!s.image_id) {
      return wrap(s, `${rhead(ctx, s)}${params.length ? `<ol class="params" data-reveal>${params.map(p =>
        `<li><strong>${esc(p.name)}${p.symbol ? ` (${esc(p.symbol)})` : ''}</strong>${p.indicates ? ` — ${ctx.text(p.indicates)}` : ''}</li>`).join('')}</ol>` : ''}${ractions(buttons(ctx, s))}`);
    }
    // Cu imagine: parametrii ca o bandă de testare; fiecare pad e un parametru, iar sub bandă apare ce indică.
    const label = p => `${esc(p.name)}${p.symbol && !p.name.includes(p.symbol) ? ` (${esc(p.symbol)})` : ''}`;
    return wrap(s, `<div class="fx-test"><div class="fx-test-stage" data-zone>${ripples}
        <div class="fx-tilt" data-reveal><div class="fx-float">${image(ctx, s.image_id, {sizes: '(max-width: 880px) 80vw, 480px'})}</div></div>
        ${/^\d+$/.test(count) ? `<p class="fx-stat" data-reveal><strong data-count>${count}</strong><span>parametri analizați</span></p>` : ''}</div>
      <div>${rhead(ctx, s)}
        ${params.length ? `<div class="fx-strip-wrap" data-reveal><ol class="fx-strip" aria-label="Parametrii testului">${params.map((p, k) =>
          `<li style="--c:${PADS[k % PADS.length]};--i:${k}"><button type="button" aria-pressed="${k === 0}" data-name="${label(p)}" data-info="${p.indicates ? ctx.text(p.indicates) : ''}"><span class="sr-only">${label(p)}</span></button></li>`).join('')}</ol>
          <p class="fx-strip-out" aria-live="polite"><strong>${label(params[0])}</strong><span>${params[0].indicates ? ctx.text(params[0].indicates) : ''}</span></p></div>` : ''}
        ${ractions(buttons(ctx, s))}</div></div>`);
  },

  // Drumul apei: scena rămâne pe loc cât derulezi, iar particulele se opresc pe rând la fiecare etapă.
  // Fără JavaScript sau cu mișcarea redusă, etapele sunt o listă obișnuită.
  tehnologie: (ctx, s) => {
    const stages = ctx.within(ctx.component, 'Etapele filtrării', () => ctx.related('sectiuni', s.id, 'stages'));
    const steps = stages.length + (s.text ? 1 : 0);
    return `<section class="fx-flow on-dark" aria-labelledby="s-${s.id}" data-flow='${esc(JSON.stringify({stages: stages.length}))}' style="--steps:${steps}"><div class="fx-flow-pin">
      <div class="container">${head(ctx, {...s, text: null}, {center: true})}</div>
      <div class="fx-flow-band" aria-hidden="true"><canvas></canvas>
        <span class="fx-flow-tag start">${icon('tap')}Apa de la robinet</span>
        ${stages.map((e, k) => `<span class="fx-flow-gate" style="--x:${((k + 1) / (stages.length + 1) * 100).toFixed(2)}%">${e.microns != null ? microns(e.microns) : k + 1}</span>`).join('')}
        <span class="fx-flow-tag end">${icon('glass')}Apă bună de băut</span></div>
      <div class="container"><ol class="fx-flow-steps">
        ${stages.map((e, k) => `<li${k === 0 ? ' class="is-on"' : ''}><span class="n" aria-hidden="true">${k + 1}</span><div>
          <h3><span class="sr-only">Etapa ${k + 1}: </span>${esc(e.name)}${e.microns != null ? ` <em>${microns(e.microns)}</em>` : ''}</h3>
          ${e.retains ? `<p class="retains">Reține: ${esc(e.retains)}</p>` : ''}${e.text ? `<div class="text">${ctx.rich(e.text)}</div>` : ''}</div></li>`).join('')}
        ${s.text ? `<li class="result"><span class="n" aria-hidden="true">${icon('glass')}</span><div><h3>Apă bună de băut</h3><div class="text">${ctx.rich(s.text)}</div></div></li>` : ''}
      </ol><div class="fx-flow-rail" aria-hidden="true"><i></i></div></div>
    </div></section>`;
  },

  pasi: (ctx, s) => {
    const steps = ctx.within(ctx.component, 'Pașii secțiunii', () => ctx.related('sectiuni', s.id, 'steps'));
    // Mulți pași (sau cu imagine): antetul rămâne pe loc, iar pașii curg pe o axă verticală care se umple la derulare. Puțini: carduri pe un rând.
    if (s.image_id || steps.length >= 4) {
      return wrap(s, `<div class="timeline-grid"><div class="timeline-aside" data-reveal>${flush(head(ctx, s))}${buttons(ctx, s)}
        ${s.image_id ? `<div class="timeline-media">${image(ctx, s.image_id, {sizes: '(max-width: 960px) 92vw, 440px'})}</div>` : ''}</div>
        <ol class="timeline" data-progress>${steps.map((p, i) => `<li data-reveal><span class="dot" aria-hidden="true">${i + 1}</span><div><h3>${ctx.text(p.title)}</h3>${ctx.rich(p.text ?? '')}</div></li>`).join('')}</ol></div>`);
    }
    return wrap(s, `${rhead(ctx, s)}<ol class="steps" data-stagger>${steps.map(p => `<li data-reveal data-spot><h3>${ctx.text(p.title)}</h3>${ctx.rich(p.text ?? '')}</li>`).join('')}</ol>
      ${buttons(ctx, s) ? `<div style="margin-top:2rem" data-reveal>${buttons(ctx, s)}</div>` : ''}`);
  },

  intrebari: (ctx, s) => {
    const faqs = ctx.within(ctx.component, 'Întrebările secțiunii', () => ctx.related('sectiuni', s.id, 'faqs'));
    return wrap(s, `<div class="faq"><div class="head" data-reveal>${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}
      <h2 id="s-${s.id}">${title(ctx, s.title)}</h2>${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}${buttons(ctx, s)}</div>
      <div class="accordion" data-stagger>${faqs.map(q => `<details data-reveal><summary>${ctx.text(q.question)}<span class="plus" aria-hidden="true"></span></summary>
        <div class="answer">${ctx.rich(q.answer)}</div></details>`).join('')}</div></div>`);
  },

  // Cu video, secțiunea e o prezentare centrată (antet + video); cu puncte-cheie, introducerea stă în stânga, iar punctele,
  // numerotate, în dreapta, cu nota ca încheiere; doar cu notă, textul are alături un card cu precizarea; altfel e text de citit.
  text: (ctx, s) => s.video ? wrap(s, `${rhead(ctx, s, {center: true})}${ractions(buttons(ctx, s))}${video(s).replace('class="video"', 'class="video" data-reveal')}`)
    : s.facts ? wrap(s, `<div class="intro-split top"><div data-reveal>${flush(head(ctx, s))}${buttons(ctx, s)}</div>
      <div class="points-card" data-reveal style="--i:1"><ol class="points" data-stagger>${factLines(ctx, s).map((f, k) =>
        `<li data-reveal><span class="n" aria-hidden="true">${String(k + 1).padStart(2, '0')}</span><div><h3>${f.value}</h3>${f.label ? `<p>${f.label}</p>` : ''}</div></li>`).join('')}</ol>
        ${s.note ? `<p class="points-note">${icon('shield')}<span>${ctx.text(s.note)}</span></p>` : ''}</div></div>`)
    : s.note ? wrap(s, `<div class="intro-split"><div data-reveal>${flush(head(ctx, s))}${buttons(ctx, s)}</div>
      <aside class="note-card" data-reveal style="--i:2"><span class="icon">${icon('shield')}</span><p>${ctx.text(s.note)}</p></aside></div>`)
    : wrap(s, `<div class="prose" data-reveal>${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}
    ${s.title ? `<h2 id="s-${s.id}">${title(ctx, s.title)}</h2>` : ''}${s.text ? ctx.rich(s.text) : ''}${buttons(ctx, s)}</div>`),

  // Tutorialul animat: un player de scene ilustrate (src/site/tutorial.mjs), cu narațiunea pașilor ca subtitrare.
  // Fără JavaScript, scenele stau una sub alta, ca o listă de pași cu ilustrații; site.js le face player.
  tutorial: (ctx, s) => {
    const steps = ctx.within(ctx.component, 'Pașii tutorialului', () => ctx.related('sectiuni', s.id, 'steps'));
    const secs = steps.map(p => sceneSeconds(p.text));
    const clock = n => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`;
    const btn = (cls, label, svgPath) => `<button class="${cls}" type="button" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${svgPath}</svg></button>`;
    const PLAY = '<path class="i-play" d="M8 5.5v13l11-6.5z"/><path class="i-pause" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>';
    return wrap(s, `${rhead(ctx, s, {center: true})}
      <div class="tut" data-tutorial data-reveal>${DEFS}
        <div class="tut-main">
          <ol class="tut-scenes">${steps.map((p, i) => `<li class="tut-scene" data-dur="${secs[i]}" style="--T:${secs[i]}s"><figure>
            <div class="tut-art">${(TUTORIAL_SCENES[p.scene] ?? TUTORIAL_SCENES.intro)(esc(plainTitle(p.title)))}</div>
            <figcaption><p class="tut-count">Pasul ${i + 1} din ${steps.length}</p><h3>${ctx.text(p.title)}</h3>${ctx.rich(p.text ?? '')}</figcaption></figure></li>`).join('')}</ol>
          <div class="tut-over" hidden>
            <button class="tut-big" type="button" aria-label="Pornește tutorialul"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
              <span>Pornește tutorialul <small>${clock(secs.reduce((a, b) => a + b, 0))} min</small></span></button>
            <div class="tut-bar">
              ${btn('tut-play', 'Pornește', PLAY)}${btn('tut-prev', 'Pasul anterior', '<path d="M6 5h2.5v14H6zM19 5.5v13L9.5 12z"/>')}${btn('tut-next', 'Pasul următor', '<path d="M15.5 5H18v14h-2.5zM5 5.5v13L14.5 12z"/>')}
              <div class="tut-segs">${secs.map((n, i) => `<button type="button" data-go="${i}" style="flex-grow:${n}" aria-label="Pasul ${i + 1}: ${esc(plainTitle(steps[i].title))}"><i></i></button>`).join('')}</div>
              <span class="tut-n" aria-hidden="true">1 / ${steps.length}</span>
              ${btn('tut-full', 'Ecran complet', '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>')}
            </div>
          </div>
        </div>
        <ol class="tut-chapters" hidden aria-label="Pașii tutorialului">${steps.map((p, i) => `<li><button type="button" data-go="${i}">
          <span class="n">${i + 1}</span><span class="t">${ctx.text(p.title)}</span><span class="d">${clock(secs.slice(0, i).reduce((a, b) => a + b, 0))}</span></button></li>`).join('')}</ol>
      </div>
      ${s.video ? `<p class="tut-orig" data-reveal><a href="https://www.youtube.com/watch?v=${esc(s.video)}" target="_blank" rel="noopener">Vezi și filmarea originală, pe YouTube</a></p>` : ''}`, ' tut-section');
  },

  // Lista articolelor de blog publicate, cele mai noi primele (pe pagina Blog).
  articole: (ctx, s) => {
    const posts = ctx.within(ctx.component, 'Articolele de blog', () => ctx.query('articole', {
      fields: ['title', 'slug', 'published_on', 'excerpt', 'image_id'], sort: newestFirst}));
    return wrap(s, `${rhead(ctx, s)}${posts.length ? `<div class="posts" data-stagger>${posts.map(a => postCard(ctx, a)).join('')}</div>`
      : '<p class="posts-empty" data-reveal>Primele articole apar în curând.</p>'}`);
  },

  // Îndemnul final: pe toată lățimea, cu valuri.
  cta: (ctx, s) => {
    const wave = '<svg viewBox="0 0 2400 100" preserveAspectRatio="none"><path d="M0 60C200 20 400 20 600 60S1000 100 1200 60 1600 20 1800 60 2200 100 2400 60V100H0Z"/></svg>';
    return `<section class="fx-cta on-dark" aria-labelledby="s-${s.id}"><div class="fx-waves" aria-hidden="true">${wave}${wave}${wave}</div>
      <div class="container" data-reveal>${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}<h2 id="s-${s.id}">${title(ctx, s.title)}</h2>
      ${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}${buttons(ctx, s, true)}</div></section>`;
  },

  // Trimiterea testului rapid: datele de contact, fotografia benzii, apoi rezultatul. Totul se petrece în browser (site.js),
  // direct cu serviciul de analiză al aplicației vechi (testrapid.mjs), deci merge și pe site-ul static.
  // Pașii secțiunii sunt instrucțiunile pentru fotografie; nota e avertismentul despre cât de precis e testul.
  'trimite-test': (ctx, s) => {
    const tips = ctx.within(ctx.component, 'Instrucțiunile pentru fotografie', () => ctx.related('sectiuni', s.id, 'steps'));
    const privacy = ctx.within(ctx.component, 'Politica de confidențialitate', () => ctx.query('pagini', {
      fields: ['slug', 'footer'], as: 'link', where: p => p.footer === 'legal' && /confiden/.test(p.slug ?? '')}))[0];
    const privacyHref = privacy ? ctx.within(ctx.component, 'Politica de confidențialitate', () => ctx.link(`pagini:${privacy.id}`)) : null;
    const note = s.note ? `<p class="tr-disclaimer">${icon('info')}<span>${ctx.text(s.note)}</span></p>` : '';
    const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const cam = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1.6 2.4H20a1.6 1.6 0 0 1 1.6 1.6v10.4A1.6 1.6 0 0 1 20 20H4a1.6 1.6 0 0 1-1.6-1.6V8A1.6 1.6 0 0 1 4 6.4h3.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    const gallery = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M21 15.5l-4.5-4.5L6 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    const field = (id, label, attrs, hint = '') => `<label for="tr-${id}"><span>${label} <span class="req" aria-hidden="true">*</span></span>
      <input id="tr-${id}" name="${id}" required ${attrs}>${hint ? `<small>${hint}</small>` : ''}</label>`;
    return wrap(s, `${rhead(ctx, s)}
      <div class="tr" data-testrapid data-api='${esc(JSON.stringify(ANALYSIS))}'>
        <ol class="tr-progress" aria-label="Pașii trimiterii">
          <li class="on" aria-current="step"><span>1</span>Datele tale</li><li><span>2</span>Fotografia testului</li><li><span>3</span>Rezultatul</li>
        </ol>
        <div class="tr-grid">
          <div class="tr-card" data-reveal>
            <form class="form tr-step" data-step="1" novalidate>
              <div class="tr-legend"><h3>Date de contact</h3><span>Toate câmpurile sunt obligatorii</span></div>
              ${field('name', 'Nume complet', 'autocomplete="name" placeholder="ex: Andrei Popescu"')}
              <div class="tr-row">
                ${field('email', 'Email', 'type="email" autocomplete="email" placeholder="adresa.ta@exemplu.ro"', 'Aici primești raportul complet, în PDF.')}
                ${field('phone', 'Telefon', 'type="tel" autocomplete="tel" placeholder="07xx xxx xxx"', 'Te sunăm doar dacă rezultatele au nevoie de clarificări.')}
              </div>
              ${field('location', 'Locația prelevării probei', 'autocomplete="address-level2" placeholder="ex: Brașov, jud. Brașov"')}
              <div class="tr-legend"><h3>Acorduri</h3></div>
              <label class="tr-check"><input type="checkbox" name="gdpr" required><i>${check}</i><span>Sunt de acord cu prelucrarea datelor conform ${privacyHref
                ? `<a href="${esc(privacyHref)}" target="_blank">Politicii de confidențialitate</a>` : 'Politicii de confidențialitate'}. <span class="req" aria-hidden="true">*</span></span></label>
              <label class="tr-check soft"><input type="checkbox" name="consentContact"><i>${check}</i><span>Sunt de acord să fiu contactat(ă) de experții Purapa pentru interpretarea rezultatelor și recomandări de filtrare a apei.</span></label>
              <p class="tr-fine">Nu trimitem newslettere sau mesaje comerciale nesolicitate. Te contactăm doar în legătură cu acest test de apă.</p>
              <div class="tr-actions"><button class="btn" type="submit">Continuă: încarcă fotografia${icon('arrow')}</button><span class="tr-time">Durează sub un minut</span></div>
            </form>

            <div class="tr-step" data-step="2" hidden>
              <div class="tr-legend"><h3>Fotografia testului</h3><button type="button" class="tr-back" data-back>Înapoi la date</button></div>
              <div class="tr-drop" data-drop>
                <input type="file" accept="image/jpeg,image/png,.heic,.heif" data-file hidden>
                <input type="file" accept="image/*" capture="environment" data-camera hidden>
                <div class="tr-pick">
                  <p class="tr-drop-title">Încarcă fotografia benzii, lângă scala de culori</p>
                  <div class="tr-buttons">
                    <button type="button" class="btn" data-pick="camera">${cam}Fă o poză</button>
                    <button type="button" class="btn ghost" data-pick="file">${gallery}Alege din galerie</button>
                  </div>
                  <p class="tr-formats">Sau trage fotografia aici. Formate acceptate: JPG, PNG, HEIC (nu DNG/RAW).</p>
                </div>
                <figure class="tr-preview" hidden><img alt="Fotografia aleasă"><figcaption><strong data-fname></strong><button type="button" class="tr-back" data-clear>Alege alta</button></figcaption></figure>
              </div>
              <label class="tr-optional" hidden>Observație sau etichetă (opțional) <input name="note" maxlength="100" placeholder="ex: bucătărie, baie, proba 1"></label>
              <div class="tr-actions"><button class="btn" type="button" data-send disabled>Trimite pentru analiză${icon('arrow')}</button></div>
              <div class="tr-busy" hidden role="status" aria-live="polite">
                <div class="tr-busy-drop" aria-hidden="true"><i></i><i></i><i></i></div>
                <p class="tr-busy-msg" data-msg>Se încarcă fotografia...</p>
                <ul class="tr-busy-list" aria-hidden="true">${TEST_PARAMS.map((p, i) => `<li style="--i:${i}">${esc(p.name.replace(/\s*\(.*\)$/, ''))}</li>`).join('')}</ul>
                <p class="tr-fine">Durează câteva secunde. Nu închide pagina.</p>
              </div>
            </div>

            <div class="tr-step tr-result" data-step="3" hidden tabindex="-1">
              <div class="tr-done"><span class="tr-done-icon">${check}</span><div><h3>Analiză finalizată</h3><p>Mai jos găsești interpretarea fiecărui parametru și recomandarea noastră.</p></div></div>
              <div class="tr-summary" data-summary></div>
              <div class="tr-box" data-conclusion hidden><h4>Concluzie</h4><p></p></div>
              <h4 class="tr-params-title">Parametrii analizați</h4>
              <ul class="tr-params" data-params></ul>
              <div class="tr-box accent" data-reco hidden><h4>Recomandare</h4><p></p></div>
              <div class="tr-mail">${icon('mail')}<p><strong>Raportul complet, în PDF, vine pe email.</strong> Dacă nu îl găsești în câteva minute, verifică și folderul Spam.</p></div>
              <div class="tr-actions"><button class="btn ghost" type="button" data-again>Fă un nou test</button></div>
            </div>

            <div class="tr-step tr-result" data-step="pending" hidden tabindex="-1">
              <div class="tr-done"><span class="tr-done-icon">${check}</span><div><h3>Am primit fotografia</h3><p>Analiza se face în scurt timp, iar raportul complet îl primești pe email.</p></div></div>
              <div class="tr-actions"><button class="btn ghost" type="button" data-again>Trimite alt test</button></div>
            </div>
            <div class="tr-error" role="alert" hidden></div>
            <noscript><p class="tr-error">Pentru analiza fotografiei e nevoie de JavaScript. Activează-l în browser sau scrie-ne la ${ctx.text('{email}')}.</p></noscript>
          </div>
          <aside class="tr-aside" data-reveal style="--i:1">
            ${tips.length ? `<h3>Cum faci fotografia</h3><ol class="tr-tips">${tips.map((p, i) => `<li><span>${i + 1}</span><div>${p.title ? `<strong>${ctx.text(p.title)}</strong>` : ''}${p.text ? ctx.rich(p.text) : ''}</div></li>`).join('')}</ol>` : ''}
            ${note}
          </aside>
        </div>
        <script type="application/json" data-params-info>${JSON.stringify(TEST_PARAMS).replace(/</g, '\\u003c')}</script>
      </div>`, ' tr-section');
  },

  contact: (ctx, s) => wrap(s, `${rhead(ctx, s)}<div class="contact-grid">
    <ul class="contact-data" data-stagger>
      <li data-reveal><span>Telefon</span><a href="${ctx.text('{telefon_link}')}">${ctx.text('{telefon}')}</a><br>${ctx.text('{program}')}</li>
      <li data-reveal><span>Email</span><a href="mailto:${ctx.text('{email}')}">${ctx.text('{email}')}</a><br>Răspundem în ${ctx.text('{raspuns}')}.</li>
      <li data-reveal><span>Sediu</span>${ctx.text('{adresa_completa}')}</li>
    </ul>
    <div class="contact-form">${s.note ? `<h2 data-reveal style="--i:1">${title(ctx, s.note)}</h2>` : ''}
    <form method="post" class="form" data-reveal style="--i:2" ${ctx.staticSite
      // Site static (fără server care să primească mesajul): același formular, dar la trimitere mesajul completat se deschide
      // în aplicația de email a vizitatorului (site.js îl așază frumos; fără JavaScript, browserul face același lucru, mai brut).
      ? `action="mailto:${ctx.text('{email}')}" enctype="text/plain" data-mailto="${ctx.text('{email}')}"`
      : 'action="/api/public/contact"'}>
      <label>Nume complet <input name="name" required autocomplete="name"></label>
      <label>Email <input name="email" type="email" required autocomplete="email"></label>
      <label>Telefon (opțional) <input name="phone" type="tel" autocomplete="tel"></label>
      <label>Subiect <input name="subject" required></label>
      <label>Mesaj <textarea name="message" minlength="20" required></textarea></label>
      <div><button class="btn">Trimite mesajul${icon('arrow')}</button></div>
      ${ctx.staticSite ? '<p class="form-note" role="status" hidden>Mesajul tău s-a deschis în aplicația de email. Apasă „Trimite” acolo și îl primim.</p>' : ''}
    </form></div></div>`)
};

function renderSection(ctx, s, i) {
  const fn = SECTIONS[s.kind];
  if (!fn) throw new Error(`Tip de secțiune necunoscut: ${s.kind}`);
  const html = ctx.within(`Secțiunea «${plainTitle(s.title) || s.kind}»`, 'Conținutul secțiunii', () => fn(ctx, s, i));
  // Prima secțiune a unei pagini fără hero ține loc de început de pagină: fundalul lui și titlul care urcă pe cuvinte.
  return i === 0 && s.kind !== 'hero' ? html.replace('<section class="section', '<section class="section fx-top').replace('<h2 id="s-', '<h2 data-split id="s-') : html;
}

function logo(ctx, f) {
  const m = f?.logo_id ? ctx.within(ctx.component, 'Logo-ul', () => ctx.media(f.logo_id)) : null;
  if (!m) return `<span class="word">${esc(f?.brand)}</span>`;
  // Varianta micșorată (npm run bake:images), dacă există: logo-ul apare la ~40 px înălțime, nu are nevoie de originalul mare.
  const small = baked(/\/media\/([^?]+)/.exec(m.src)?.[1] ?? '', 'w160');
  const h = m.width ? Math.round(m.height * 160 / m.width) : 0;
  return small ? `<img src="${small}" alt="${esc(f.brand)}"${h ? ` width="160" height="${h}"` : ''}>`
    : `<img src="${esc(m.src)}" alt="${esc(f.brand)}"${m.width ? ` width="${m.width}" height="${m.height}"` : ''}>`;
}

function header(ctx, path) {
  return ctx.layout('Antet', () => {
    const f = ctx.within('Antet', 'Brandul', () => ctx.one('firma'));
    const menu = ctx.within('Antet', 'Meniul principal', () => ctx.query('pagini', {
      fields: ['menu_order', 'menu_style'], as: 'link', where: p => p.menu_order != null, sort: (a, b) => a.menu_order - b.menu_order}));
    // Vânzarea e la retailer: butonul spune unde duce („Comandă pe Portalia”): comanda se face acolo, nu pe site.
    const shop = ctx.within('Antet', 'Butonul spre retailer', () => ctx.query('retaileri', {fields: ['search_url', 'name']}))[0];
    const cta = shop?.search_url ? (cls) => `<a class="btn small ${cls}" href="${esc(shop.search_url)}" target="_blank" rel="noopener">Comandă pe ${esc(shop.name)}${icon('external')}<span class="sr-only"> (se deschide într-o fereastră nouă)</span></a>` : () => '';
    const link = (p, cls = '') => {
      const href = ctx.within('Antet', 'Meniul principal', () => ctx.link(`pagini:${p.id}`));
      return href ? `<a${cls ? ` class="${cls}"` : ''} href="${esc(href)}"${href === path ? ' aria-current="page"' : ''}>${esc(p.menu_label || p.title)}</a>` : '';
    };
    // Paginile cu aspect „buton” stau lângă butonul spre retailer, ca buton cu contur (pe mobil, în meniu, deasupra lui).
    const links = menu.filter(p => p.menu_style !== 'buton').map(p => link(p)).join('');
    const extra = cls => menu.filter(p => p.menu_style === 'buton').map(p => link(p, `btn small ghost ${cls}`)).join('');
    return `<header class="site-header"><div class="container bar">
      <a class="logo" href="/" aria-label="${esc(f?.brand)} — prima pagină">${logo(ctx, f)}</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Deschide meniul">${icon('menu', 'i-menu')}${icon('close', 'i-close')}</button>
      <nav class="nav" id="nav" aria-label="Meniul principal">${links}${extra('')}${cta('')}</nav>${extra('header-cta')}${cta('header-cta')}
    </div></header>`;
  });
}

function footer(ctx) {
  return ctx.layout('Subsol', () => {
    const f = ctx.within('Subsol', 'Datele firmei', () => ctx.one('firma')) ?? {};
    const socials = ctx.within('Subsol', 'Rețelele sociale', () => ctx.query('retele', {
      fields: ['platform', 'url', 'position'], sort: (a, b) => (a.position ?? 0) - (b.position ?? 0)}));
    const pages = ctx.within('Subsol', 'Linkurile din subsol', () => ctx.query('pagini', {
      fields: ['footer', 'menu_order'], as: 'link', where: p => !!p.footer, sort: (a, b) => (a.menu_order ?? 99) - (b.menu_order ?? 99)}));
    const links = group => pages.filter(p => p.footer === group).map(p => {
      const href = ctx.within('Subsol', 'Linkurile din subsol', () => ctx.link(`pagini:${p.id}`));
      return href ? `<li><a href="${esc(href)}">${esc(p.menu_label || p.title)}</a></li>` : '';
    }).join('');
    return ctx.within('Subsol', 'Datele de contact', () => `<footer class="site-footer"><div class="container">
      <div class="cols">
        <div class="about"><a class="logo" href="/" aria-label="${esc(f.brand)} — prima pagină">${logo(ctx, f)}</a><p>${ctx.text(f.tagline)}</p>
          ${socials.length ? `<div class="socials">${socials.map(s => `<a href="${esc(s.url)}" rel="noopener" target="_blank" aria-label="${esc(s.platform)} (se deschide într-o fereastră nouă)">${icon(s.platform.toLowerCase())}</a>`).join('')}</div>` : ''}</div>
        <nav aria-labelledby="f-company"><h2 id="f-company">Companie</h2><ul>${links('firma')}</ul></nav>
        <div><h2>Relații clienți</h2><ul>
          <li><a href="${ctx.text('{telefon_link}')}">${ctx.text('{telefon}')}</a></li>
          <li><a href="mailto:${ctx.text('{email}')}">${ctx.text('{email}')}</a></li>
          <li>${ctx.text('{program}')}</li><li>${ctx.text('{adresa}')}</li></ul></div>
        <nav aria-labelledby="f-legal"><h2 id="f-legal">Legal</h2><ul>${links('legal')}</ul></nav>
      </div>
      <div class="legal"><span>${esc(f.brand)} este o marcă ${esc(f.legal_name)}</span><span>CUI ${esc(f.cui)} · ${esc(f.reg_com)}</span></div>
    </div></footer>`);
  });
}

function shell(ctx, {path, title: pageTitle, description}, body) {
  const brand = ctx.within('Cap de pagină', 'Brandul în titlu', () => ctx.one('firma')?.brand ?? '');
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plainTitle(pageTitle))}${brand ? ` | ${esc(brand)}` : ''}</title>${description ? `<meta name="description" content="${esc(description)}">` : ''}
${!indexable() ? '<meta name="robots" content="noindex, nofollow">' : path ? `<link rel="canonical" href="${SITE_URL}${esc(path)}">` : ''}<meta name="theme-color" content="#254a99">
<link rel="preload" href="/assets/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}">
<script>document.documentElement.classList.add('fx-js');setTimeout(function(){if(!window.__fx)document.documentElement.classList.add('fx-still')},4000)</script>
<script src="/assets/site.js?v=${ASSET_V}" defer></script></head>
<body><a class="skip" href="#continut">Sari la conținut</a><div class="fx-progress" aria-hidden="true"></div>${ctx.preview ? '<div class="preview-bar">Previzualizare — conținut nepublicat</div>' : ''}
${header(ctx, path)}<main id="continut" tabindex="-1">${body}</main>${footer(ctx)}</body></html>`;
}

// Cardul unui articol în lista blogului: imaginea, data, titlul și rezumatul, tot cardul e linkul.
function postCard(ctx, a) {
  const date = postDate(a.published_on);
  return `<article class="post-card" data-reveal data-spot><a href="${esc(publicPath(byKey.articole, a))}">
    ${a.image_id ? `<div class="media">${image(ctx, a.image_id, {sizes: '(max-width: 700px) 92vw, 360px'})}</div>` : ''}
    <div class="body">${date ? `<p class="meta"><time datetime="${esc(a.published_on)}">${date}</time></p>` : ''}<h3>${esc(a.title)}</h3>
      ${a.excerpt ? `<p>${ctx.text(a.excerpt)}</p>` : ''}<span class="more">Citește articolul${icon('arrow')}</span></div></a></article>`;
}

// Pagina unui articol: titlul, data și autorul, imaginea, conținutul, întrebările frecvente, produsele recomandate,
// articolele recomandate și trimiterea spre testarea apei. Datele structurate (Article, FAQPage) ajută căutarea.
function renderArticle(ctx, store, path, found) {
  const a = ctx.page('articole', found.id);
  const blog = ctx.within('Articol', 'Pagina blogului', () => ctx.bySlug('pagini', 'blog'));
  const testing = ctx.within('Articol', 'Trimiterea spre testare', () => ctx.bySlug('pagini', 'testare-apa'));
  const faqs = ctx.within('Articol', 'Întrebările articolului', () => ctx.related('articole', a.id, 'faqs'));
  const products = ctx.within('Articol', 'Produsele recomandate', () => ctx.related('articole', a.id, 'products'));
  const related = ctx.within('Articol', 'Articolele recomandate', () => ctx.related('articole', a.id, 'related'));
  const retailers = products.length ? ctx.within('Articol', 'Retailerul produselor', () => ctx.query('retaileri', {fields: ['name']})) : [];
  const retailerOf = p => retailers.find(r => r.id === p.retailer_id) ?? (retailers.length === 1 ? retailers[0] : null);
  const date = postDate(a.published_on);
  const cover = ctx.within('Articol', 'Imaginea articolului', () => ctx.media(a.image_id));
  const plain = html => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const ld = [{'@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.seo_description || a.excerpt || undefined,
    datePublished: a.published_on || undefined, author: a.author ? {'@type': 'Person', name: a.author} : undefined,
    image: cover ? `${SITE_URL}${cover.src}` : undefined, mainEntityOfPage: `${SITE_URL}${path}`},
  ...(faqs.length ? [{'@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(q => ({'@type': 'Question', name: q.question,
    acceptedAnswer: {'@type': 'Answer', text: plain(ctx.rich(q.answer))}}))}] : [])];
  const body = `<article class="section fx-top post" aria-labelledby="post-title"><div class="container">
    <header class="post-head">${blog ? `<nav class="crumbs" aria-label="Unde ești"><a href="/blog/">Blog</a></nav>` : ''}
      <h1 id="post-title" data-split>${esc(a.title)}</h1>
      ${date || a.author ? `<p class="meta">${date ? `<time datetime="${esc(a.published_on)}">${date}</time>` : ''}${date && a.author ? ' · ' : ''}${a.author ? esc(a.author) : ''}</p>` : ''}
      ${a.excerpt ? `<p class="lead">${ctx.text(a.excerpt)}</p>` : ''}</header>
    ${cover ? `<figure class="post-cover">${image(ctx, a.image_id, {eager: true, sizes: '(max-width: 820px) 92vw, 760px'})}</figure>` : ''}
    <div class="prose post-body">${ctx.rich(a.body)}</div>
    ${faqs.length ? `<section class="post-faq" aria-labelledby="post-faq"><h2 id="post-faq">Întrebări frecvente</h2><div class="accordion">${faqs.map(q =>
      `<details><summary>${ctx.text(q.question)}<span class="plus" aria-hidden="true"></span></summary><div class="answer">${ctx.rich(q.answer)}</div></details>`).join('')}</div></section>` : ''}
    ${testing ? `<aside class="post-cta"><span class="icon">${icon('shield')}</span><div><h2>Află ce ai în apă</h2>
      <p>Testul rapid Purapa verifică 16 parametri acasă, în câteva minute, și îți spune ce soluție se potrivește apei tale.</p>
      <a class="btn" href="/testare-apa/">Vezi cum testezi apa${icon('arrow')}</a></div></aside>` : ''}
  </div></article>
  ${products.length ? `<section class="section deschis" aria-labelledby="post-products"><div class="container"><div class="head"><h2 id="post-products">Produse recomandate</h2></div>
    <div class="products" data-stagger>${products.map(p => productCard(ctx, p, [], retailerOf(p))).join('')}</div></div></section>` : ''}
  ${related.length ? `<section class="section" aria-labelledby="post-related"><div class="container"><div class="head"><h2 id="post-related">Citește și</h2></div>
    <div class="posts" data-stagger>${related.map(r => postCard(ctx, r)).join('')}</div></div></section>` : ''}
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  return {status: 200, title: a.title, owner: ['articole', a.id],
    html: shell(ctx, {path, title: a.seo_title || a.title, description: a.seo_description || a.excerpt}, body)};
}

export function renderPath(ctx, store, path) {
  const article = !findPage(store, path, ctx.preview) && findArticle(store, path, ctx.preview);
  if (article) return renderArticle(ctx, store, path, article);
  const found = findPage(store, path, ctx.preview);
  if (!found) {
    return {status: 404, title: 'Pagina nu există',
      html: shell(ctx, {title: 'Pagina nu există'}, `<section class="section fx-top fx-404"><div class="container prose"><p class="fx-404-n" aria-hidden="true">404</p><p class="eyebrow">Eroare 404</p><h1 data-split>Pagina nu există</h1>
        <p class="lead">Poate a fost mutată. Te ajutăm de pe prima pagină.</p><div class="actions" style="margin-top:2rem"><a class="btn" href="/">Înapoi la prima pagină</a></div></div></section>`)};
  }
  const page = ctx.page('pagini', found.id);
  const sections = ctx.within('Conținutul paginii', 'Secțiunile paginii', () => ctx.related('pagini', page.id, 'sections'));
  const body = sections.map((s, i) => renderSection(ctx, s, i)).join('\n');
  return {status: 200, title: page.title, owner: ['pagini', page.id],
    html: shell(ctx, {path, title: page.seo_title || page.title, description: page.seo_description}, body)};
}

export const ASSET_VERSION = ASSET_V;

