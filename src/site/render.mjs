// Site-ul public, randat din Brain prin contextul urmărit. Fiecare citire are o componentă și un motiv (§3.2).
// Aspectul: src/site/assets/site.css. Aici e doar structura (semantică, accesibilă) și datele.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {esc} from '../core/content.mjs';
import {byKey, publicPath} from '../registry/entities.mjs';
import {icon} from './icons.mjs';

const ASSETS = new URL('./assets/', import.meta.url);
const ASSET_V = createHash('sha1').update(readFileSync(new URL('site.css', ASSETS))).update(readFileSync(new URL('site.js', ASSETS))).digest('hex').slice(0, 10);
const SITE_URL = (process.env.SITE_URL ?? 'https://purapa.ro').replace(/\/$/, '');

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
  return store.list('pagini').filter(p => p.status === 'published').map(p => publicPath(byKey.pagini, p)).filter(Boolean);
}

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

const SECTIONS = {
  hero: (ctx, s, i) => {
    const product = ctx.within(ctx.component, 'Produsul din hero', () => ctx.related('sectiuni', s.id, 'products'))[0];
    const facts = product ? productFacts(ctx, product) : [];
    const visual = image(ctx, s.image_id ?? product?.image_id, {eager: true, sizes: '(max-width: 880px) 92vw, 480px'});
    return `<section class="hero" aria-labelledby="s-${s.id}"><div class="container grid">
      <div class="copy">${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}
        <${i === 0 ? 'h1' : 'h2'} id="s-${s.id}">${title(ctx, s.title)}</${i === 0 ? 'h1' : 'h2'}>
        ${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}${buttons(ctx, s)}
        ${facts.length ? `<ul class="facts" aria-label="Pe scurt">${facts.map(f => `<li><strong>${esc(f.value)}</strong><span>${esc(f.label)}</span></li>`).join('')}</ul>` : ''}
      </div>
      ${visual ? `<div class="visual"><div class="frame">${visual}</div>${product?.price != null ? `<div class="price-card">
        <span class="label">Preț</span>${priceBlock(product, {cls: 'pc-price'})}
        ${product.availability ? `<span class="stock">${esc(product.availability)}</span>` : ''}</div>` : ''}</div>` : ''}
    </div></section>`;
  },

  beneficii: (ctx, s) => {
    const items = ctx.within(ctx.component, 'Beneficiile secțiunii', () => ctx.related('sectiuni', s.id, 'benefits'));
    if (s.theme === 'inchis' && s.image_id) {
      return wrap(s, `<div class="split reverse"><div class="media">${image(ctx, s.image_id, {sizes: '(max-width: 880px) 92vw, 520px'})}</div>
        <div>${head(ctx, s).replace('class="head"', 'class="head" style="margin-bottom:0"')}
        <ul class="impact-list">${items.map(b => `<li><span class="icon">${icon(b.icon)}</span><div><h3>${ctx.text(b.title)}</h3><p>${ctx.text(b.text)}</p></div></li>`).join('')}</ul>
        ${buttons(ctx, s, true)}</div></div>`, ' on-dark');
    }
    return wrap(s, `${head(ctx, s, {center: true})}<div class="cards">${items.map(b =>
      `<article class="card"><span class="icon">${icon(b.icon)}</span><h3>${ctx.text(b.title)}</h3><p>${ctx.text(b.text)}</p></article>`).join('')}</div>
      ${buttons(ctx, s) ? `<div class="actions" style="justify-content:center;margin-top:2.5rem">${button(ctx, s.cta_label, s.cta_link, 'btn ghost')}</div>` : ''}`);
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
        fields: ['name', 'summary', 'price', 'list_price', 'availability', 'image_id', 'buy_url', 'position'], sort: (a, b) => (a.position ?? 0) - (b.position ?? 0)}));
    }
    // Un singur produs ales: vitrină. Mai multe: grilă.
    if (items.length === 1 && !s.category_id) {
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
      return wrap(s, `${head(ctx, s, {center: true})}<article class="showcase" aria-labelledby="p-${p.id}">
        <div class="media">${p.list_price > p.price ? '<span class="badge">Ofertă</span>' : ''}${image(ctx, p.image_id, {sizes: '(max-width: 880px) 92vw, 380px'})}</div>
        <div class="body"><h3 id="p-${p.id}">${esc(p.name)}</h3>${p.summary ? `<p class="summary">${ctx.text(p.summary)}</p>` : ''}${priceBlock(p)}
          <ul class="ticks">${ticks.map(t => `<li>${icon('check')}<span>${t}</span></li>`).join('')}</ul>
          <div class="actions">${p.buy_url ? `<a class="btn" href="${esc(p.buy_url)}" target="_blank" rel="noopener">Cumpără${retailer ? ` de la ${esc(retailer.name)}` : ''}${icon('external')}<span class="sr-only"> (se deschide într-o fereastră nouă)</span></a>` : ''}
            ${button(ctx, s.cta_label, s.cta_link, 'btn ghost')}</div>
          ${retailer ? `<p class="note">Comanda, plata și livrarea se fac prin ${esc(retailer.name)}, partenerul nostru autorizat.</p>` : ''}</div>
      </article>`);
    }
    return wrap(s, `${head(ctx, s)}<div class="products">${items.map(p => `<article class="product" aria-labelledby="p-${p.id}">
      <div class="media">${image(ctx, p.image_id, {sizes: '(max-width: 600px) 92vw, 280px'})}</div>
      <div class="body"><h3 id="p-${p.id}">${esc(p.name)}</h3>${p.summary ? `<p>${ctx.text(p.summary)}</p>` : ''}${priceBlock(p)}
        ${p.buy_url ? `<a class="btn small" href="${esc(p.buy_url)}" target="_blank" rel="noopener">Cumpără${icon('external')}<span class="sr-only"> ${esc(p.name)} (se deschide într-o fereastră nouă)</span></a>` : ''}</div>
      </article>`).join('')}</div>${buttons(ctx, s)}`);
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
    return wrap(s, `<div class="calc-grid"><div>${head(ctx, s).replace('class="head"', 'class="head" style="margin-bottom:0"')}
      <details class="assumptions"><summary>Cum calculăm</summary><ul>
        <li>Consum: ${num(p.litri_persoana_zi)} L de apă de băut pe persoană pe zi, adică ${num(p.litri_persoana_zi * 30)} L pe lună.</li>
        ${parts.length ? `<li>Cartușele kitului: ${parts.map(c => `${esc(c.name)}, ${lei(c.price)} la ${c.months} ${c.months === 1 ? 'lună' : 'luni'}`).join('; ')}. În total ${lei(Math.round(yearly))} pe an, la prețurile actuale.</li>` : ''}
        ${kit?.price != null ? `<li>Kitul costă ${lei(kit.price)}, plătit o singură dată; din el se calculează amortizarea.</li>` : ''}
        <li>Sticlele PET sunt socotite de ${num(p.sticla_l)} L.</li></ul></details></div>
      <form class="calc" data-calc='${esc(JSON.stringify(data))}' aria-labelledby="calc-${s.id}" onsubmit="return false">
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
    const shown = params.slice(0, 9);
    if (!s.image_id) {
      return wrap(s, `${head(ctx, s)}${params.length ? `<ol class="params">${params.map(p =>
        `<li><strong>${esc(p.name)}${p.symbol ? ` (${esc(p.symbol)})` : ''}</strong>${p.indicates ? ` — ${ctx.text(p.indicates)}` : ''}</li>`).join('')}</ol>` : ''}${buttons(ctx, s)}`);
    }
    const count = ctx.text('{nr_parametri}');
    return wrap(s, `<div class="split"><div class="media">${image(ctx, s.image_id, {sizes: '(max-width: 880px) 92vw, 520px'})}
      ${/^\d+$/.test(count) ? `<p class="stat-badge"><span><strong>${count}</strong>parametri analizați</span></p>` : ''}</div>
      <div>${head(ctx, s).replace('class="head"', 'class="head" style="margin-bottom:0"')}
      ${shown.length ? `<ul class="chips" aria-label="Câțiva dintre parametri">${shown.map(p => `<li>${esc(p.name)}</li>`).join('')}${params.length > shown.length
        ? `<li class="more">și încă ${params.length - shown.length}</li>` : ''}</ul>` : ''}${buttons(ctx, s)}</div></div>`);
  },

  tehnologie: (ctx, s) => {
    const stages = ctx.within(ctx.component, 'Etapele filtrării', () => ctx.related('sectiuni', s.id, 'stages'));
    const intro = {...s, text: null};
    return wrap(s, `${head(ctx, intro, {center: true})}<ol class="flow">
      <li class="end"><span class="icon">${icon('tap')}</span>Apa de la robinet</li>
      ${stages.map((e, i) => `<li class="stage"><div class="num"><span aria-hidden="true">${i + 1}</span>${e.microns != null ? `<strong>${microns(e.microns)}</strong>` : ''}</div>
        <h3><span class="sr-only">Etapa ${i + 1}: </span>${esc(e.name)}</h3>${e.retains ? `<p class="retains">Reține: ${esc(e.retains)}</p>` : ''}
        ${e.text ? `<div class="text">${ctx.rich(e.text)}</div>` : ''}</li>`).join('')}
      <li class="end"><span class="icon">${icon('glass')}</span>Apă bună de băut</li></ol>
      ${s.text ? `<div class="flow-note">${ctx.rich(s.text)}</div>` : ''}`);
  },

  pasi: (ctx, s) => {
    const steps = ctx.within(ctx.component, 'Pașii secțiunii', () => ctx.related('sectiuni', s.id, 'steps'));
    return wrap(s, `${head(ctx, s)}<ol class="steps">${steps.map(p => `<li><h3>${ctx.text(p.title)}</h3>${ctx.rich(p.text ?? '')}</li>`).join('')}</ol>
      ${buttons(ctx, s) ? `<div style="margin-top:2rem">${buttons(ctx, s)}</div>` : ''}`);
  },

  intrebari: (ctx, s) => {
    const faqs = ctx.within(ctx.component, 'Întrebările secțiunii', () => ctx.related('sectiuni', s.id, 'faqs'));
    return wrap(s, `<div class="faq"><div class="head">${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}
      <h2 id="s-${s.id}">${title(ctx, s.title)}</h2>${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}${buttons(ctx, s)}</div>
      <div class="accordion">${faqs.map(q => `<details><summary>${ctx.text(q.question)}<span class="plus" aria-hidden="true"></span></summary>
        <div class="answer">${ctx.rich(q.answer)}</div></details>`).join('')}</div></div>`);
  },

  // Cu video, secțiunea e o prezentare centrată (antet + video), ca pe site-ul vechi; fără, e text de citit.
  text: (ctx, s) => s.video ? wrap(s, `${head(ctx, s, {center: true})}${buttons(ctx, s)}${video(s)}`) : wrap(s, `<div class="prose">${s.kicker ? `<p class="eyebrow">${ctx.text(s.kicker)}</p>` : ''}
    ${s.title ? `<h2 id="s-${s.id}">${title(ctx, s.title)}</h2>` : ''}${s.text ? ctx.rich(s.text) : ''}${buttons(ctx, s)}</div>`),

  cta: (ctx, s) => `<section class="section" aria-labelledby="s-${s.id}"><div class="container"><div class="cta-panel on-dark">
    <div>${s.kicker ? `<p class="eyebrow" style="color:var(--sky)">${ctx.text(s.kicker)}</p>` : ''}<h2 id="s-${s.id}">${title(ctx, s.title)}</h2>
    ${s.text ? `<div class="lead">${ctx.rich(s.text)}</div>` : ''}</div>${buttons(ctx, s, true)}</div></div></section>`,

  contact: (ctx, s) => wrap(s, `${head(ctx, s)}<div class="contact-grid">
    <ul class="contact-data">
      <li><span>Telefon</span><a href="${ctx.text('{telefon_link}')}">${ctx.text('{telefon}')}</a><br>${ctx.text('{program}')}</li>
      <li><span>Email</span><a href="mailto:${ctx.text('{email}')}">${ctx.text('{email}')}</a><br>Răspundem în ${ctx.text('{raspuns}')}.</li>
      <li><span>Sediu</span>${ctx.text('{adresa_completa}')}</li>
    </ul>
    ${ctx.staticSite
      // Site static (fără server): mesajul pleacă din aplicația de email a vizitatorului, nu printr-un formular care n-ar trimite nimic.
      ? `<div class="contact-mail"><h3>Scrie-ne un mesaj</h3><p>Îți răspundem în ${ctx.text('{raspuns}')}.</p>
        <p><a class="btn" href="mailto:${ctx.text('{email}')}?subject=${encodeURIComponent('Întrebare de pe site')}">Trimite un email${icon('arrow')}</a></p></div>`
      : `<form method="post" action="/api/public/contact" class="form">
      <label>Nume complet <input name="name" required autocomplete="name"></label>
      <label>Email <input name="email" type="email" required autocomplete="email"></label>
      <label>Telefon (opțional) <input name="phone" type="tel" autocomplete="tel"></label>
      <label>Subiect <input name="subject" required></label>
      <label>Mesaj <textarea name="message" minlength="20" required></textarea></label>
      <div><button class="btn">Trimite mesajul${icon('arrow')}</button></div>
    </form>`}</div>`)
};

function renderSection(ctx, s, i) {
  const fn = SECTIONS[s.kind];
  if (!fn) throw new Error(`Tip de secțiune necunoscut: ${s.kind}`);
  return ctx.within(`Secțiunea «${plainTitle(s.title) || s.kind}»`, 'Conținutul secțiunii', () => fn(ctx, s, i));
}

function logo(ctx, f) {
  const m = f?.logo_id ? ctx.within(ctx.component, 'Logo-ul', () => ctx.media(f.logo_id)) : null;
  return m ? `<img src="${esc(m.src)}" alt="${esc(f.brand)}"${m.width ? ` width="${m.width}" height="${m.height}"` : ''}>` : `<span class="word">${esc(f?.brand)}</span>`;
}

function header(ctx, path) {
  return ctx.layout('Antet', () => {
    const f = ctx.within('Antet', 'Brandul', () => ctx.one('firma'));
    const menu = ctx.within('Antet', 'Meniul principal', () => ctx.query('pagini', {
      fields: ['menu_order'], as: 'link', where: p => p.menu_order != null, sort: (a, b) => a.menu_order - b.menu_order}));
    const shop = ctx.within('Antet', 'Butonul «Comandă acum»', () => ctx.query('retaileri', {fields: ['search_url']}))[0];
    const cta = shop?.search_url ? (cls) => `<a class="btn small ${cls}" href="${esc(shop.search_url)}" target="_blank" rel="noopener">Comandă acum${icon('external')}<span class="sr-only"> (se deschide într-o fereastră nouă)</span></a>` : () => '';
    const links = menu.map(p => {
      const href = ctx.within('Antet', 'Meniul principal', () => ctx.link(`pagini:${p.id}`));
      return href ? `<a href="${esc(href)}"${href === path ? ' aria-current="page"' : ''}>${esc(p.menu_label || p.title)}</a>` : '';
    }).join('');
    return `<header class="site-header"><div class="container bar">
      <a class="logo" href="/" aria-label="${esc(f?.brand)} — prima pagină">${logo(ctx, f)}</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Deschide meniul">${icon('menu', 'i-menu')}${icon('close', 'i-close')}</button>
      <nav class="nav" id="nav" aria-label="Meniul principal">${links}${cta('')}</nav>${cta('header-cta')}
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
${path ? `<link rel="canonical" href="${SITE_URL}${esc(path)}">` : ''}<meta name="theme-color" content="#254a99">
<link rel="preload" href="/assets/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_V}"><script src="/assets/site.js?v=${ASSET_V}" defer></script></head>
<body><a class="skip" href="#continut">Sari la conținut</a>${ctx.preview ? '<div class="preview-bar">Previzualizare — conținut nepublicat</div>' : ''}
${header(ctx, path)}<main id="continut" tabindex="-1">${body}</main>${footer(ctx)}</body></html>`;
}

export function renderPath(ctx, store, path) {
  const found = findPage(store, path, ctx.preview);
  if (!found) {
    return {status: 404, title: 'Pagina nu există',
      html: shell(ctx, {title: 'Pagina nu există'}, `<section class="section"><div class="container prose"><p class="eyebrow">Eroare 404</p><h1>Pagina nu există</h1>
        <p class="lead">Poate a fost mutată. Te ajutăm de pe prima pagină.</p><div class="actions" style="margin-top:2rem"><a class="btn" href="/">Înapoi la prima pagină</a></div></div></section>`)};
  }
  const page = ctx.page('pagini', found.id);
  const sections = ctx.within('Conținutul paginii', 'Secțiunile paginii', () => ctx.related('pagini', page.id, 'sections'));
  const body = sections.map((s, i) => renderSection(ctx, s, i)).join('\n');
  return {status: 200, title: page.title, owner: ['pagini', page.id],
    html: shell(ctx, {path, title: page.seo_title || page.title, description: page.seo_description}, body)};
}

export const ASSET_VERSION = ASSET_V;
