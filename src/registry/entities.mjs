// Registrul entităților: singurul loc în care se declară un tip (standard §0.9, §1.1).
// Din el derivă tabelele, cheile străine, tabelele de legătură, validarea, harta și „Unde apare”.

const pagePath = r => r.slug === '' ? '/' : r.slug ? `/${r.slug}/` : null;

export const ENTITIES = [
  {
    key: 'firma', table: 'company', label: 'Date firmă', one: 'Date firmă',
    category: 'firma', color: '#5b6b7a', singleton: true, noStatus: true, title: 'brand',
    fields: [
      {key: 'brand', label: 'Brand', type: 'text', required: true},
      {key: 'logo_id', label: 'Logo', type: 'image'},
      {key: 'legal_name', label: 'Denumire', type: 'text', required: true},
      {key: 'cui', label: 'CUI', type: 'text'},
      {key: 'reg_com', label: 'Nr. Reg. Com.', type: 'text'},
      {key: 'street', label: 'Stradă și număr', type: 'text'},
      {key: 'building', label: 'Clădire', type: 'text'},
      {key: 'city', label: 'Localitate', type: 'text'},
      {key: 'county', label: 'Județ', type: 'text'},
      {key: 'phone', label: 'Telefon', type: 'phone', required: true},
      {key: 'email', label: 'Email', type: 'email', required: true},
      {key: 'hours', label: 'Program', type: 'text'},
      {key: 'response_time', label: 'Timp de răspuns', type: 'text'},
      {key: 'tagline', label: 'Mesaj subsol', type: 'textarea'}
    ]
  },
  {
    key: 'retele', table: 'socials', label: 'Rețele sociale', one: 'Rețea socială',
    category: 'firma', color: '#5b6b7a', noStatus: true, title: 'platform',
    fields: [
      {key: 'platform', label: 'Platformă', type: 'select', options: ['Facebook', 'YouTube', 'TikTok', 'Instagram', 'LinkedIn'], required: true},
      {key: 'url', label: 'Adresă', type: 'url', required: true, unique: true},
      {key: 'handle', label: 'Cont', type: 'text'},
      {key: 'position', label: 'Ordine', type: 'int'}
    ]
  },
  {
    key: 'retaileri', table: 'retailers', label: 'Unde se cumpără', one: 'Retailer',
    category: 'catalog', color: '#8a5a2b', title: 'name',
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true},
      {key: 'url', label: 'Site', type: 'url'},
      {key: 'search_url', label: 'Căutare produse Purapa', type: 'url'}
    ]
  },
  {
    key: 'categorii', table: 'categories', label: 'Categorii', one: 'Categorie',
    category: 'catalog', color: '#8a5a2b', title: 'name',
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, max: 80},
      {key: 'slug', label: 'Identificator', type: 'slug', from: 'name'},
      {key: 'position', label: 'Ordine', type: 'int'}
    ]
  },
  {
    key: 'etape', table: 'filter_stages', label: 'Etapele filtrării', one: 'Etapă',
    category: 'tehnologie', color: '#2f74c4', title: 'name', mentions: true,
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true},
      {key: 'microns', label: 'Prag (µm)', type: 'number'},
      {key: 'retains', label: 'Ce reține', type: 'textarea'},
      {key: 'text', label: 'Descriere', type: 'richtext'},
      {key: 'position', label: 'Ordine', type: 'int'}
    ]
  },
  {
    key: 'produse', table: 'products', label: 'Produse', one: 'Produs',
    category: 'catalog', color: '#1f9e8f', thumb: 'image_id', title: 'name', mentions: true,
    // Produsele nu au pagină proprie: linkul duce la retailer.
    external: r => r.buy_url || null,
    linkFields: ['name', 'buy_url'],
    duplicates: {keys: ['extern_id'], normalize: ['name']},
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true, max: 200, list: true},
      {key: 'slug', label: 'Identificator', type: 'slug', from: 'name'},
      {key: 'summary', label: 'Descriere scurtă', type: 'textarea'},
      {key: 'description', label: 'Descriere', type: 'richtext'},
      {key: 'price', label: 'Preț (lei)', type: 'money', list: true},
      {key: 'list_price', label: 'Preț tăiat (lei)', type: 'money'},
      {key: 'availability', label: 'Disponibilitate', type: 'select', options: ['în stoc', 'stoc limitat', 'la comandă', 'indisponibil']},
      {key: 'image_id', label: 'Imagine', type: 'image'},
      {key: 'buy_url', label: 'Link de cumpărare', type: 'url'},
      {key: 'extern_id', label: 'ID extern', type: 'text', unique: true, intern: true},
      {key: 'capacity_l', label: 'Capacitate (L)', type: 'int'},
      {key: 'lifetime_months', label: 'Durată de folosire (luni)', type: 'int'},
      {key: 'specs', label: 'Specificații', type: 'table'},
      {key: 'position', label: 'Ordine', type: 'int'},
      {key: 'category_id', label: 'Categorie', type: 'ref', target: 'categorii', rel: 'face parte din', inverseLabel: 'Produse'},
      {key: 'retailer_id', label: 'Retailer', type: 'ref', target: 'retaileri', rel: 'se vinde la', inverseLabel: 'Produse'},
      {key: 'cartridges', label: 'Cartușe', type: 'refs', target: 'produse', ordered: true,
       rel: 'folosește cartușele', inverseLabel: 'Se potrivește cu',
       only: (rec, target, store) => store.get('categorii', target.category_id)?.slug === 'cartuse'},
      {key: 'stages', label: 'Etape acoperite', type: 'refs', target: 'etape', rel: 'acoperă etapa', inverseLabel: 'Produse'},
      {key: 'parameters', label: 'Parametri măsurați', type: 'refs', target: 'parametri', ordered: true,
       rel: 'măsoară', inverseLabel: 'Măsurat de'}
    ]
  },
  {
    key: 'parametri', table: 'parameters', label: 'Parametrii testului', one: 'Parametru',
    category: 'tehnologie', color: '#c0392b', title: 'name', mentions: true, approval: true,
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true},
      {key: 'symbol', label: 'Simbol', type: 'text'},
      {key: 'indicates', label: 'Ce indică', type: 'textarea'},
      {key: 'position', label: 'Ordine', type: 'int'},
      {key: 'recommends', label: 'Se rezolvă cu', type: 'refs', target: 'produse',
       rel: 'se rezolvă cu', inverseLabel: 'Recomandat pentru', sensitive: true}
    ]
  },
  {
    key: 'intrebari', table: 'faqs', label: 'Întrebări frecvente', one: 'Întrebare',
    category: 'continut', color: '#7d5ba6', title: 'question', approval: true,
    fields: [
      {key: 'question', label: 'Întrebare', type: 'text', required: true},
      {key: 'answer', label: 'Răspuns', type: 'richtext', required: true},
      {key: 'position', label: 'Ordine', type: 'int'},
      {key: 'products', label: 'Despre produsele', type: 'refs', target: 'produse', rel: 'despre', inverseLabel: 'Întrebări'},
      {key: 'stages', label: 'Despre etapele', type: 'refs', target: 'etape', rel: 'despre', inverseLabel: 'Întrebări'}
    ]
  },
  {
    key: 'beneficii', table: 'benefits', label: 'Beneficii', one: 'Beneficiu',
    category: 'continut', color: '#7d5ba6', title: 'title', hub: false, noStatus: true,
    fields: [
      {key: 'title', label: 'Titlu', type: 'text', required: true},
      {key: 'text', label: 'Text', type: 'textarea'},
      {key: 'icon', label: 'Iconiță', type: 'text'}
    ]
  },
  {
    key: 'pasi', table: 'steps', label: 'Pași', one: 'Pas',
    category: 'continut', color: '#7d5ba6', title: 'title', hub: false, noStatus: true,
    fields: [
      {key: 'title', label: 'Titlu', type: 'text', required: true},
      {key: 'text', label: 'Text', type: 'richtext'}
    ]
  },
  {
    key: 'media', table: 'media', label: 'Media', one: 'Fișier',
    category: 'media', color: '#999999', title: 'alt', noStatus: true,
    fields: [
      {key: 'src', label: 'Fișier', type: 'text', required: true},
      {key: 'alt', label: 'Text alternativ', type: 'text'},
      {key: 'sha1', label: 'Amprentă', type: 'text', unique: true, intern: true, readonly: true},
      {key: 'width', label: 'Lățime', type: 'int'},
      {key: 'height', label: 'Înălțime', type: 'int'}
    ]
  },
  {
    key: 'sectiuni', table: 'sections', label: 'Secțiuni', one: 'Secțiune',
    category: 'site', color: '#444444', title: 'title', hub: false, noStatus: true,
    // Un link spre o secțiune e o ancoră pe pagina ei (#s-<id>, id-ul titlului secțiunii).
    anchor: r => `#s-${r.id}`,
    fields: [
      {key: 'kind', label: 'Tip', type: 'select', required: true,
       options: ['hero', 'beneficii', 'produse', 'test', 'tehnologie', 'pasi', 'intrebari', 'text', 'contact', 'cta']},
      {key: 'theme', label: 'Fundal', type: 'select', options: ['alb', 'deschis', 'inchis']},
      {key: 'kicker', label: 'Supratitlu', type: 'text', max: 60},
      {key: 'title', label: 'Titlu (*cuvinte* = evidențiate)', type: 'text'},
      {key: 'text', label: 'Text', type: 'richtext'},
      {key: 'cta_label', label: 'Buton principal', type: 'text'},
      {key: 'cta_link', label: 'Destinație buton principal', type: 'text'},
      {key: 'cta2_label', label: 'Buton secundar', type: 'text'},
      {key: 'cta2_link', label: 'Destinație buton secundar', type: 'text'},
      {key: 'image_id', label: 'Imagine', type: 'image'},
      {key: 'category_id', label: 'Categorie afișată', type: 'ref', target: 'categorii', rel: 'afișează categoria', inverseLabel: 'Secțiuni', kinds: ['produse']},
      {key: 'products', label: 'Produse', type: 'refs', target: 'produse', ordered: true, rel: 'afișează', inverseLabel: 'Secțiuni', kinds: ['produse', 'hero']},
      {key: 'benefits', label: 'Beneficii', type: 'refs', target: 'beneficii', ordered: true, owned: true, rel: 'conține', inverseLabel: 'Secțiuni', kinds: ['beneficii']},
      {key: 'steps', label: 'Pași', type: 'refs', target: 'pasi', ordered: true, owned: true, rel: 'conține', inverseLabel: 'Secțiuni', kinds: ['pasi']},
      {key: 'faqs', label: 'Întrebări', type: 'refs', target: 'intrebari', ordered: true, rel: 'afișează', inverseLabel: 'Secțiuni', kinds: ['intrebari']},
      {key: 'stages', label: 'Etape', type: 'refs', target: 'etape', ordered: true, rel: 'afișează', inverseLabel: 'Secțiuni', kinds: ['tehnologie']},
      {key: 'parameters', label: 'Parametri', type: 'refs', target: 'parametri', ordered: true, rel: 'afișează', inverseLabel: 'Secțiuni', kinds: ['test']}
    ]
  },
  {
    key: 'pagini', table: 'pages', label: 'Pagini', one: 'Pagină',
    category: 'site', color: '#444444', title: 'title',
    public: {path: pagePath},
    linkFields: ['title', 'slug', 'menu_label'],
    fields: [
      {key: 'title', label: 'Titlu', type: 'text', required: true, list: true},
      {key: 'slug', label: 'Adresă', type: 'slug', from: 'title', allowEmpty: true},
      {key: 'menu_label', label: 'Etichetă în meniu', type: 'text'},
      {key: 'menu_order', label: 'Poziție în meniu', type: 'int'},
      {key: 'footer', label: 'În subsol', type: 'select', options: ['firma', 'legal']},
      {key: 'seo_title', label: 'Titlu SEO', type: 'text', max: 70},
      {key: 'seo_description', label: 'Descriere SEO', type: 'textarea', max: 170},
      {key: 'sections', label: 'Secțiuni', type: 'refs', target: 'sectiuni', ordered: true, owned: true, rel: 'conține', inverseLabel: 'Pagina'}
    ]
  },
  {
    key: 'cereri', table: 'messages', label: 'Mesaje de contact', one: 'Mesaj',
    category: 'operational', color: '#999999', title: 'subject', noStatus: true, operational: true, standalone: true, creatable: false,
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true},
      {key: 'email', label: 'Email', type: 'email', required: true},
      {key: 'phone', label: 'Telefon', type: 'phone'},
      {key: 'subject', label: 'Subiect', type: 'text', required: true},
      {key: 'message', label: 'Mesaj', type: 'textarea', required: true}
    ]
  },
  {
    key: 'teste', table: 'water_tests', label: 'Teste trimise', one: 'Test',
    category: 'operational', color: '#999999', title: 'name', noStatus: true, operational: true, standalone: true, creatable: false,
    fields: [
      {key: 'name', label: 'Nume', type: 'text', required: true},
      {key: 'email', label: 'Email', type: 'email', required: true},
      {key: 'phone', label: 'Telefon', type: 'phone'},
      {key: 'location', label: 'Locația probei', type: 'text'},
      {key: 'photo_id', label: 'Fotografia testului', type: 'image'},
      {key: 'consent_contact', label: 'Acceptă contactul', type: 'boolean'},
      {key: 'results', label: 'Rezultate', type: 'table'}
    ]
  }
];

export const byKey = Object.fromEntries(ENTITIES.map(d => [d.key, d]));

export const JSON_TYPES = new Set(['table', 'list', 'links', 'multiselect', 'texts']);
export const RESERVED_SLUGS = new Set(['manage', 'api', 'media', 'admin', 'wp-admin', 'wp-json', 'feed', 'sitemap.xml', 'robots.txt']);

export const relFields = d => d.fields.filter(f => f.type === 'refs');
export const relTable = (d, f) => `rel_${d.table}_${f.key}`;
export const titleOf = (d, rec) => rec ? String(rec[d.title] ?? `${d.one} #${rec.id}`) : '';
export const publicPath = (d, rec) => rec ? d.public?.path(rec) ?? null : null;
export const linkFieldsOf = d => d.linkFields ?? [d.title];

// Fiecare relație e declarată o singură dată, din capătul care o deține; inversa se calculează.
export const RELATION_TYPES = ENTITIES.flatMap(d => d.fields
  .filter(f => f.type === 'ref' || f.type === 'refs' || f.type === 'image')
  .map(f => ({
    id: `${d.key}.${f.key}`, source: d.key, field: f.key, target: f.target ?? 'media',
    verb: f.rel ?? (f.type === 'image' ? 'are imaginea' : f.label), inverseLabel: f.inverseLabel ?? d.label,
    cardinality: f.type === 'refs' ? 'M:N' : 'N:1', required: !!f.required,
    storage: f.type === 'refs' ? relTable(d, f) : `${d.table}.${f.key}`,
    sensitive: !!f.sensitive, owned: !!f.owned
  })));

export const inverseRelations = key => RELATION_TYPES.filter(r => r.target === key);
