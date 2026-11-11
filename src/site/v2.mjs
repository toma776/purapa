// /v2/: prima pagină în a doua variantă de design. Aceleași secțiuni și aceleași date din Brain ca la „/”,
// doar punerea în scenă e alta (picătura 3D, drumul apei la derulare, banda de test). Aspectul: assets/v2.css și v2.js,
// încărcate peste site.css și site.js. E o propunere de design, deci nu se indexează niciodată.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {esc} from '../core/content.mjs';
import {icon} from './icons.mjs';
import {SECTIONS, parts, ASSET_VERSION} from './render.mjs';

const {header, footer, head, wrap, button, buttons, image, priceBlock, title, plainTitle, productFacts, findPage, num, microns} = parts;

const ASSETS = new URL('./assets/', import.meta.url);
const V2_V = createHash('sha1').update(readFileSync(new URL('v2.css', ASSETS))).update(readFileSync(new URL('v2.js', ASSETS))).digest('hex').slice(0, 10);

// Culorile padurilor de pe banda de test (decorative).
const PADS = ['#f6d76b', '#f2b65c', '#ee8f6b', '#e86f8a', '#d96bb0', '#b56fd0', '#8b78dd', '#6b8fe6', '#58a9e8', '#4fc3e0', '#4fd0bf', '#62d39a', '#8fd67a', '#bfd866', '#e3d062', '#f0c36a'];

const ripples = '<span class="v2-ripples" aria-hidden="true"><i></i><i></i><i></i></span>';
const revealHead = html => html.replace('class="head', 'data-reveal class="head');
// Secțiunile fără variantă proprie rămân cele de pe site, doar că apar la derulare.
const fallback = (ctx, s, i) => SECTIONS[s.kind](ctx, s, i).replace('<div class="container">', '<div class="container" data-reveal>');

const V2 = {
  hero: (ctx, s) => {
    const product = ctx.within(ctx.component, 'Produsul din hero', () => ctx.related('sectiuni', s.id, 'products'))[0];
    const facts = s.facts ? String(s.facts).split('\n').map(l => l.split('|').map(x => x.trim())).filter(([v]) => v).map(([v, l = '']) => ({value: ctx.text(v), label: ctx.text(l)}))
      : product ? productFacts(ctx, product).map(f => ({value: esc(f.value), label: esc(f.label)})) : [];
    const visual = image(ctx, s.image_id ?? product?.image_id, {eager: true, sizes: '(max-width: 880px) 60vw, 380px'});
    return `<section class="v2-hero${visual ? '' : ' solo'}" aria-labelledby="s-${s.id}" data-zone><div class="container v2-hero-grid">
      <div class="copy">${s.kicker ? `<p class="eyebrow" data-reveal>${ctx.text(s.kicker)}</p>` : ''}
        <h1 id="s-${s.id}" data-split>${title(ctx, s.title)}</h1>
        ${s.text ? `<div class="lead" data-reveal style="--i:3">${ctx.rich(s.text)}</div>` : ''}
        ${buttons(ctx, s).replace('class="actions"', 'class="actions" data-reveal style="--i:4"')}
        ${facts.length ? `<ul class="facts" aria-label="Pe scurt" data-reveal style="--i:5">${facts.map(f => `<li><strong data-count>${f.value}</strong><span>${f.label}</span></li>`).join('')}</ul>` : ''}
      </div>
      ${visual ? `<div class="v2-stage">
        <canvas class="v2-drop" aria-hidden="true"></canvas>
        <div class="v2-product"><div class="v2-float">${visual}</div></div>
        ${product?.price != null ? `<div class="v2-chip v2-chip-price"><span class="label">Preț</span>${priceBlock(product, {cls: 'pc-price'})}
          ${product.availability ? `<span class="stock">${esc(product.availability)}</span>` : ''}</div>` : ''}
      </div>` : ''}
    </div></section>`;
  },

  beneficii: (ctx, s) => {
    const items = ctx.within(ctx.component, 'Beneficiile secțiunii', () => ctx.related('sectiuni', s.id, 'benefits'));
    // Cu imagine: secțiunea de impact, pe culoarea imaginii, ca picătura să plutească fără ramă.
    if (s.image_id) {
      return `<section class="section v2-impact" aria-labelledby="s-${s.id}"><div class="container v2-impact-grid">
        <div class="v2-impact-media" data-reveal><div class="v2-float">${image(ctx, s.image_id, {sizes: '(max-width: 880px) 80vw, 520px'})}</div></div>
        <div>${revealHead(head(ctx, s))}
          <ul class="v2-impact-list" data-stagger>${items.map(b => `<li data-reveal><span class="icon">${icon(b.icon)}</span><div><h3>${ctx.text(b.title)}</h3><p>${ctx.text(b.text)}</p></div></li>`).join('')}</ul>
          ${buttons(ctx, s)}</div></div></section>`;
    }
    return wrap(s, `${revealHead(head(ctx, s, {center: true}))}<div class="v2-cards" data-stagger>${items.map((b, k) =>
      `<article class="v2-card" data-reveal data-spot><span class="n" aria-hidden="true">${String(k + 1).padStart(2, '0')}</span><span class="icon">${icon(b.icon)}</span>
        <h3>${ctx.text(b.title)}</h3><p>${ctx.text(b.text)}</p></article>`).join('')}</div>
      ${s.cta_label ? `<div class="actions v2-center" data-reveal>${button(ctx, s.cta_label, s.cta_link, 'btn ghost')}</div>` : ''}`);
  },

  produse: (ctx, s, i) => {
    const items = !s.category_id && ctx.hasLinks('sectiuni', s.id, 'products')
      ? ctx.within(ctx.component, 'Produsele alese în secțiune', () => ctx.related('sectiuni', s.id, 'products')) : [];
    if (items.length !== 1) return fallback(ctx, s, i);
    const p = items[0];
    const cartridges = ctx.within(ctx.component, 'Cartușele produsului', () => ctx.related('produse', p.id, 'cartridges'));
    const stages = ctx.within(ctx.component, 'Etapele produsului', () => ctx.related('produse', p.id, 'stages'));
    const retailer = ctx.within(ctx.component, 'Retailerul produsului', () => ctx.get('retaileri', p.retailer_id));
    const ticks = [
      p.capacity_l && `Capacitate de <strong>${num(p.capacity_l)} L</strong>${p.lifetime_months ? `, până la ${p.lifetime_months} luni de folosire` : ''}`,
      stages.length && `Filtrare în ${stages.length} etape: ${stages.map(e => `${esc(e.name.toLowerCase())} ${microns(e.microns)}`).join(', ')}`,
      cartridges.length && `Cartușe de schimb: ${cartridges.map(c => esc(c.name.replace(/,? Purapa.*$/, ''))).join(' și ')}`,
      p.availability && `${esc(p.availability[0].toUpperCase() + p.availability.slice(1))}${retailer ? `, livrare prin ${esc(retailer.name)}` : ''}`
    ].filter(Boolean);
    return wrap(s, `${revealHead(head(ctx, s, {center: true}))}<article class="v2-kit" aria-labelledby="p-${p.id}">
      <div class="v2-kit-stage" data-zone>${ripples}${p.list_price > p.price ? '<span class="badge">Ofertă</span>' : ''}
        <div class="v2-tilt" data-reveal><div class="v2-float">${image(ctx, p.image_id, {sizes: '(max-width: 880px) 80vw, 440px'})}</div></div></div>
      <div class="v2-kit-body" data-reveal><h3 id="p-${p.id}">${esc(p.name)}</h3>${p.summary ? `<p class="summary">${ctx.text(p.summary)}</p>` : ''}${priceBlock(p)}
        <ul class="ticks" data-stagger>${ticks.map(t => `<li data-reveal>${icon('check')}<span>${t}</span></li>`).join('')}</ul>
        <div class="actions">${p.buy_url ? `<a class="btn" href="${esc(p.buy_url)}" target="_blank" rel="noopener">Cumpără${retailer ? ` de la ${esc(retailer.name)}` : ''}${icon('external')}<span class="sr-only"> (se deschide într-o fereastră nouă)</span></a>` : ''}
          ${button(ctx, s.cta_label, s.cta_link, 'btn ghost')}</div>
        ${retailer ? `<p class="note">Comanda, plata și livrarea se fac prin ${esc(retailer.name)}, partenerul nostru autorizat.</p>` : ''}</div>
    </article>`);
  },

  // Parametrii testului ca o bandă de testare: fiecare pad e un parametru, iar sub bandă apare ce indică.
  test: (ctx, s, i) => {
    if (!s.image_id) return fallback(ctx, s, i);
    const params = ctx.within(ctx.component, 'Parametrii testului', () => ctx.related('sectiuni', s.id, 'parameters'));
    const count = ctx.text('{nr_parametri}');
    const label = p => `${esc(p.name)}${p.symbol && !p.name.includes(p.symbol) ? ` (${esc(p.symbol)})` : ''}`;
    return wrap(s, `<div class="v2-test"><div class="v2-test-stage" data-zone>${ripples}
        <div class="v2-tilt" data-reveal><div class="v2-float">${image(ctx, s.image_id, {sizes: '(max-width: 880px) 80vw, 480px'})}</div></div>
        ${/^\d+$/.test(count) ? `<p class="v2-stat" data-reveal><strong data-count>${count}</strong><span>parametri analizați</span></p>` : ''}</div>
      <div>${revealHead(head(ctx, s))}
        ${params.length ? `<div class="v2-strip-wrap" data-reveal><ol class="v2-strip" aria-label="Parametrii testului">${params.map((p, k) =>
          `<li style="--c:${PADS[k % PADS.length]};--i:${k}"><button type="button"${k === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"'} data-name="${label(p)}" data-info="${p.indicates ? ctx.text(p.indicates) : ''}"><span class="sr-only">${label(p)}</span></button></li>`).join('')}</ol>
          <p class="v2-strip-out" aria-live="polite"><strong>${label(params[0])}</strong><span>${params[0].indicates ? ctx.text(params[0].indicates) : ''}</span></p></div>` : ''}
        ${buttons(ctx, s).replace('class="actions"', 'class="actions" data-reveal')}</div></div>`);
  },

  // Drumul apei: scena rămâne pe loc cât derulezi, iar particulele se opresc pe rând la fiecare etapă.
  // Fără JavaScript sau cu mișcarea redusă, etapele sunt o listă obișnuită.
  tehnologie: (ctx, s) => {
    const stages = ctx.within(ctx.component, 'Etapele filtrării', () => ctx.related('sectiuni', s.id, 'stages'));
    const steps = stages.length + (s.text ? 1 : 0);
    return `<section class="v2-flow on-dark" aria-labelledby="s-${s.id}" data-flow='${esc(JSON.stringify({stages: stages.length}))}' style="--steps:${steps}"><div class="v2-flow-pin">
      <div class="container">${head(ctx, {...s, text: null}, {center: true})}</div>
      <div class="v2-flow-band" aria-hidden="true"><canvas></canvas>
        <span class="v2-flow-tag start">${icon('tap')}Apa de la robinet</span>
        ${stages.map((e, k) => `<span class="v2-flow-gate" style="--x:${((k + 1) / (stages.length + 1) * 100).toFixed(2)}%">${e.microns != null ? microns(e.microns) : k + 1}</span>`).join('')}
        <span class="v2-flow-tag end">${icon('glass')}Apă bună de băut</span></div>
      <div class="container"><ol class="v2-flow-steps">
        ${stages.map((e, k) => `<li${k === 0 ? ' class="is-on"' : ''}><span class="n" aria-hidden="true">${k + 1}</span><div>
          <h3><span class="sr-only">Etapa ${k + 1}: </span>${esc(e.name)}${e.microns != null ? ` <em>${microns(e.microns)}</em>` : ''}</h3>
          ${e.retains ? `<p class="retains">Reține: ${esc(e.retains)}</p>` : ''}${e.text ? `<div class="text">${ctx.rich(e.text)}</div>` : ''}</div></li>`).join('')}
        ${s.text ? `<li class="result"><span class="n" aria-hidden="true">${icon('glass')}</span><div><h3>Apă bună de băut</h3><div class="text">${ctx.rich(s.text)}</div></div></li>` : ''}
      </ol><div class="v2-flow-rail" aria-hidden="true"><i></i></div></div>
    </div></section>`;
  },

  cta: (ctx, s) => {
    const wave = '<svg viewBox="0 0 2400 100" preserveAspectRatio="none"><path d="M0 60C200 20 400 20 600 60S1000 100 1200 60 1600 20 1800 60 2200 100 2400 60V100H0Z"/></svg>';
    return `<section class="v2-cta on-dark" aria-labelledby="s-${s.id}"><div class="v2-waves" aria-hidden="true">${wave}${wave}${wave}</div>
      <div class="container" data-reveal>${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}<h2 id="s-${s.id}">${title(ctx, s.title)}</h2>
      ${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}${buttons(ctx, s, true)}</div></section>`;
  }
};

function shell(ctx, {title: pageTitle, description}, body) {
  const brand = ctx.within('Cap de pagină', 'Brandul în titlu', () => ctx.one('firma')?.brand ?? '');
  // Clasa `v2-js` ascunde ce apare la derulare; dacă scriptul nu pornește în 4 secunde, `v2-still` arată tot.
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plainTitle(pageTitle))}${brand ? ` | ${esc(brand)}` : ''}</title>${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#254a99">
<link rel="preload" href="/assets/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_VERSION}"><link rel="stylesheet" href="/assets/v2.css?v=${V2_V}">
<script>document.documentElement.classList.add('v2-js');setTimeout(function(){if(!window.__v2)document.documentElement.classList.add('v2-still')},4000)</script>
<script src="/assets/site.js?v=${ASSET_VERSION}" defer></script><script src="/assets/v2.js?v=${V2_V}" defer></script></head>
<body class="v2"><a class="skip" href="#continut">Sari la conținut</a><div class="v2-progress" aria-hidden="true"></div>${ctx.preview ? '<div class="preview-bar">Previzualizare — conținut nepublicat</div>' : ''}
${header(ctx, '/')}<main id="continut" tabindex="-1">${body}</main>${footer(ctx)}</body></html>`;
}

export const V2_PATH = '/v2/';

export function renderV2(ctx, store) {
  const found = findPage(store, '/', ctx.preview);
  if (!found) return null;
  const page = ctx.page('pagini', found.id);
  const sections = ctx.within('Conținutul paginii', 'Secțiunile paginii', () => ctx.related('pagini', page.id, 'sections'));
  const body = sections.map((s, i) => ctx.within(`Secțiunea «${plainTitle(s.title) || s.kind}»`, 'Conținutul secțiunii',
    () => (i === 0 || s.kind !== 'hero') && V2[s.kind] ? V2[s.kind](ctx, s, i) : fallback(ctx, s, i))).join('\n');
  return {status: 200, title: page.title, html: shell(ctx, {title: page.seo_title || page.title, description: page.seo_description}, body)};
}
