// Valorile legate: scrise o singură dată, completate la afișare (jetoanele {telefon}, §1.6 a, §3.2).
// Fiecare valoare citește prin contextul urmărit, deci devine dependență `direct` sau `list` pe sursa ei.
import {phoneKey} from './content.mjs';

const firma = ctx => ctx.one('firma') ?? {};
const ok36m = ctx => ctx.bySlug('produse', 'cartus-ok36m') ?? {};
const fmtInt = n => n == null ? null : new Intl.NumberFormat('ro-RO').format(n);

export const VALUES = {
  telefon: {label: 'Telefon', source: 'firma', get: ctx => firma(ctx).phone},
  telefon_link: {label: 'Telefon (link)', source: 'firma', get: ctx => firma(ctx).phone && `tel:${phoneKey(firma(ctx).phone)}`},
  email: {label: 'Email', source: 'firma', get: ctx => firma(ctx).email},
  adresa: {label: 'Adresa scurtă', source: 'firma', get: ctx => [firma(ctx).street, firma(ctx).city].filter(Boolean).join(', ')},
  adresa_completa: {label: 'Adresa completă', source: 'firma', get: ctx => {
    const f = firma(ctx);
    return [f.street, f.building, f.city, f.county && `jud. ${f.county}`].filter(Boolean).join(', ');
  }},
  program: {label: 'Program', source: 'firma', get: ctx => firma(ctx).hours},
  raspuns: {label: 'Timp de răspuns', source: 'firma', get: ctx => firma(ctx).response_time},
  firma: {label: 'Denumirea firmei', source: 'firma', get: ctx => firma(ctx).legal_name},
  cui: {label: 'CUI', source: 'firma', get: ctx => firma(ctx).cui},
  reg_com: {label: 'Nr. Reg. Com.', source: 'firma', get: ctx => firma(ctx).reg_com},
  capacitate: {label: 'Capacitatea cartușului', source: 'produse:cartus-ok36m', get: ctx => {
    const n = ok36m(ctx).capacity_l;
    return n == null ? null : `${fmtInt(n)} L`;
  }},
  durata: {label: 'Durata cartușului', source: 'produse:cartus-ok36m', get: ctx => {
    const n = ok36m(ctx).lifetime_months;
    return n == null ? null : `${n} luni`;
  }},
  nr_parametri: {label: 'Numărul de parametri ai testului', source: 'produse:test-rapid', get: ctx => {
    const t = ctx.bySlug('produse', 'test-rapid');
    return t ? String(ctx.related('produse', t.id, 'parameters').length) : null;
  }}
};

// Înlocuiește {nume} cu valoarea; un jeton necunoscut sau fără valoare rămâne vizibil, ca să fie observat.
export function fillTokens(ctx, text, escape) {
  return String(text ?? '').replace(/\{([a-z_]+)\}/g, (m, name) => {
    const v = VALUES[name];
    if (!v) return m;
    const value = ctx.within(ctx.component || `Valoarea {${name}}`, `Valoarea legată {${name}}`, () => v.get(ctx));
    return value == null ? m : escape(value);
  });
}
