// Datele inițiale, preluate din purapa.ro (26.10.2026), fiecare cu sursa ei (§1.3, §1.4).
// Etapa crawl/analyze cu snapshot local urmează; până atunci, aceasta e sursa importului.
// Valorile repetate pe site sunt scrise o singură dată și trimise prin jetoane ({telefon}, {capacitate}…).
import {SYSTEM} from '../core/store.mjs';

const SITE = 'https://purapa.ro';
const src = (path, excerpt) => ({kind: 'site', url: `${SITE}${path}`, title: `purapa.ro${path}`, fetched_at: '2026-10-26', method: 'analiză HTML', excerpt});
const MANUAL = {kind: 'manual', url: 'manual:analiza-2026-10-26', title: 'Propunere din analiza site-ului', certainty: 'unverified'};
const P = 'https://www.portalia.ro';

// Pagina de înscriere în Purapa Ambassadors (/devino-ambasador/). Textele folosesc doar ce spune programul pe site:
// comision pentru fiecare achiziție prin cod, conform condițiilor programului, fără obiective impuse și fără obligații.
// Exportată, ca aceleași date să poată fi adăugate și într-o bază existentă (scripts/add-ambassador-join.mjs).
export const AMBASSADOR_JOIN = {
  page: {title: 'Devino ambasador Purapa', slug: 'devino-ambasador',
    seo_title: 'Devino ambasador Purapa – recomandă apă curată',
    seo_description: 'Înscrie-te în Purapa Ambassadors: recomanzi apă curată celor apropiați și primești comision pentru fiecare achiziție făcută prin codul tău.'},
  form: {kind: 'ambasador', theme: 'deschis', kicker: 'Purapa Ambassadors', title: 'Devino *ambasador Purapa*',
    text: '<p>Recomanzi apă curată oamenilor la care ții și primești comision pentru fiecare achiziție făcută prin codul tău. Fără obiective impuse, fără presiune: recomanzi doar când și cui vrei.</p>',
    note: 'Îți răspundem în {raspuns}, cu toate detaliile programului.'},
  perks: [
    ['Comision la fiecare achiziție', 'Primești un comision pentru fiecare achiziție făcută prin codul tău, conform condițiilor programului.', 'gift'],
    ['Fără obiective, fără presiune', 'Nu ai ținte de vânzări și nicio obligație. Recomanzi doar când și cui vrei.', 'shield'],
    ['Online sau offline, cum îți vine natural', 'Nu ai nevoie de mii de urmăritori: o recomandare sinceră către prieteni, familie sau colegi e la fel de valoroasă.', 'users'],
    ['Recomanzi ceva în care crezi', 'Apă filtrată direct de la robinet, mai puține sticle de plastic și un test care arată ce e în apa de acasă.', 'drop']
  ],
  next: [
    ['Trimiți formularul', '<p>Durează două minute și nu te obligă la nimic.</p>'],
    ['Te contactăm', '<p>Îți răspundem în {raspuns} și îți trimitem condițiile programului.</p>'],
    ['Primești codul tău', '<p>Parcurgi introducerea în program și începi să recomanzi Purapa, offline sau online.</p>']
  ],
  faq: {kind: 'intrebari', kicker: 'Întrebări frecvente', title: 'Ce vor să știe *viitorii ambasadori*'},
  faqs: [
    ['Trebuie să vând un număr minim de produse?', '<p>Nu. Programul nu are obiective impuse și nu te obligă la nimic. Recomanzi doar când și cui vrei.</p>'],
    ['Cum primesc comisionul?', '<p>Pentru fiecare achiziție făcută prin codul tău primești un comision, conform condițiilor programului. Condițiile complete ți le trimitem după înscriere.</p>'],
    ['Am nevoie de mulți urmăritori pe rețelele sociale?', '<p>Nu. Programul e pentru studenți, tineri profesioniști, creatori de conținut și oameni activi în comunitatea lor. Poți recomanda Purapa offline, celor apropiați, sau online, cum preferi.</p>'],
    ['Ce se întâmplă după ce trimit formularul?', '<p>Te contactăm în {raspuns} cu detaliile programului. Parcurgi o scurtă introducere, primești codul tău și poți începe să recomanzi.</p>']
  ]
};

export function seed(store, {user = SYSTEM} = {}) {
  if (store.list('firma').length) throw new Error('Baza are deja date. Importul nu rulează peste editări (folosește o bază nouă).');
  const c = (key, data, source, publish = true) => store.create(user, key, data, {publish, source}).id;
  const ids = {};

  c('firma', {
    brand: 'Purapa', legal_name: 'Instant Softnet SRL', cui: 'RO 25383246', reg_com: 'J40/4285/2009',
    street: 'Str. Răsăritului nr. 90', building: 'hala C2', city: 'Buftea', county: 'Ilfov',
    phone: '0372 887 572', email: 'contact@purapa.ro', hours: 'Luni – Vineri: 09:00 – 18:00',
    response_time: 'maximum 1–2 zile lucrătoare',
    tagline: 'Apă curată și sigură, direct de la robinet. Soluții moderne de filtrare pentru familia ta.'
  }, src('/termeni-si-conditii', 'Instant Softnet SRL, CUI RO 25383246, J40/4285/2009, Str. Rasaritului nr. 90, hala C2, Buftea, jud. Ilfov'));

  [['Facebook', 'https://www.facebook.com/profile.php?id=61582186433649', null],
   ['YouTube', 'https://www.youtube.com/@PurapaRomania', '@PurapaRomania'],
   ['TikTok', 'https://www.tiktok.com/@purapa.romania', '@purapa.romania']]
    .forEach(([platform, url, handle], i) => c('retele', {platform, url, handle, position: i}, src('/', 'subsol')));

  ids.portalia = c('retaileri', {name: 'Portalia', url: 'https://www.portalia.ro', search_url: `${P}/search/purapa/`}, src('/', 'Comandă Acum'));

  for (const [slug, name, position] of [['filtrare', 'Sisteme de filtrare', 1], ['cartuse', 'Cartușe', 2], ['dedurizare', 'Dedurizare', 3],
    ['testare', 'Testare', 4], ['dozatoare', 'Dozatoare', 5], ['accesorii', 'Accesorii', 6]]) ids[`cat_${slug}`] = c('categorii', {name, slug, position}, MANUAL);

  ids.prefiltrare = c('etape', {name: 'Prefiltrare', microns: 5, position: 1,
    retains: 'sediment, rugină, nisip, particule în suspensie',
    text: '<p>Barieră mecanică de 5 microni care oprește sedimentele vizibile și protejează cartușul de microfiltrare, prelungindu-i viața.</p>'},
  src('/despre-noi/', 'Etapa 1: Prefiltrare'));
  ids.microfiltrare = c('etape', {name: 'Microfiltrare', microns: 0.5, position: 2,
    retains: 'clor și derivați, mirosuri, particule fine',
    text: '<p>Tehnologie Pre-Coat și cărbune activ la 0,5 microni: reduce clorul și mirosurile, îmbunătățește gustul și păstrează mineralele. Argintul din cartuș are rol bacteriostatic.</p>'},
  src('/despre-noi/', 'Etapa 2: Microfiltrare'));

  const products = [
    {key: 'kit', p: 651, name: 'Kit complet de filtrare apă pentru chiuveta de bucătărie 11.000 L', slug: 'kit-filtrare-11000l', price: 1800, cat: 'filtrare',
     summary: 'Kit pentru tratarea apei potabile la robinetul din bucătărie.', capacity_l: 11000, lifetime_months: 12,
     buy: '/kit-complet-de-filtrare-apa-pentru-chiuveta-de-bucatarie-11-000-l-purapa-p651/'},
    {key: 'dedurizator9', p: 762, name: 'Dedurizator apă automat compact 9L rășină, 1 mc/h', slug: 'dedurizator-9l', price: 1699, cat: 'dedurizare',
     summary: 'Schimb ionic cu rășină cationică; protejează centrala, boilerul și electrocasnicele.',
     buy: '/dedurizator-apa-automat-compact-pentru-locuinta-sistem-anti-calcar-protectie-instalatii-si-electrocasnice-9l-rasina-1mc-h-purapa-p762/'},
    {key: 'ok36m', p: 662, name: 'Cartuș microfiltrare OK36M medium, 11.000 L, Purapa by Oceano', slug: 'cartus-ok36m', price: 389, cat: 'cartuse',
     summary: 'Pre-Coat 0,5 µm; reține suspensiile, clorul și derivații lui.', capacity_l: 11000, lifetime_months: 12,
     buy: '/cartus-microfiltrare-ok36m-medium-11-000l-purapa-by-oceano-p662/'},
    {key: 'test', p: 759, name: 'Test rapid Purapa 16 parametri', slug: 'test-rapid', price: 89, cat: 'testare',
     summary: 'Testează {nr_parametri} parametri esențiali ai apei potabile, cu rezultat interpretat digital.',
     buy: '/test-rapid-apa-potabila-purapa-auto-testare-acasa-rezultat-interpretat-digital-p759/'},
    {key: 'ecoli', p: 1229, name: 'Kit de testare apă E.Coli O157 – 1 test', slug: 'test-ecoli-o157', price: 89, cat: 'testare',
     summary: 'Detectează E. coli O157 în aproximativ 15 minute; pentru apa de la robinet, fântâni și rezervoare.',
     buy: '/kit-de-testare-apa-e-coli-o157-1-test-purapa-p1229/'},
    {key: 'pp5', p: 714, name: 'Cartuș prefiltrare 10″ PP grosier 5 microni', slug: 'cartus-pp-5-microni', price: 12.9, cat: 'cartuse',
     summary: 'Polipropilenă, 5 µm; reține impuritățile mecanice.', lifetime_months: 3,
     buy: '/cartus-prefiltrare-10-39-39-pp-grosier-5-microni-purapa-p714/'},
    {key: 'aroma', p: 660, name: 'Sistem de dedurizare a apei Aroma White 35L', slug: 'aroma-white-35l', price: 3500, cat: 'dedurizare',
     summary: 'Pentru espressoare și mașini de spălat pahare; control electronic, consum redus de sare și apă.',
     buy: '/sistem-de-dedurizare-a-apei-aroma-white-35l-purapa-p660/'},
    {key: 'venus', p: 655, name: 'Dozator de apă 18L/oră, VENUS DRY', slug: 'dozator-venus-dry', price: 7139, cat: 'dozatoare',
     summary: 'Dozator profesional de 18 L/oră pentru birouri și locuințe.',
     buy: '/dozator-de-apa-18l-ora-venus-dry-purapa-p655/'},
    {key: 'termos', p: 716, name: 'Termos inteligent albastru cu afișaj digital', slug: 'termos-inteligent', price: 89, cat: 'accesorii',
     summary: 'Oțel inoxidabil, izolare termică dublă, 500 ml, afișaj digital al temperaturii.',
     buy: '/termos-inteligent-albastru-cu-afisaj-digital-otel-inoxidabil-izolare-termica-dubla-500ml-purapa-p716/'}
  ];
  products.forEach((p, i) => {
    ids[p.key] = c('produse', {
      name: p.name, slug: p.slug, summary: p.summary, price: p.price, buy_url: `${P}${p.buy}`, extern_id: `portalia:p${p.p}`,
      capacity_l: p.capacity_l, lifetime_months: p.lifetime_months, position: i + 1,
      category_id: ids[`cat_${p.cat}`], retailer_id: ids.portalia
    }, src('/produse/', p.name));
  });
  store.setLinks(user, 'produse', ids.kit, 'cartridges', [ids.ok36m, ids.pp5], {source: src('/', 'specificațiile kitului')});
  store.setLinks(user, 'produse', ids.kit, 'stages', [ids.prefiltrare, ids.microfiltrare], {source: src('/', 'Tehnologie de purificare')});
  store.setLinks(user, 'produse', ids.pp5, 'stages', [ids.prefiltrare], {source: src('/produse/', '5 µm')});
  store.setLinks(user, 'produse', ids.ok36m, 'stages', [ids.microfiltrare], {source: src('/produse/', '0,5 µm Pre-Coat')});

  const params = [
    ['Duritate totală', null, 'Duritate și echilibru', 'Nivelul de calcar din apă și cât de ușor apar depuneri pe țevi și electrocasnice.'],
    ['Clor liber', 'Cl₂', 'Dezinfectare', 'Cantitatea de clor activ folosită la dezinfecție; poate influența gustul și mirosul apei.'],
    ['Clor total', null, 'Dezinfectare', 'Clorul liber plus compușii rezultați după dezinfecție: arată cum a fost tratată apa.'],
    ['Brom', 'Br', 'Dezinfectare', 'Dezinfectant alternativ folosit uneori la tratarea apei; poate afecta gustul și mirosul.'],
    ['Alcalinitate totală', null, 'Duritate și echilibru', 'Capacitatea apei de a neutraliza acizii; influențează stabilitatea pH-ului și formarea depunerilor.'],
    ['pH', 'pH', 'Duritate și echilibru', 'Cât de acidă sau alcalină e apa, cu impact asupra gustului și a confortului la consumul zilnic.'],
    ['Nitrați', 'NO₃⁻', 'Contaminanți', 'Pot ajunge în apă din îngrășăminte sau surse organice; nivelurile ridicate nu sunt dorite în apa potabilă.'],
    ['Nitriți', 'NO₂⁻', 'Contaminanți', 'Indicator de poluare organică recentă; valorile crescute arată o apă care cere atenție sporită.'],
    ['Cupru', 'Cu', 'Metale', 'Poate proveni din coroziunea țevilor de cupru și poate da apei un gust metalic.'],
    ['Fier', 'Fe', 'Metale', 'Poate colora apa și lasă pete galbene sau maronii pe textile și obiecte sanitare.'],
    ['Plumb', 'Pb', 'Metale', 'Metal greu nedorit în apa potabilă; apare mai ales prin coroziunea instalațiilor vechi.'],
    ['Nichel', 'Ni', 'Metale', 'Metal de urmă care poate proveni din unele materiale de instalații; util pentru evaluarea generală a apei.'],
    ['Carbonat', 'CO₃²⁻', 'Duritate și echilibru', 'Parametru legat de alcalinitate și duritate; influențează depunerile și stabilitatea pH-ului.'],
    ['MPS (oxidant)', 'MPS', 'Dezinfectare', 'Arată prezența unor agenți oxidanți folosiți la tratarea apei; ajută la evaluarea dezinfecției.'],
    ['Acid cianuric', null, 'Dezinfectare', 'Folosit pentru stabilizarea clorului în anumite aplicații; completează tabloul tratamentului apei.'],
    ['Sulfiți', 'SO₃²⁻', 'Contaminanți', 'Compuși folosiți uneori drept conservanți sau antioxidanți; valorile ridicate pot influența mirosul și gustul.']
  ];
  ids.params = params.map(([name, symbol, group, indicates], i) => c('parametri', {name, symbol, group, indicates, position: i + 1}, src('/testare-apa/', `Știi ce ai în apă: ${name}`)));
  store.setLinks(user, 'produse', ids.test, 'parameters', ids.params, {source: src('/testare-apa/', '16 parametri')});
  // Dedusă, nu confirmată: clorul se rezolvă cu microfiltrarea (din textul despre cartuș). Așteaptă verificarea unui om.
  store.setLinks(user, 'parametri', ids.params[1], 'recommends', [{id: ids.ok36m, status: 'inferred', confidence: 0.8, note: 'cartușul „reține clorul și derivații”'}],
    {source: src('/produse/', 'reține suspensiile, clorul și derivații lui')});

  const faqs = [
    ['Cât durează instalarea?', '<p>În medie 60–90 de minute. Instalarea nu e invazivă și se poate desface oricând.</p>', [ids.kit]],
    ['Cât de des schimb filtrele?', '<p>Prefiltrul la 2–3 luni; cartușul principal la {durata} sau după {capacitate}.</p>', [ids.pp5, ids.ok36m]],
    ['Se potrivește la chiuveta mea?', '<p>Sistemul e universal, compatibil cu majoritatea instalațiilor standard, iar designul compact încape și în spații înguste.</p>', [ids.kit]],
    ['Elimină bacteriile?', '<p>Microfiltrarea ultrafină și argintul bacteriostatic inhibă dezvoltarea microorganismelor în cartuș.</p>', [ids.ok36m]],
    ['Pot folosi filtrul pe apă de fântână sau de izvor?', '<p>Da, dar pentru sursele netratate un <a data-ref="produse:ID_TEST">test prealabil</a> e obligatoriu.</p>', [ids.test]]
  ];
  ids.faqs = faqs.map(([question, answer, prods], i) => c('intrebari', {question, answer: answer.replace('ID_TEST', ids.test), position: i + 1, products: prods},
    src('/', `Întrebări frecvente: ${question}`)));

  const benefit = (title, text, icon, s) => c('beneficii', {title, text, icon}, s);
  const why = [
    benefit('Filtrare avansată', 'Elimină sedimentele, clorul și compușii organici.', 'filter', src('/', 'De ce să alegi Purapa?')),
    benefit('Capacitate {capacitate}', 'Un cartuș ține până la {durata} de folosire intensă.', 'drop', src('/', 'De ce să alegi Purapa?')),
    benefit('Tehnologie Pre-Coat', 'Microfiltrare ultrafină care îmbunătățește gustul și mirosul.', 'sparkle', src('/', 'De ce să alegi Purapa?')),
    benefit('Instalare rapidă', 'Compact, se potrivește la majoritatea chiuvetelor standard.', 'wrench', src('/', 'De ce să alegi Purapa?'))
  ];
  const eco = [
    benefit('Fără plastic', 'Elimini sute de sticle PET de unică folosință în fiecare an.', 'leaf', src('/', 'Impactul tău ecologic')),
    benefit('Mai puține livrări', 'Apa e deja la robinet: fără baxuri cărate și transportate.', 'truck', src('/', 'Impactul tău ecologic')),
    benefit('Durabilitate', 'Un sistem gândit pentru ani de folosire.', 'clock', src('/', 'Impactul tău ecologic'))
  ];

  const step = (title, text, s) => c('pasi', {title, text}, s);
  const testSteps = [
    step('Comandă testul rapid Purapa', `<p>Primești acasă kitul de testare, scala de culori și instrucțiunile complete. Comanda se face prin <a data-ref="produse:${ids.test}">partenerul nostru, Portalia</a>.</p>`, src('/testare-apa/', 'Cum funcționează testarea apei')),
    step('Testează apa în sub 5 minute', '<p>Umple un pahar sau o sticlă cu apa pe care vrei s-o testezi. Ține banda în apă 2–3 secunde, ca toate zonele de test să se ude, apoi scoate-o și ține-o orizontal. Nu o scutura și nu o șterge: las-o să reacționeze circa 30 de secunde.</p>', src('/testare-apa/', 'pasul 2')),
    step('Fotografiază banda', '<p>Așază banda paralel cu scala de culori, pe o suprafață plană, în lumină bună, cu toate pătrățelele colorate la vedere.</p>', src('/testare-apa/', 'pasul 3')),
    step('Încarcă fotografia și primește raportul', '<p>Scanează codul QR sau deschide aplicația <a href="/test-rapid/">Test Rapid</a> și încarcă fotografia. Citim culorile benzii față de scala de control și îți generăm un raport digital pentru cei {nr_parametri} parametri.</p>', src('/testare-apa/', 'pasul 4')),
    step('Primește recomandările Purapa', '<p>Pe baza rezultatelor, experții Purapa îți recomandă soluția de filtrare potrivită pentru apa ta.</p>', src('/testare-apa/', 'pasul 5'))
  ];
  const risks = [
    benefit('Poate conține substanțe invizibile', 'Metale, nitrați sau alte reziduuri nu se văd cu ochiul liber.', 'eyeoff', src('/testare-apa/', 'De ce să testez apa?')),
    benefit('Gustul și mirosul nu garantează siguranța', 'Apa poate avea gust neutru și totuși să nu fie optimă pentru consumul zilnic.', 'glass', src('/testare-apa/', 'De ce să testez apa?')),
    benefit('Conductele vechi pot altera apa', 'Chiar dacă pleacă tratată din rețea, apa se poate contamina pe traseu, până la robinet.', 'pipe', src('/testare-apa/', 'De ce să testez apa?')),
    benefit('Fântânile și puțurile sunt expuse', 'Infiltrațiile din sol, agricultura sau vecinătatea pot afecta calitatea apei.', 'well', src('/testare-apa/', 'De ce să testez apa?'))
  ];
  // Întrebările despre test: doar ce spune pagina veche de testare.
  const testFaqs = [
    ['Testul înlocuiește o analiză de laborator?', '<p>Nu. Testul rapid oferă o evaluare orientativă, pe baza unui screening făcut acasă. Pentru analize detaliate sau rezultate oficiale e recomandat un laborator acreditat.</p>'],
    ['Pot testa apa din fântână sau din puț?', '<p>Da. Testul se potrivește pentru apa din rețeaua publică, din fântână sau din puț. La fântâni și puțuri e cu atât mai util, pentru că infiltrațiile din sol, agricultura sau vecinătatea pot afecta apa.</p>'],
    ['Cât durează testul?', '<p>Sub 5 minute. Banda stă în apă 2–3 secunde, reacționează circa 30 de secunde, apoi fotografiezi rezultatul lângă scala de culori.</p>'],
    ['Cum primesc rezultatul?', '<p>Încarci fotografia benzii în aplicația Purapa, prin codul QR sau linkul primit, și primești un raport digital pentru toți cei {nr_parametri} parametri, cu recomandări de filtrare.</p>']
  ].map(([question, answer], i) => c('intrebari', {question, answer, position: 10 + i, products: [ids.test]}, src('/testare-apa/', question)));
  const page =(data, sections, s) => {
    const secIds = sections.map(x => c('sectiuni', x, s));
    return c('pagini', {...data, sections: secIds}, s);
  };
  // Paginile se creează întâi fără secțiuni care trimit la alte pagini, ca linkurile să aibă ținta.
  ids.home = c('pagini', {title: 'Acasă', slug: '', menu_label: 'Acasă', menu_order: 1, footer: 'firma',
    seo_title: 'Filtre de apă pentru acasă', seo_description: 'Sisteme de filtrare Purapa: apă curată și sigură direct de la robinet.'}, src('/'));
  ids.produse = c('pagini', {title: 'Produse', slug: 'produse', menu_label: 'Produse', menu_order: 2, footer: 'firma'}, src('/produse/'));
  ids.testare = c('pagini', {title: 'Testare apă potabilă', slug: 'testare-apa', menu_label: 'Testare apă', menu_order: 3, footer: 'firma',
    seo_title: 'Testare apă potabilă – analiză rapidă cu Test Rapid Purapa',
    seo_description: 'Testează apa acasă, în sub 5 minute: 16 parametri esențiali, raport digital și recomandări personalizate de filtrare.'}, src('/testare-apa/'));
  ids.despre = c('pagini', {title: 'Despre Purapa', slug: 'despre-noi', menu_label: 'Despre', menu_order: 4}, src('/despre-noi/'));
  ids.ambassadors = c('pagini', {title: 'Purapa Ambassadors', slug: 'ambassadors', menu_label: 'Ambassadors', menu_order: 6, footer: 'firma',
    seo_title: 'Purapa Ambassadors – recomandă apă curată și primești comision',
    seo_description: 'Programul Purapa Ambassadors: recomanzi cu naturalețe apa filtrată celor apropiați și primești comision pentru fiecare achiziție. Fără ținte, fără obligații.'}, src('/ambassadors/'));
  ids.contact = c('pagini', {title: 'Contact', slug: 'contact', menu_label: 'Contact', menu_order: 7, footer: 'firma'}, src('/contact/'));
  // Pașii programului de ambasadori trimit la pagina de contact, deci vin după ea.
  const ambSteps = [
    step('Înscriere', `<p>Completezi <a data-ref="pagini:${ids.contact}">formularul</a> și parcurgi introducerea în program.</p>`, src('/ambassadors/', 'pasul 1')),
    step('Recomandare naturală', '<p>Împarți cu cei apropiați experiența ta cu Purapa, offline sau online.</p>', src('/ambassadors/', 'pasul 2')),
    step('Recompensă', '<p>Primești un comision, conform condițiilor programului, pentru fiecare achiziție făcută prin recomandarea ta.</p>', src('/ambassadors/', 'pasul 3'))
  ];
  for (const [slug, title, label] of [['termeni-si-conditii', 'Termeni și condiții', 'Termeni'],
    ['politica-de-confidentialitate', 'Politica de confidențialitate', 'Confidențialitate'], ['politica-de-cookie', 'Politica de cookie', 'Politica cookie']]) {
    ids[slug] = page({title, slug, menu_label: label, footer: 'legal'},
      [{kind: 'text', title, text: '<p>[[de-validat:textul integral se importă din pagina actuală]] Operator: {firma}, {adresa_completa}.</p>'}], src(`/${slug}`));
  }

  const sec = (pageId, sections, s) => store.setLinks(user, 'pagini', pageId, 'sections', sections.map(x => c('sectiuni', x, s)));
  // Homepage: hero → de ce → vitrina kitului → testul apei → tehnologia → impactul → întrebări → îndemnul final.
  const home = {};
  for (const [key, data] of Object.entries({
    hero: {kind: 'hero', kicker: 'Filtru de apă pentru bucătărie', title: 'Redescoperă gustul *apei pure*.',
      text: '<p>Sistemele de filtrare Purapa transformă apa de la robinet într-o experiență pură și sigură. Performanță ridicată, design compact și cost redus.</p><p><strong>E normal să-ți fie sete!</strong></p>',
      products: [ids.kit], cta2_label: 'Testează-ți apa', cta2_link: `ref:pagini:${ids.testare}`},
    why: {kind: 'beneficii', kicker: 'De ce Purapa', title: 'De ce să alegi *Purapa*?',
      text: '<p>Filtrare în două etape, direct la robinetul din bucătărie, fără bidoane și fără instalații complicate.</p>',
      benefits: why, cta_label: 'Află mai multe despre Purapa', cta_link: `ref:pagini:${ids.despre}`},
    kit: {kind: 'produse', kicker: 'Soluții premium pentru apă', title: 'Kitul complet de *filtrare*',
      text: '<p>Tot ce îți trebuie pentru apă filtrată la robinetul din bucătărie: sistemul, cartușele și instrucțiunile de montaj.</p>',
      products: [ids.kit], cta_label: 'Vezi toate produsele', cta_link: `ref:pagini:${ids.produse}`},
    calc: {kind: 'calculator', theme: 'deschis', kicker: 'Calculator economii', title: 'Cât economisești cu *Purapa*?',
      text: '<p>Investiția într-un sistem de filtrare se amortizează în primele luni. Vezi cât economisești eliminând apa îmbuteliată.</p>',
      // Ipotezele: consumul de apă de băut pe persoană și sticla tipică; costul cartușelor vine din produse.
      params: {persoane: 3, litri_persoana_zi: 1.5, cost_litru: 3.5, sticla_l: 2},
      products: [ids.kit]},
    test: {kind: 'test', kicker: 'Test rapid acasă', title: 'Apa ta este într-adevăr *sigură*?',
      text: '<p>Testul rapid verifică {nr_parametri} parametri esențiali în câteva minute. Primești un raport interpretat de specialiști și recomandări personalizate.</p>',
      parameters: ids.params, cta_label: 'Analizează apa acum', cta_link: `ref:pagini:${ids.testare}`, cta2_label: 'Comandă testul pe Portalia', cta2_link: `ref:produse:${ids.test}`},
    tech: {kind: 'tehnologie', theme: 'deschis', kicker: 'Cum funcționează', title: 'Două etape, *apă curată*',
      text: '<p>Rezultatul: apă bună de băut, de gătit și pentru hidratarea de zi cu zi.</p>', stages: [ids.prefiltrare, ids.microfiltrare]},
    eco: {kind: 'beneficii', theme: 'inchis', kicker: 'Impact', title: 'Impactul tău *ecologic*',
      text: '<p>Fiecare pahar de apă filtrată acasă înseamnă mai puțin plastic, mai puține transporturi și mai puțină risipă.</p>', benefits: eco},
    faq: {kind: 'intrebari', kicker: 'Întrebări frecvente', title: 'Ai întrebări? *Avem răspunsuri.*',
      text: '<p>Nu găsești ce cauți? Scrie-ne și îți răspundem în {raspuns}.</p>', faqs: ids.faqs, cta_label: 'Scrie-ne', cta_link: `ref:pagini:${ids.contact}`},
    cta: {kind: 'cta', kicker: 'Apa pură începe cu tine', title: 'Fă primul pas spre *apă curată*.',
      text: '<p>Alege kitul complet sau testează mai întâi apa de acasă. Te ajutăm la fiecare pas.</p>',
      cta2_label: 'Cere asistență', cta2_link: `ref:pagini:${ids.contact}`}
  })) home[key] = c('sectiuni', data, src('/'));
  // Butoanele care duc la vitrina kitului de pe aceeași pagină.
  store.update(user, 'sectiuni', home.hero, {cta_label: 'Vezi kit-ul de filtrare', cta_link: `ref:sectiuni:${home.kit}`}, {source: src('/')});
  store.update(user, 'sectiuni', home.cta, {cta_label: 'Vezi kit-ul complet', cta_link: `ref:sectiuni:${home.kit}`}, {source: src('/')});
  store.update(user, 'sectiuni', home.calc, {cta_label: 'Vezi kit-ul complet', cta_link: `ref:sectiuni:${home.kit}`}, {source: src('/')});
  store.setLinks(user, 'pagini', ids.home, 'sections', Object.values(home));
  // Produse: catalogul cu dovezi (recenziile de la Portalia vin la import), recenziile, cum cumperi, îndemnul final.
  const buySteps = [
    step('Alegi produsul', '<p>Compari aici sistemele de filtrare, cartușele și testele Purapa, cu notele și recenziile clienților.</p>', MANUAL),
    step('Comanzi pe Portalia', '<p>Butonul „Comandă pe Portalia” te duce direct la produs. Comanda, plata și livrarea se fac prin Portalia, partenerul nostru autorizat.</p>', MANUAL),
    step('Primești acasă', '<p>Produsul ajunge la tine prin Portalia. Pentru întrebări despre montaj sau despre apa ta, ne găsești la {telefon}.</p>', MANUAL)
  ];
  sec(ids.produse, [
    {kind: 'produse', kicker: 'Magazin Purapa', title: 'Produse *Purapa*',
     text: '<p>Sisteme de filtrare, cartușe de schimb și teste pentru apă. Aici vezi ce face fiecare și ce spun cei care le folosesc; comanda o faci pe Portalia, partenerul nostru autorizat.</p>'},
    {kind: 'recenzii', theme: 'deschis', kicker: 'Recenzii de la clienți', title: 'Ce spun cei care *folosesc Purapa*'},
    {kind: 'pasi', kicker: 'Cum cumperi', title: 'Alegi aici, comanzi pe *Portalia*', steps: buySteps},
    {kind: 'cta', title: 'Nu știi ce *ți se potrivește*?', text: '<p>Începe cu apa ta: testul rapid îți arată ce conține, iar recomandările îți spun de ce ai nevoie.</p>',
     cta_label: 'Testează apa', cta_link: `ref:pagini:${ids.testare}`, cta2_label: 'Întreabă un specialist', cta2_link: `ref:pagini:${ids.contact}`}
  ], src('/produse/'));
  const test = {};
  for (const [key, data] of Object.entries({
    hero: {kind: 'hero', kicker: 'Test rapid Purapa', title: 'Apa e limpede – dar e și *curată*?',
      text: '<p>Află rapid ce se ascunde în apa de la robinet. Testezi apa la tine acasă și primești recomandări personalizate pentru o apă mai sigură și mai plăcută la gust.</p>',
      cta_label: 'Comandă testul pe Portalia', cta_link: `ref:produse:${ids.test}`, products: [ids.test],
      facts: '{nr_parametri} | parametri analizați\n5 min | sau chiar mai puțin\ndigital | raport cu recomandări'},
    about: {kind: 'text', kicker: 'Ce este', title: 'Testul rapid *Purapa*',
      text: '<p>Cea mai simplă metodă de a verifica apa potabilă. Faci testul acasă, în câteva minute, și afli dacă apa pe care o bei zilnic, din rețeaua publică, din fântână sau din puț, are probleme de calitate.</p><p>Primești un raport clar, pe înțelesul tuturor: ce substanțe sunt în apă și cum îi influențează gustul, mirosul, depunerile și siguranța. Plus recomandări personalizate pentru apa de la robinet.</p>',
      note: 'Testul rapid oferă o evaluare orientativă, pe baza unui screening făcut acasă. Pentru analize detaliate sau rezultate oficiale e recomandat un laborator acreditat.'},
    why: {kind: 'beneficii', theme: 'deschis', kicker: 'De ce să testezi', title: 'Limpede nu înseamnă *sigură*',
      text: '<p>De multe ori credem că apa e „bună” pentru că:</p><ul><li>e limpede</li><li>nu are miros</li><li>vine de la robinet</li><li>vine din fântână sau puț</li></ul><p>Însă chiar aici apar riscurile.</p>',
      benefits: risks},
    steps: {kind: 'pasi', kicker: 'Cum funcționează', title: 'Cinci pași, de acasă până la *raport*',
      text: '<p>Fără laborator, fără programări. Tot ce-ți trebuie e în kit, iar rezultatul îl primești pe telefon.</p>',
      steps: testSteps, cta_label: 'Comandă testul pe Portalia', cta_link: `ref:produse:${ids.test}`},
    params: {kind: 'test', theme: 'deschis', kicker: 'Ce analizează', title: 'Știi ce ai *în apă*',
      text: '<p>Testul analizează {nr_parametri} parametri care influențează gustul, mirosul, depunerile și siguranța apei, inclusiv metale și substanțe folosite la tratare. Și afli ce poți face ca s-o îmbunătățești.</p>',
      parameters: ids.params, cta_label: 'Comandă testul pe Portalia', cta_link: `ref:produse:${ids.test}`},
    faq: {kind: 'intrebari', kicker: 'Întrebări frecvente', title: 'Despre *testul rapid*',
      text: '<p>Nu găsești răspunsul? Scrie-ne și îți răspundem în {raspuns}.</p>', faqs: testFaqs, cta_label: 'Scrie-ne', cta_link: `ref:pagini:${ids.contact}`},
    cta: {kind: 'cta', title: 'Află ce ai în apă în *mai puțin de 5 minute*',
      text: '<p>Testul vine acasă, rezultatul îl primești pe telefon, iar recomandările sunt gândite pentru apa ta.</p>',
      cta_label: 'Comandă testul pe Portalia', cta_link: `ref:produse:${ids.test}`, cta2_label: 'Întreabă un specialist', cta2_link: `ref:pagini:${ids.contact}`}
  })) test[key] = c('sectiuni', data, src('/testare-apa/'));
  store.update(user, 'sectiuni', test.hero, {cta2_label: 'Vezi cum funcționează', cta2_link: `ref:sectiuni:${test.steps}`}, {source: src('/testare-apa/')});
  store.setLinks(user, 'pagini', ids.testare, 'sections', Object.values(test));
  // Tutorialul de montaj: narațiunea filmării de pe YouTube (NPfIE4AtHnc), pas cu pas, cu scena ilustrată a fiecărui pas.
  const yt = t => ({kind: 'site', url: 'https://www.youtube.com/watch?v=NPfIE4AtHnc', title: 'YouTube: Purapa – Tutorial de montaj pas cu pas', fetched_at: '2026-11-11', method: 'subtitrare automată, corectată', excerpt: t});
  const installSteps = [
    ['Bine ai venit', 'Bine ai venit! Acesta este un tutorial video pentru montarea filtrului Purapa.', 'intro', '0:00'],
    ['Ce conține kitul', 'Iată ce conține kitul: cartușe de microfiltrare, prefiltru și cartușe de prefiltrare, suport pentru cartușul de microfiltrare, suport pentru prefiltru, cheie pentru prefiltru, furtun de alimentare, reductoare, set de fitinguri reductoare și set de șuruburi.', 'kit', '0:04'],
    ['Izolează fitingurile', 'Începe prin a izola fitingurile.', 'izolare', '0:23'],
    ['Suportul prefiltrului', 'Montează suportul pentru prefiltru pe capacul acestuia, folosind patru șuruburi din cele primite în kit.', 'capac', '0:31'],
    ['Fitingurile prefiltrului', 'Montează fitingurile izolate pe capacul prefiltrului, folosind o cheie reglabilă.', 'cheie-prefiltru', '0:41'],
    ['Fitingurile microfiltrului', 'Continuă izolarea fitingurilor și montează-le pe suportul pentru cartușul de microfiltrare, folosind o cheie reglabilă.', 'suport-micro', '1:17'],
    ['Suportul pe perete', 'Fixează suportul pe peretele interior al dulapului de sub chiuvetă.', 'perete', '1:41'],
    ['Și suportul prefiltrului', 'Acum fixează exact la fel și suportul prefiltrului.', 'perete-prefiltru', '1:59'],
    ['Oprește apa rece', 'Oprește alimentarea cu apă rece de la robinet și deșurubează furtunul. Atenție: asigură-te că montezi filtrul pe circuitul de apă rece. De asemenea, este indicat să deschizi robinetul, ca să eliberezi presiunea din sistem.', 'apa-rece', '2:08'],
    ['Racordurile', 'Conectează fitingul potrivit pe furtunul de alimentare și strânge-l cu o cheie reglabilă. De asemenea, montează fitingul potrivit și pe robinetul de alimentare cu apă rece.', 'racord', '2:20'],
    ['Furtunul', 'Taie o bucată potrivită din furtunul de alimentare și conecteaz-o la suportul cartușului de microfiltrare și la racordul de apă rece de la chiuvetă. Taie altă bucată potrivită din furtunul de alimentare și unește suportul cartușului de microfiltrare cu capătul prefiltrului. Taie o a treia bucată din furtunul de alimentare și unește capătul prefiltrului cu robinetul de apă rece.', 'furtun', '2:31'],
    ['Cartușele', 'Conectează cartușul de microfiltrare și cartușul de prefiltrare la suporții lor, în poziție verticală. Strânge bine prefiltrul cu ajutorul cheii din kit.', 'cartuse', '2:55'],
    ['Pornește apa', 'Pornește apa și las-o să curgă timp de aproximativ 1–2 minute.', 'porneste', '3:04'],
    ['Gata', 'Gata, ai montat filtrul. Acum te poți bucura de o apă pură și curată, chiar de la tine de la chiuvetă.', 'gata', '3:10']
  ].map(([title, text, scene, t]) => c('pasi', {title, text: `<p>${text}</p>`, scene}, yt(`narațiunea de la ${t}`)));
  sec(ids.despre, [
    {kind: 'hero', title: 'Tehnologie avansată pentru apă pură', drop_mark: 'lebada',
     text: '<p>Purapa e un brand dedicat calității apei și siguranței consumatorului: microfiltrare modernă, materiale de calitate, procese testate. Sistemele sunt proiectate în Europa.</p>'},
    {kind: 'tehnologie', title: 'Cum funcționează filtrarea', stages: [ids.prefiltrare, ids.microfiltrare]},
    {kind: 'tutorial', title: 'Instalare fără bătăi de cap', text: '<p>Sistemul compact se integrează perfect sub chiuvetă. Vezi procesul de montaj pas cu pas.</p>',
     video: 'NPfIE4AtHnc', steps: installSteps},
    {kind: 'cta', title: 'Ești gata pentru schimbare?', cta_label: 'Testează apa acum', cta_link: `ref:pagini:${ids.testare}`}
  ], src('/despre-noi/'));
  const perks = [
    benefit('Construiești schimbare în comunitate', 'Ajuți familiile din jurul tău să descopere o soluție sigură și sustenabilă pentru apa de zi cu zi.', 'users', src('/ambassadors/', 'Un program creat pentru oameni care inspiră încredere')),
    benefit('Primești recompense pentru recomandări autentice', 'Pentru fiecare achiziție făcută prin codul tău primești un comision, conform condițiilor programului.', 'gift', src('/ambassadors/', 'Un program creat pentru oameni care inspiră încredere')),
    benefit('Nu există obiective sau presiuni', 'Recomanzi doar când și cui vrei: fără ținte de vânzări și fără obligații.', 'shield', src('/ambassadors/', 'Un program creat pentru oameni care inspiră încredere')),
    benefit('Faci parte dintr-o mișcare pentru apă mai bună', 'Alături de oameni care cred în impactul apei curate asupra vieții de zi cu zi.', 'drop', src('/ambassadors/', 'Un program creat pentru oameni care inspiră încredere'))
  ];
  // Înscrierea în program: pagina ei, cu formularul și răspunsurile la întrebările viitorilor ambasadori.
  const J = AMBASSADOR_JOIN;
  const joinSrc = src('/ambassadors/', 'Purapa Ambassadors');
  const joinFaqs = J.faqs.map(([question, answer], i) => c('intrebari', {question, answer, position: 200 + i}, joinSrc));
  ids['devino-ambasador'] = page(J.page, [
    {...J.form, benefits: J.perks.map(([t, x, ic]) => benefit(t, x, ic, joinSrc)), steps: J.next.map(([t, x]) => step(t, x, joinSrc))},
    {...J.faq, faqs: joinFaqs}
  ], joinSrc);
  const amb = {};
  for (const [key, data] of Object.entries({
    hero: {kind: 'hero', kicker: 'Purapa Ambassadors', title: 'Alătură-te *comunității*',
      text: '<p>Un program dedicat celor care cred în impactul apei curate asupra vieții de zi cu zi și vor să ducă această schimbare mai departe.</p>',
      cta_label: 'Devino ambasador', cta_link: `ref:pagini:${ids['devino-ambasador']}`,
      facts: '3 pași | ca să începi\ncomision | la fiecare achiziție\nzero | obiective impuse'},
    about: {kind: 'text', kicker: 'Despre program', title: 'Un mod simplu și natural de a contribui la *binele celor din jur*',
      text: '<p>Programul Purapa Ambassadors reunește oameni care aleg să împărtășească beneficiile apei filtrate celor dragi.</p>',
      facts: 'Cine participă | Studenți, creatori și oameni activi în comunitățile lor.\nCe faci | Recomanzi autentic, din experiența ta, iar familiile descoperă o soluție sigură și sustenabilă pentru apa de zi cu zi.\nCe primești | Un comision pentru fiecare achiziție făcută prin codul tău, conform condițiilor programului.',
      note: 'Fără presiune, fără obiective impuse, fără obligații.'},
    steps: {kind: 'pasi', theme: 'deschis', kicker: 'Cum funcționează', title: 'Trei pași, de la înscriere la *recompensă*', steps: ambSteps},
    // Ilustrația comunității vine din import, pe secțiunea cu acest titlu (ca pe site-ul vechi).
    why: {kind: 'beneficii', theme: 'inchis', kicker: 'De ce să te alături', title: 'Un program creat pentru oameni care *inspiră încredere*',
      text: '<p>Potrivit pentru oricine își dorește să recomande cu naturalețe un produs valoros:</p><ul><li>studenți</li><li>tineri profesioniști</li><li>creatori de conținut</li><li>oameni activi în comunitatea lor</li></ul>',
      benefits: perks},
    cta: {kind: 'cta', kicker: 'Purapa Ambassadors', title: 'Te invităm să te alături *comunității*',
      text: '<p>Completează formularul de înscriere și îți spunem care sunt următorii pași.</p>', cta_label: 'Fii ambasador Purapa', cta_link: `ref:pagini:${ids['devino-ambasador']}`}
  })) amb[key] = c('sectiuni', data, src('/ambassadors/'));
  store.update(user, 'sectiuni', amb.hero, {cta2_label: 'Cum funcționează', cta2_link: `ref:sectiuni:${amb.steps}`}, {source: src('/ambassadors/')});
  store.setLinks(user, 'pagini', ids.ambassadors, 'sections', Object.values(amb));
  sec(ids.contact, [{kind: 'contact', title: 'Contact', note: 'Întreabă-ne despre *Purapa*'}], src('/contact/'));

  // Trimiterea testului rapid (aplicația de la /test-rapid/ de pe site-ul vechi): aceeași adresă, buton în meniu.
  const photoTips = [
    ['Lumină bună, fără umbre', 'Fotografiază banda în lumină naturală sau albă, fără umbre peste ea.'],
    ['Imagine clară', 'Asigură-te că fotografia e în focus și că fundalul e neutru.'],
    ['Banda lângă scală', 'Așază banda perfect paralel, lângă scala de culori de pe ambalaj.'],
    ['Toate pătrățelele vizibile', 'Toți cei 16 indicatori colorați trebuie să se vadă și să fie aliniați.']
  ].map(([t, x]) => step(t, `<p>${x}</p>`, src('/test-rapid/', 'Instrucțiuni foto')));
  ids['test-rapid'] = page({title: 'Trimite testul', slug: 'test-rapid', menu_label: 'Trimite testul', menu_order: 8, menu_style: 'buton',
    seo_title: 'Trimite testul rapid Purapa – analiza digitală a apei',
    seo_description: 'Încarcă fotografia benzii de testare și primești pe loc interpretarea celor 16 parametri, plus raportul complet pe email.'},
  [{kind: 'trimite-test', theme: 'deschis', kicker: 'Test rapid Purapa', title: 'Trimite *testul* pentru analiză',
    text: '<p>Completează datele de contact, apoi încarcă fotografia benzii. Vezi rezultatul pe loc, iar raportul detaliat îl primești pe email.</p>',
    note: 'Testul oferă o evaluare orientativă a calității apei, pe baza unui screening chimic rapid, și nu detectează bacterii sau alte microorganisme. Valorile sunt calculate automat din fotografie, așa că lumina, unghiul sau camera pot da rezultate ușor diferite față de ce se vede pe bandă. Pentru confirmare și rezultate oficiale, recomandăm un laborator acreditat.',
    steps: photoTips}], src('/test-rapid/'));

  // Blogul (nou, nu exista pe site-ul vechi): pagina cu lista articolelor. Rămâne nepublicată până apar primele articole.
  const blogList = c('sectiuni', {kind: 'articole', kicker: 'Blog Purapa', title: 'Despre *apa* din casa ta',
    text: '<p>Ghiduri practice despre apa de la robinet și din fântână: ce conține, cum o testezi și ce soluție i se potrivește.</p>'});
  ids.blog = c('pagini', {title: 'Blog', slug: 'blog', menu_label: 'Blog', menu_order: 5, footer: 'firma',
    seo_title: 'Blog Purapa – ghiduri despre apa de acasă',
    seo_description: 'Ghiduri despre apa de la robinet și din fântână: testare, duritate, clor, filtre și dedurizatoare.',
    sections: [blogList]}, undefined, false);

  return ids;
}
