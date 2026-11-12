// Adaugă într-o bază existentă pagina de înscriere în Purapa Ambassadors (/devino-ambasador/), cu aceleași date ca seed-ul,
// și îndreaptă butoanele din /ambassadors/ spre ea. Se poate rula de mai multe ori: dacă pagina există, nu face nimic.
// Rulează-l cu serverul local oprit sau după ce a fost repornit cu codul nou (altfel serverul vechi nu cunoaște secțiunea).
//   node scripts/add-ambassador-join.mjs            baza data/purapa.db
//   DB=altă.db node scripts/add-ambassador-join.mjs  altă bază
import {openDb, migrate} from '../src/core/db.mjs';
import {createStore, SYSTEM} from '../src/core/store.mjs';
import {AMBASSADOR_JOIN as J} from '../src/import/seed.mjs';

const db = openDb(process.env.DB ?? 'data/purapa.db');
migrate(db);
const store = createStore(db);
const user = {...SYSTEM, name: 'Pagina de înscriere ambasadori'};
const pages = store.list('pagini');
const existing = pages.find(p => p.slug === J.page.slug);
let joinId = existing?.id;
if (!existing) {
  const pub = {publish: true};
  const perks = J.perks.map(([title, text, icon]) => store.create(user, 'beneficii', {title, text, icon}).id);
  const next = J.next.map(([title, text]) => store.create(user, 'pasi', {title, text}).id);
  const faqs = J.faqs.map(([question, answer], i) => store.create(user, 'intrebari', {question, answer, position: 200 + i}, pub).id);
  const form = store.create(user, 'sectiuni', {...J.form, benefits: perks, steps: next}).id;
  const faq = store.create(user, 'sectiuni', {...J.faq, faqs}).id;
  joinId = store.create(user, 'pagini', {...J.page, sections: [form, faq]}, pub).id;
  console.log(`Pagina ${J.page.slug} creată (id ${joinId}).`);
} else console.log(`Pagina ${J.page.slug} există deja (id ${joinId}).`);

// Butoanele din pagina Ambassadors care duceau la Contact duc acum la înscriere.
const amb = pages.find(p => p.slug === 'ambassadors');
const contact = pages.find(p => p.slug === 'contact');
for (const l of amb ? store.links('pagini', amb.id, 'sections') : []) {
  const s = store.get('sectiuni', l.id);
  if (s?.cta_link !== `ref:pagini:${contact?.id}`) continue;
  const data = {cta_link: `ref:pagini:${joinId}`};
  if (s.cta_label === 'Contactează-ne') data.cta_label = 'Fii ambasador Purapa';
  if (s.kind === 'cta' && /Trimite-ne un mesaj/.test(s.text ?? '')) data.text = '<p>Completează formularul de înscriere și îți spunem care sunt următorii pași.</p>';
  store.update(user, 'sectiuni', s.id, data, {publish: true});
  console.log(`Secțiunea ${s.id} (${s.kind}): butonul „${data.cta_label ?? s.cta_label}” duce la înscriere.`);
}
db.close();
