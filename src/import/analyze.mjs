// Etapa 2, analyze (§1.3): citește snapshot-ul și scrie rapoarte JSON. Aici se văd deciziile, înainte să ajungă în bază.
// Nu scrie în bază și nu descarcă nimic.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizePath} from './crawl.mjs';

const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
export const decode = s => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);
export const plain = html => decode(String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
export const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Blocurile unui text: (tip, text) pentru titluri, paragrafe, elemente de listă, citate și celule.
export function blocks(html) {
  return [...String(html ?? '').matchAll(/<(h[1-4]|p|li|blockquote|th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(m => [m[1].toLowerCase(), plain(m[2])]).filter(([, t]) => t);
}

const jsonLd = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => {
  try { const j = JSON.parse(m[1]); return j['@graph'] ?? [j]; } catch { return []; }
});
const meta = (html, name) => decode(html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1] ?? '') || null;
const mainOf = html => (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');

const AVAILABILITY = {InStock: 'în stoc', LimitedAvailability: 'stoc limitat', PreOrder: 'la comandă', BackOrder: 'la comandă', OutOfStock: 'indisponibil', SoldOut: 'indisponibil'};
const PHONE_RE = /(?<!\d)(?:\+40[\s.-]?|0)(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{3})(?!\d)/g;
const phoneKey = s => s.replace(/\D/g, '').replace(/^40/, '0');

export function analyzeSnapshot(manifest, read) {
  const entries = manifest.entries.filter(e => e.file);
  const html = e => read(e.file).toString('utf8');
  const site = manifest.site;
  const siteHost = new URL(site).hostname;
  const pageEntries = entries.filter(e => e.kind === 'page' && /text\/html/.test(e.content_type ?? 'text/html'));
  const findings = [];
  const find = (impact, kind, text, extra = {}) => findings.push({impact, kind, text, ...extra});

  // Paginile: titlu, descriere, canonical, h1, conținutul principal și blocurile lui.
  const pages = pageEntries.map(e => {
    const h = html(e);
    const main = mainOf(h);
    return {path: normalizePath(new URL(e.final_url ?? e.url).pathname), url: e.url, file: e.file, fetched_at: e.fetched_at,
      title: decode(h.match(/<title>([^<]*)<\/title>/)?.[1] ?? '') || null, description: meta(h, 'description'),
      canonical: h.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null, h1: plain(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') || null,
      main, blocks: blocks(main)};
  });
  const byPath = Object.fromEntries(pages.map(p => [p.path, p]));

  // Sitemap: ce lipsește și pe ce domeniu trimite.
  const sitemapEntry = manifest.entries.find(e => e.kind === 'sitemap' && e.file);
  const sitemapUrls = sitemapEntry ? [...html(sitemapEntry).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]) : [];
  const sitemapPaths = new Set(sitemapUrls.map(u => normalizePath(new URL(u).pathname)));
  const sitemapHosts = new Set(sitemapUrls.map(u => new URL(u).hostname));
  for (const h of sitemapHosts) if (h !== siteHost)
    find('mare', 'sitemap', `Sitemap-ul trimite la ${h}, dar site-ul răspunde pe ${siteHost}. Trebuie aleasă o formă canonică; cealaltă primește 301.`);
  const missing = pages.map(p => p.path).filter(p => !sitemapPaths.has(p));
  if (missing.length) find('mediu', 'sitemap', `Pagini publice care lipsesc din sitemap: ${missing.join(', ')}.`);
  const noCanonical = pages.filter(p => !p.canonical).map(p => p.path);
  if (noCanonical.length === pages.length) find('mediu', 'canonical', 'Nicio pagină nu are <link rel="canonical">.');

  // Produsele: lista de pe purapa.ro (ItemList), completată cu datele retailerului (Product).
  const listing = pages.find(p => p.path === '/produse/');
  const listItems = listing ? jsonLd(html(pageEntries.find(e => normalizePath(new URL(e.url).pathname) === '/produse/')))
    .filter(j => j['@type'] === 'ItemList').flatMap(j => j.itemListElement.map(i => ({...i.item, position: i.position}))) : [];
  const retailer = Object.fromEntries(entries.filter(e => e.kind === 'retailer').map(e => [e.url, e]));
  const products = listItems.map(item => {
    const url = item.offers?.url;
    const sku = /-p(\d+)\/?$/.exec(url ?? '')?.[1] ?? null;
    const re = retailer[url];
    const p = re ? jsonLd(html(re)).find(j => j['@type'] === 'Product') : null;
    const images = entries.filter(e => e.kind === 'image' && sku && e.url.includes(`/produse/${sku}/`)).map(e => ({url: e.url, file: e.file, sha1: e.sha1}));
    const shown = Number(item.offers?.price ?? NaN);
    const product = {
      position: item.position, name: decode(item.name), description: decode(item.description ?? ''), sku, extern_id: sku ? `portalia:p${sku}` : null,
      buy_url: url, shown_price: Number.isFinite(shown) ? shown : null,
      retailer: p ? {
        file: re.file, fetched_at: re.fetched_at, name: decode(p.name).replace(/\s*-\s*Portalia$/, ''),
        price: Number(p.offers?.price), list_price: p.offers?.priceSpecification?.priceType?.endsWith('StrikethroughPrice') ? Number(p.offers.priceSpecification.price) : null,
        availability: AVAILABILITY[String(p.offers?.availability ?? '').split('/').pop()] ?? null
      } : null,
      images
    };
    if (product.retailer && product.shown_price != null && product.shown_price !== product.retailer.price) {
      const tăiat = product.retailer.list_price === product.shown_price;
      find('mare', 'pret', `${product.name}: purapa.ro afișează ${product.shown_price} lei, retailerul vinde la ${product.retailer.price} lei${tăiat ? ` (${product.shown_price} e prețul tăiat)` : ''}.`,
        {extern_id: product.extern_id});
    }
    if (!product.retailer) find('mediu', 'retailer', `${product.name}: pagina de la retailer nu a putut fi citită.`, {extern_id: product.extern_id});
    return product;
  });

  // Firma: din termeni (operatorul site-ului), comparată cu ce apare în rest.
  const terms = byPath['/termeni-si-conditii/'];
  const termsText = terms ? plain(terms.main) : '';
  const company = {
    legal_name: terms?.main.match(/<strong>([^<]*?S\.?R\.?L\.?)<\/strong>/)?.[1]?.trim() ?? null,
    cui: termsText.match(/CUI:?\s*(RO\s?\d{2,10})/)?.[1] ?? null,
    reg_com: termsText.match(/(J\d{2}\/\d+\/\d{4})/)?.[1] ?? null,
    address: termsText.match(/cu sediul în ([^,]+(?:,[^,]+?)*?), înregistrat/)?.[1]?.trim() ?? null,
    source: terms ? {url: terms.url, file: terms.file, fetched_at: terms.fetched_at} : null
  };

  // Contactele de pe toate paginile: telefoane, emailuri, adrese, cu paginile pe care apar.
  const contacts = {phones: {}, emails: {}, addresses: {}};
  const note = (bucket, key, value, path) => { (bucket[key] ??= {value, forms: [], pages: []}); if (!bucket[key].forms.includes(value)) bucket[key].forms.push(value); if (!bucket[key].pages.includes(path)) bucket[key].pages.push(path); };
  for (const e of pageEntries) {
    const h = html(e), text = plain(h.replace(/<script[\s\S]*?<\/script>/g, '')), path = normalizePath(new URL(e.url).pathname);
    for (const m of text.matchAll(PHONE_RE)) note(contacts.phones, phoneKey(m[0]), m[0].trim(), path);
    for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) note(contacts.emails, m[0].toLowerCase(), m[0], path);
    // Adresele, căutate în fiecare text dintre etichete (nu peste granițele elementelor), până la prima parte care nu e adresă.
    for (const seg of h.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/>([^<]{8,400})</g)) {
      for (const m of decode(seg[1]).matchAll(/Str\.\s?[A-ZĂÂÎȘȚ][^,]{2,40}nr\.\s?\d+[A-Za-z]?(?:,\s?[^,]{2,40}){0,5}/g)) {
        const parts = m[0].split(/,\s*/);
        const end = parts.findIndex((p, i) => i > 0 && /^(înregistrat|cu |CUI|tel|e-?mail|cod|sub nr)/i.test(p));
        const a = (end === -1 ? parts : parts.slice(0, end)).join(', ').trim();
        note(contacts.addresses, fold(a), a, path);
      }
    }
  }
  const addrForms = [...new Set(Object.values(contacts.addresses).flatMap(a => a.forms))];
  if (addrForms.length > 1) find('mare', 'adresa', `Adresa sediului apare în ${addrForms.length} forme: ${addrForms.map(a => `„${a}”`).join(', ')}.`);
  if (Object.keys(contacts.phones).length > 1) find('mare', 'telefon', `Pe site apar ${Object.keys(contacts.phones).length} numere de telefon diferite: ${Object.keys(contacts.phones).join(', ')}.`);

  // Rețelele: linkurile din subsol față de datele structurate (sameAs).
  const home = pageEntries.find(e => normalizePath(new URL(e.url).pathname) === '/');
  const homeHtml = home ? html(home) : '';
  const socials = [...new Set([...homeHtml.matchAll(/href="(https:\/\/(?:www\.)?(?:facebook|youtube|tiktok|instagram|linkedin)\.com\/[^"]+)"/g)].map(m => decode(m[1])))]
    .map(url => ({url, platform: {facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', linkedin: 'LinkedIn'}[/(facebook|youtube|tiktok|instagram|linkedin)/.exec(url)[1]],
      handle: url.match(/\/(@[^/?]+)/)?.[1] ?? null}));
  const sameAs = jsonLd(homeHtml).flatMap(j => j.sameAs ?? []);
  const notInFooter = sameAs.filter(u => !socials.some(s => fold(s.url) === fold(u)));
  if (notInFooter.length) find('mediu', 'retele', `Datele structurate (sameAs) trimit la ${notInFooter.join(', ')}, care nu apar în subsol.`);

  // Textele legale, întregi; titlurile numerotate în altă ordine decât cea firească.
  const legal = pages.filter(p => /^\/(termeni-si-conditii|politica-de-confidentialitate|politica-de-cookie)\/$/.test(p.path)).map(p => {
    const body = p.main.replace(/^\s*<section\b[^>]*>\s*<div\b[^>]*>\s*<h1\b[\s\S]*?<\/h1>\s*<\/div>\s*<\/section>/, '');
    const nums = [...body.matchAll(/<h3\b[^>]*>\s*(\d+)\./g)].map(m => Number(m[1]));
    const outOfOrder = nums.some((n, i) => i && n < nums[i - 1]);
    if (outOfOrder) find('mic', 'legal', `${p.h1}: secțiunile sunt numerotate ${nums.join(', ')}.`, {path: p.path});
    return {path: p.path, slug: p.path.replace(/\//g, ''), title: p.h1, html: body, file: p.file, url: p.url, fetched_at: p.fetched_at};
  });

  // Imaginile proprii ale site-ului: fișierul, textul alternativ și secțiunea în care apar (după primul titlu din secțiune).
  const imageFiles = Object.fromEntries(entries.filter(e => e.kind === 'site-image').map(e => [new URL(e.url).pathname, e]));
  const images = {};
  for (const e of pageEntries) {
    const h = html(e), page = normalizePath(new URL(e.url).pathname);
    const segments = h.split(/<(?=section\b|header\b)/);
    for (const seg of segments) {
      const heading = plain(seg.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/)?.[1] ?? '') || (seg.startsWith('header') ? 'Antet' : null);
      for (const m of seg.matchAll(/<img\b[^>]*>/g)) {
        const tag = m[0];
        const raw = tag.match(/\ssrc="([^"]+)"/)?.[1] ?? '';
        const path = decodeURIComponent(raw.match(/[?&]url=([^&]+)/)?.[1] ?? raw);
        const file = imageFiles[path];
        if (!file) continue;
        const img = images[path] ??= {path, url: file.url, file: file.file, sha1: file.sha1, fetched_at: file.fetched_at, alt: decode(tag.match(/\salt="([^"]*)"/)?.[1] ?? ''), uses: []};
        if (!img.uses.some(u => u.page === page && u.section === heading)) img.uses.push({page, section: heading});
      }
    }
  }

  return {site, fetched_at: manifest.fetched_at, pages: pages.map(({main, ...p}) => p), products, company, contacts, socials, sameAs, legal,
    images: Object.values(images), findings};
}

export async function analyze({dir = 'reference/snapshot', out = 'reference/analysis'} = {}) {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const cache = new Map();
  for (const e of manifest.entries.filter(e => e.file && e.kind !== 'image')) cache.set(e.file, await readFile(join(dir, e.file)));
  const result = analyzeSnapshot(manifest, f => cache.get(f));
  await mkdir(out, {recursive: true});
  for (const k of ['pages', 'products', 'company', 'contacts', 'socials', 'legal', 'images', 'findings'])
    await writeFile(join(out, `${k}.json`), JSON.stringify(result[k], null, 2));
  return result;
}
