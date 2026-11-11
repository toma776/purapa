// Tutorialul de montaj animat: aceeași narațiune ca filmarea de pe YouTube, redată ca scene ilustrate (SVG),
// în stilul imaginilor site-ului: albastru monocrom, forme moi, umbre difuze, cercuri de lumină.
// Textul fiecărui pas vine din Brain (entitatea „pasi”); aici e doar desenul scenei, ales prin câmpul `scene`.
// Mișcarea e în CSS (clasele t-*), iar ritmul scenei e --T (durata ei); fără JavaScript, scenele stau una sub alta.

// Culorile ilustrațiilor (aceeași familie ca imaginea Ambassadors și ca tokenurile site-ului).
const C = {deep: '#1f428c', main: '#3a6dbd', mid: '#6f9fd8', soft: '#a9c6ea', pale: '#d6e5f7', mist: '#eaf2fc', white: '#ffffff', water: '#2aa6e0'};

// Gradientele, o singură dată pe pagină; scenele le folosesc prin id.
export const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="tg-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f9fe"/><stop offset="1" stop-color="#d9e7f7"/></linearGradient>
  <linearGradient id="tg-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fa9e0"/><stop offset="1" stop-color="#3f73c0"/></linearGradient>
  <linearGradient id="tg-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f80c8"/><stop offset="1" stop-color="#22488f"/></linearGradient>
  <linearGradient id="tg-light" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eef5fd"/><stop offset="1" stop-color="#c9dcf2"/></linearGradient>
  <linearGradient id="tg-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e4effc" stop-opacity=".95"/><stop offset=".5" stop-color="#f7fbff" stop-opacity=".8"/><stop offset="1" stop-color="#b8d2f0" stop-opacity=".95"/></linearGradient>
  <linearGradient id="tg-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ddcf8"/><stop offset="1" stop-color="#2aa6e0"/></linearGradient>
  <linearGradient id="tg-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#86acdf"/><stop offset="1" stop-color="#4f7fc4"/></linearGradient>
  <radialGradient id="tg-glow"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <mask id="tg-jaw"><rect x="-80" y="-80" width="160" height="160" fill="#fff"/><rect x="-90" y="-17" width="62" height="34" rx="4" fill="#000"/></mask>
</defs></svg>`;

const svg = (label, inner) => `<svg viewBox="0 0 1600 900" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
// Pozițiile: `at(x, y, s)` mută (și scalează); animațiile stau pe un grup interior, ca pivotul să fie originea desenului.
const at = (x, y, s = 1, inner = '', extra = '') => `<g transform="translate(${x} ${y})${s !== 1 ? ` scale(${s})` : ''}"${extra}>${inner}</g>`;
const anim = (cls, inner, d = 0, more = '') => `<g class="${cls}" style="--d:calc(var(--T) * ${d})${more}">${inner}</g>`;
const shadow = (w, y = 0) => `<ellipse cx="0" cy="${y}" rx="${w}" ry="${w * .12}" fill="${C.deep}" opacity=".12"/>`;

// Fundalul comun: lumină difuză, cercuri și un val, ca în ilustrația Ambassadors.
function bg(v = 0) {
  const circles = [[[260, 210, 190], [1360, 690, 260], [1180, 130, 70]], [[1340, 220, 210], [240, 720, 240], [520, 120, 60]], [[800, 820, 320], [150, 160, 120], [1450, 200, 90]]][v % 3];
  return `<rect width="1600" height="900" fill="url(#tg-bg)"/>
    ${circles.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i === 2 ? C.pale : C.white}" opacity="${i === 2 ? .7 : .55}"/>`).join('')}
    <path d="M0 ${640 + v * 20} C 300 ${560 + v * 15}, 520 ${760 - v * 10}, 860 ${690 + v * 10} S 1380 ${600 - v * 10}, 1600 ${660 + v * 12} V900 H0Z" fill="${C.pale}" opacity=".55"/>`;
}

// Interiorul dulapului de sub chiuvetă, în perspectivă frontală.
function cabinet() {
  return `<rect width="1600" height="900" fill="#e3edf9"/>
    <polygon points="0,0 1600,0 1400,110 200,110" fill="#d3e2f4"/>
    <polygon points="0,0 200,110 200,800 0,900" fill="#cbdcf1"/>
    <polygon points="1600,0 1400,110 1400,800 1600,900" fill="#c5d8ef"/>
    <polygon points="0,900 200,800 1400,800 1600,900" fill="#b9cfec"/>
    <rect x="200" y="110" width="1200" height="690" fill="url(#tg-bg)"/>
    <circle cx="1180" cy="230" r="150" fill="#fff" opacity=".45"/><circle cx="380" cy="640" r="190" fill="#fff" opacity=".35"/>
    <path d="M590 110 H1010 V190 Q1010 250 950 250 H650 Q590 250 590 190Z" fill="url(#tg-light)" stroke="${C.soft}" stroke-width="3"/>
    <rect x="782" y="250" width="36" height="46" rx="6" fill="${C.soft}"/>`;
}

// Robinetul de colț (apă rece / caldă), cu mânerul ca pivot propriu.
function valve(cold = true, handle = '') {
  return `<circle cx="0" cy="12" r="38" fill="${C.pale}" stroke="${C.soft}" stroke-width="3"/>
    <rect x="-16" y="-50" width="32" height="34" rx="5" fill="url(#tg-dark)"/>
    <rect x="-28" y="-22" width="56" height="62" rx="16" fill="url(#tg-light)" stroke="${C.soft}" stroke-width="3"/>
    ${at(44, 10, 1, handle || valveHandle(cold))}
    <g transform="translate(0 92)"><rect x="-44" y="-17" width="88" height="34" rx="17" fill="${cold ? C.main : C.white}" stroke="${cold ? 'none' : C.soft}" stroke-width="2"/>
    <text x="0" y="7" text-anchor="middle" font-size="19" font-weight="700" letter-spacing="1.5" fill="${cold ? '#fff' : C.main}">${cold ? 'RECE' : 'CALDĂ'}</text></g>`;
}
const valveHandle = (cold = true) => `<rect x="-14" y="-8" width="20" height="16" rx="4" fill="${C.soft}"/><ellipse cx="14" cy="0" rx="22" ry="30" fill="${cold ? 'url(#tg-dark)' : 'url(#tg-body)'}"/>`;

// Capacul prefiltrului (cu cele două racorduri laterale) și corpul transparent, cu cartușul plisat.
function preHead(ports = true) {
  return `<rect x="-120" y="0" width="240" height="72" rx="20" fill="url(#tg-dark)"/>
    <rect x="-96" y="10" width="192" height="10" rx="5" fill="#fff" opacity=".18"/>
    ${ports ? `<rect x="-158" y="22" width="38" height="28" rx="6" fill="url(#tg-body)"/><rect x="120" y="22" width="38" height="28" rx="6" fill="url(#tg-body)"/>` : ''}
    <rect x="-106" y="72" width="212" height="30" rx="9" fill="url(#tg-body)"/>`;
}
function preBowl() {
  return `<path d="M-96 100 H96 V398 Q96 442 52 442 H-52 Q-96 442 -96 398Z" fill="url(#tg-glass)" stroke="${C.soft}" stroke-width="3"/>
    <rect x="-56" y="124" width="112" height="296" rx="16" fill="#f8fbff"/>
    ${Array.from({length: 9}, (_, i) => `<line x1="${-44 + i * 11}" y1="136" x2="${-44 + i * 11}" y2="408" stroke="${C.pale}" stroke-width="4"/>`).join('')}
    <rect x="-96" y="150" width="20" height="230" rx="10" fill="#fff" opacity=".7"/>`;
}
// Suportul prefiltrului: placa de deasupra capacului, cu patru găuri pentru șuruburi.
function preBracket() {
  return `<rect x="-150" y="-46" width="300" height="46" rx="12" fill="url(#tg-body)"/>
    ${[-110, -40, 40, 110].map(x => `<circle cx="${x}" cy="-23" r="9" fill="${C.deep}" opacity=".45"/>`).join('')}`;
}

// Capul cartușului de microfiltrare, cu suportul lui, și cartușul (capsulă albă cu banda de marcă).
function microHead(ports = true) {
  return `<rect x="-90" y="-44" width="180" height="40" rx="10" fill="url(#tg-body)"/>
    <circle cx="-62" cy="-24" r="8" fill="${C.deep}" opacity=".45"/><circle cx="62" cy="-24" r="8" fill="${C.deep}" opacity=".45"/>
    <rect x="-70" y="0" width="140" height="64" rx="16" fill="url(#tg-dark)"/>
    ${ports ? `<rect x="-100" y="22" width="30" height="26" rx="6" fill="url(#tg-body)"/><rect x="70" y="22" width="30" height="26" rx="6" fill="url(#tg-body)"/>` : ''}`;
}
function microCart() {
  return `<rect x="-56" y="64" width="112" height="400" rx="56" fill="url(#tg-light)" stroke="${C.soft}" stroke-width="3"/>
    <rect x="-56" y="210" width="112" height="70" fill="url(#tg-body)"/>
    <path d="M0 226 C 10 240, 16 248, 16 256 A16 16 0 0 1 -16 256 C -16 248, -10 240, 0 226Z" fill="#fff"/>
    <rect x="-42" y="90" width="14" height="340" rx="7" fill="#fff" opacity=".8"/>`;
}

// Fitingul: piuliță hexagonală + filet; `tape` îl arată izolat cu bandă.
function fitting(tape = false) {
  return `<rect x="22" y="-15" width="70" height="30" rx="5" fill="${C.pale}" stroke="${C.soft}" stroke-width="2"/>
    ${Array.from({length: 6}, (_, i) => `<line x1="${32 + i * 10}" y1="-15" x2="${28 + i * 10}" y2="15" stroke="${C.soft}" stroke-width="3"/>`).join('')}
    ${tape ? `<rect x="24" y="-17" width="66" height="34" rx="6" fill="#fff" opacity=".9"/>` : ''}
    <polygon points="-30,0 -15,-27 15,-27 30,0 15,27 -15,27" fill="url(#tg-dark)"/>
    <polygon points="-15,-27 15,-27 22,-14 -22,-14" fill="#fff" opacity=".18"/>
    <rect x="-62" y="-12" width="34" height="24" rx="5" fill="url(#tg-body)"/>`;
}
const screw = () => `<rect x="-5" y="0" width="10" height="34" rx="3" fill="${C.soft}"/><circle cx="0" cy="0" r="13" fill="url(#tg-dark)"/><line x1="-7" y1="0" x2="7" y2="0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;

// Cheia reglabilă: falca e originea (pivotul rotirii), mânerul pleacă spre dreapta.
function wrench() {
  return `<g mask="url(#tg-jaw)"><circle r="54" fill="url(#tg-dark)"/></g>
    <rect x="34" y="-21" width="300" height="42" rx="21" fill="url(#tg-body)"/>
    <rect x="200" y="-7" width="110" height="14" rx="7" fill="${C.deep}" opacity=".35"/>
    <rect x="44" y="-30" width="34" height="18" rx="4" fill="${C.soft}"/>`;
}
// Cheia prefiltrului (inelul din kit), pivot în centrul inelului.
function ringKey() {
  return `<circle r="120" fill="none" stroke="url(#tg-body)" stroke-width="30"/>
    ${Array.from({length: 8}, (_, i) => `<rect x="-10" y="-136" width="20" height="22" rx="4" fill="${C.deep}" opacity=".5" transform="rotate(${i * 45})"/>`).join('')}
    <rect x="128" y="-24" width="230" height="48" rx="24" fill="url(#tg-dark)"/>`;
}
// Săgeata de rotire (arc punctat cu vârf), ca indicație de mișcare.
const turnArrow = (r = 70, rot = 0) => `<g transform="rotate(${rot})"><path d="M ${r} 0 A ${r} ${r} 0 0 1 ${-r * .5} ${r * .87}" fill="none" stroke="${C.main}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16"/>
  <path d="M ${-r * .5 - 18} ${r * .87 - 14} L ${-r * .5 + 6} ${r * .87 + 2} L ${-r * .5 - 22} ${r * .87 + 18}" fill="none" stroke="${C.main}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const drop = (s = 1) => `<path transform="scale(${s})" d="M0 -40 C 16 -18, 28 -4, 28 10 A28 28 0 0 1 -28 10 C -28 -4, -16 -18, 0 -40Z" fill="url(#tg-water)"/>`;
const sparkle = (s = 1) => `<path transform="scale(${s})" d="M0 -22 Q4 -4 22 0 Q4 4 0 22 Q-4 4 -22 0 Q-4 -4 0 -22Z" fill="#fff"/>`;
const tube = (d, cls = 't-draw', delay = 0, len = .22) =>
  `<g class="${cls}" style="--d:calc(var(--T) * ${delay});--len:calc(var(--T) * ${len})"><path d="${d}" pathLength="1" fill="none" stroke="${C.soft}" stroke-width="22" stroke-linecap="round"/>
  <path d="${d}" pathLength="1" fill="none" stroke="#f7fbff" stroke-width="12" stroke-linecap="round"/></g>`;
// Robinetul chiuvetei, cu jetul de apă (animat cu liniuțe care curg).
function faucet(water = false) {
  return `<rect x="-60" y="0" width="120" height="26" rx="10" fill="url(#tg-dark)"/>
    <rect x="-26" y="-130" width="52" height="134" rx="18" fill="url(#tg-light)" stroke="${C.soft}" stroke-width="3"/>
    <path d="M0 -118 C 0 -230, 190 -236, 196 -120" fill="none" stroke="${C.soft}" stroke-width="40" stroke-linecap="round"/>
    <path d="M0 -118 C 0 -230, 190 -236, 196 -120" fill="none" stroke="#f3f8fe" stroke-width="28" stroke-linecap="round"/>
    <rect x="-14" y="-170" width="90" height="22" rx="11" fill="url(#tg-dark)" transform="rotate(-18 -10 -160)"/>
    ${water ? `<rect x="182" y="-104" width="28" height="330" rx="14" fill="url(#tg-water)" opacity=".9"/>
      <line class="t-stream" x1="196" y1="-100" x2="196" y2="222" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="18 34" opacity=".75"/>` : ''}`;
}

// Scenele, în ordinea narațiunii. Fiecare primește eticheta (titlul pasului) și întoarce SVG-ul.
const KIT = [
  ['Cartuș de microfiltrare', at(0, -150, .62, microCart())],
  ['Prefiltru', at(0, -150, .55, preHead() + preBowl())],
  ['Cartuș de prefiltrare', at(0, -10, .62, `<rect x="-56" y="-150" width="112" height="296" rx="16" fill="#f8fbff" stroke="${C.soft}" stroke-width="3"/>${Array.from({length: 9}, (_, i) => `<line x1="${-44 + i * 11}" y1="-138" x2="${-44 + i * 11}" y2="134" stroke="${C.pale}" stroke-width="4"/>`).join('')}`)],
  ['Suport microfiltrare', at(0, -10, .9, microHead())],
  ['Suport prefiltru', at(0, 10, .6, preBracket())],
  ['Cheie prefiltru', at(-40, 0, .38, ringKey())],
  ['Furtun', at(0, 0, 1, `<circle r="70" fill="none" stroke="${C.soft}" stroke-width="18"/><circle r="46" fill="none" stroke="${C.soft}" stroke-width="18"/><circle r="70" fill="none" stroke="#f7fbff" stroke-width="9"/><circle r="46" fill="none" stroke="#f7fbff" stroke-width="9"/>`)],
  ['Fitinguri și reductoare', at(-30, -20, .9, fitting()) + at(-10, 40, .7, fitting())],
  ['Set de șuruburi', [-40, 0, 40].map(x => at(x, -20, 1.3, screw())).join('')]
];

export const TUTORIAL_SCENES = {
  intro: label => svg(label, `${bg(0)}<circle cx="800" cy="430" r="330" fill="url(#tg-glow)"/>
    ${at(800, 770, 1, shadow(420))}
    ${at(640, 250, 1, anim('t-rise', anim('t-float', preHead() + preBowl()), .02))}
    ${at(960, 230, 1, anim('t-rise', anim('t-float', microHead() + microCart(), 0, ';animation-delay:-1.5s'), .12))}
    ${[[430, 300, .9, .2], [1180, 210, .6, .3], [1210, 560, .75, .4], [470, 620, .5, .5]].map(([x, y, s, d]) => at(x, y, s, anim('t-pop', anim('t-float', drop()), d))).join('')}
    ${[[540, 180, .25], [1080, 120, .35], [1300, 420, .45]].map(([x, y, d]) => at(x, y, 1, anim('t-twinkle', sparkle(), d))).join('')}`),

  kit: label => svg(label, `${bg(1)}${KIT.map(([name, art], i) => {
    const row = i < 5 ? 0 : 1, col = row ? i - 5 : i, x = row ? 380 + col * 280 : 240 + col * 280, y = row ? 610 : 270;
    return at(x, y, 1, anim('t-pop', `<rect x="-120" y="-150" width="240" height="290" rx="34" fill="#fff" opacity=".88"/>
      <rect x="-120" y="-150" width="240" height="290" rx="34" fill="none" stroke="${C.pale}" stroke-width="3"/>${at(0, -20, 1, art)}
      <text x="0" y="112" text-anchor="middle" font-size="22" font-weight="600" fill="${C.deep}">${name}</text>`, .03 + i * .085));
  }).join('')}`),

  izolare: label => svg(label, `${bg(2)}<circle cx="760" cy="470" r="300" fill="url(#tg-glow)"/>
    ${at(720, 470, 3.2, `${fitting()}<g class="t-wrap" style="--d:calc(var(--T) * .25);--len:calc(var(--T) * .5)"><rect x="24" y="-17" width="66" height="34" rx="6" fill="#fff"/></g>`)}
    ${at(1150, 300, 1, anim('t-pop', `<circle r="92" fill="#fff" stroke="${C.pale}" stroke-width="4"/><circle r="64" fill="none" stroke="#f1f6fd" stroke-width="30"/><circle r="38" fill="url(#tg-body)"/>`, .05))}
    <g class="t-draw" style="--d:calc(var(--T) * .2);--len:calc(var(--T) * .3)"><path d="M1090 368 C 1020 430, 960 430, 920 445" pathLength="1" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round"/></g>
    ${at(1000, 470, 1.2, anim('t-pop', turnArrow(150, -60), .3))}`),

  capac: label => svg(label, `${bg(0)}<circle cx="800" cy="460" r="320" fill="url(#tg-glow)"/>
    ${at(800, 820, 1, shadow(260))}
    ${at(800, 470, 1.6, `${preHead()}${anim('t-drop', preBracket(), .05)}
      ${[-110, -40, 40, 110].map((x, i) => at(x, -60, 1, anim('t-drop', screw(), .3 + i * .12))).join('')}`)}
    ${at(1210, 330, 1, anim('t-pop', turnArrow(56), .35))}
    <g class="t-pop" style="--d:calc(var(--T) * .3)"><rect x="1150" y="560" width="190" height="78" rx="39" fill="#fff"/><text x="1245" y="612" text-anchor="middle" font-size="40" font-weight="700" fill="${C.main}">× 4</text></g>`),

  'cheie-prefiltru': label => svg(label, `${bg(1)}<circle cx="760" cy="430" r="330" fill="url(#tg-glow)"/>
    ${at(760, 330, 1.7, `${preHead()}${at(-210, 36, 1, anim('t-slide-l', `<g transform="scale(-1 1)">${fitting(true)}</g>`, .05))}${at(210, 36, 1, anim('t-slide-r', fitting(true), .2))}`)}
    ${at(1117, 391, 1, anim('t-pop', at(0, 0, 1, anim('t-turn', `<g transform="rotate(62)">${wrench()}</g>`, .4)), .35))}`),

  'suport-micro': label => svg(label, `${bg(2)}<circle cx="800" cy="440" r="320" fill="url(#tg-glow)"/>
    ${at(800, 360, 2, `${microHead()}${at(-150, 35, 1, anim('t-slide-l', `<g transform="scale(-1 1)">${fitting(true)}</g>`, .1))}${at(150, 35, 1, anim('t-slide-r', fitting(true), .25))}`)}
    ${at(1100, 430, 1, anim('t-pop', at(0, 0, 1, anim('t-turn', `<g transform="rotate(62)">${wrench()}</g>`, .45)), .4))}
    ${at(470, 520, 1, anim('t-pop', `<circle r="70" fill="#fff" stroke="${C.pale}" stroke-width="4"/><circle r="48" fill="none" stroke="#f1f6fd" stroke-width="22"/><circle r="28" fill="url(#tg-body)"/>`, .05))}`),

  perete: label => svg(label, `${cabinet()}
    ${at(980, 340, 1, anim('t-mount', microHead(false) + microCart(), .05))}
    ${[-62, 62].map((x, i) => at(980 + x, 316, 1, anim('t-pop', screw(), .45 + i * .15))).join('')}
    ${at(980, 300, 1, anim('t-pop', `<circle r="150" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="4 18" opacity=".9"/>`, .4))}`),

  'perete-prefiltru': label => svg(label, `${cabinet()}
    ${at(1150, 340, .8, microHead() + microCart())}
    ${at(700, 340, .8, anim('t-mount', preBracket() + preHead() + preBowl(), .05))}
    ${[-110, -40, 40, 110].map((x, i) => at(700 + x * .8, 318, .8, anim('t-pop', screw(), .4 + i * .1))).join('')}`),

  'apa-rece': label => svg(label, `${cabinet()}
    ${at(800, 250, 1, `<path d="M-60 0 C -80 160, -260 230, -330 380" fill="none" stroke="${C.soft}" stroke-width="16"/>`)}
    ${at(470, 630, 1, anim('t-unscrew', `<path d="M0 -40 C 0 -160, 120 -230, 260 -380" fill="none" stroke="${C.soft}" stroke-width="16" stroke-linecap="round"/><rect x="-18" y="-46" width="36" height="30" rx="6" fill="url(#tg-dark)"/>`, .25))}
    ${at(470, 700, 1.25, valve(true, `<g class="t-close" style="--d:calc(var(--T) * .05)">${valveHandle(true)}</g>`))}
    ${at(1130, 700, 1.25, valve(false))}
    ${at(470, 700, 1, anim('t-pulse', `<circle r="130" fill="none" stroke="${C.main}" stroke-width="6" opacity=".5"/>`, .35))}
    ${at(1300, 300, 1, anim('t-pop', `<rect x="-150" y="-60" width="300" height="120" rx="30" fill="#fff"/><circle cx="-90" cy="0" r="30" fill="${C.main}"/>
      <path d="M-90 -18 V18 M-106 -9 L-74 9 M-106 9 L-74 -9" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <text x="-44" y="-6" font-size="26" font-weight="700" fill="${C.deep}">Doar pe</text><text x="-44" y="28" font-size="26" font-weight="700" fill="${C.main}">apa rece</text>`, .45))}`),

  racord: label => svg(label, `${bg(0)}<circle cx="720" cy="480" r="320" fill="url(#tg-glow)"/>
    ${at(620, 620, 1.9, valve(true))}
    ${at(620, 470, 1.9, anim('t-screw', `<g transform="rotate(-90)">${fitting(true)}</g>`, .05))}
    ${at(1080, 300, 1.2, anim('t-slide-r', `<path d="M0 0 C 120 0, 200 80, 230 220" fill="none" stroke="${C.soft}" stroke-width="22" stroke-linecap="round"/>${at(0, 0, 1, `<g transform="scale(-1 1)">${fitting(true)}</g>`)}`, .45))}
    ${at(860, 430, 1, anim('t-pop', at(0, 0, 1, anim('t-turn', `<g transform="rotate(10)">${wrench()}</g>`, .2)), .15))}`),

  furtun: label => svg(label, `${cabinet()}
    <path d="M760 250 C 740 330, 520 330, 480 452" fill="none" stroke="${C.soft}" stroke-width="16"/>${at(480, 466, 1, `<rect x="-18" y="-16" width="36" height="30" rx="6" fill="url(#tg-dark)"/>`)}
    ${at(650, 360, .8, microHead() + microCart())}
    ${at(1000, 360, .8, preBracket() + preHead() + preBowl())}
    ${at(1250, 690, 1, valve(true))}
    ${tube('M570 388 C 540 388, 520 470, 480 470', 't-draw', .04)}
    ${tube('M872 388 C 822 450, 780 450, 730 388', 't-draw', .37)}
    ${tube('M1250 640 C 1250 520, 1200 388, 1128 388', 't-draw', .68)}
    ${[[525, 520, .02], [800, 480, .35], [1290, 520, .66]].map(([x, y, d]) => at(x, y, 1, anim('t-snip', `<circle r="34" fill="#fff"/><path d="M-12 -14 L14 12 M-12 14 L14 -12" stroke="${C.main}" stroke-width="5" stroke-linecap="round"/><circle cx="-16" cy="-17" r="7" fill="none" stroke="${C.main}" stroke-width="4"/><circle cx="-16" cy="17" r="7" fill="none" stroke="${C.main}" stroke-width="4"/>`, d))).join('')}
    ${['M1250 640 C 1250 520, 1200 388, 1128 388', 'M872 388 C 822 450, 780 450, 730 388', 'M570 388 C 540 388, 520 470, 480 470']
      .map(d => `<g class="t-flowin" style="--d:calc(var(--T) * .92)"><path class="t-stream" d="${d}" fill="none" stroke="${C.water}" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 22"/></g>`).join('')}`),

  cartuse: label => svg(label, `${cabinet()}
    ${at(650, 340, .8, `${microHead()}${anim('t-rise', microCart(), .05)}`)}
    ${at(1000, 340, .8, `${preBracket()}${preHead()}${anim('t-rise', preBowl(), .25)}`)}
    ${at(1000, 560, .8, anim('t-pop', anim('t-turn-key', ringKey(), .65), .55))}
    ${[[650, 780, .05], [1000, 780, .25]].map(([x, y, d]) => at(x, y, 1, anim('t-pop', `<path d="M0 30 V-30 M-18 -12 L0 -30 L18 -12" fill="none" stroke="${C.main}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`, d))).join('')}`),

  porneste: label => svg(label, `${bg(1)}<circle cx="700" cy="420" r="320" fill="url(#tg-glow)"/>
    <rect x="300" y="620" width="1000" height="40" rx="20" fill="url(#tg-body)" opacity=".5"/>
    <path d="M460 640 H1020 Q1020 780 900 780 H580 Q460 780 460 640Z" fill="url(#tg-light)" stroke="${C.soft}" stroke-width="3"/>
    ${at(560, 600, 1.2, anim('t-flowin', faucet(true), .1))}${at(560, 600, 1.2, `<g class="t-hide" style="--d:calc(var(--T) * .1)">${faucet(false)}</g>`)}
    ${at(1220, 330, 1, anim('t-pop', `<circle r="120" fill="#fff"/><circle r="92" fill="none" stroke="${C.pale}" stroke-width="16"/>
      <g transform="rotate(-90)"><circle class="t-timer" r="92" pathLength="1" fill="none" stroke="${C.main}" stroke-width="16" stroke-linecap="round" style="--d:calc(var(--T) * .1);--len:calc(var(--T) * .8)"/></g>
      <text x="0" y="6" text-anchor="middle" font-size="44" font-weight="800" fill="${C.deep}">1–2</text><text x="0" y="44" text-anchor="middle" font-size="22" font-weight="600" fill="${C.main}">minute</text>`, .05))}`),

  gata: label => svg(label, `${bg(2)}<circle cx="820" cy="430" r="360" fill="url(#tg-glow)"/>
    ${anim('t-rise', `<path d="M520 900 C 520 700, 600 610, 760 600 C 920 610, 1010 690, 1020 900Z" fill="url(#tg-skin)"/>
      <rect x="730" y="520" width="64" height="100" rx="30" fill="#5f8cce"/>
      <ellipse cx="770" cy="430" rx="104" ry="120" fill="url(#tg-skin)"/>
      <path d="M672 420 C 650 300, 760 250, 840 290 C 900 320, 900 380, 870 400 C 850 350, 790 340, 740 360 C 700 380, 690 420, 672 420Z" fill="#2f5ea9"/>
      <ellipse cx="700" cy="450" rx="18" ry="26" fill="#5f8cce"/>
      <path d="M842 470 Q 858 486, 878 474" fill="none" stroke="#2f5ea9" stroke-width="5" stroke-linecap="round"/>
      <path d="M940 900 C 950 780, 990 700, 1040 640" fill="none" stroke="url(#tg-skin)" stroke-width="70" stroke-linecap="round"/>`, .02)}
    ${at(1050, 520, 1, anim('t-rise', `<path d="M-50 0 H50 L40 150 Q38 166 22 166 H-22 Q-38 166 -40 150Z" fill="url(#tg-glass)" stroke="${C.soft}" stroke-width="4"/>
      <path d="M-45 50 H45 L40 150 Q38 166 22 166 H-22 Q-38 166 -40 150Z" fill="url(#tg-water)" opacity=".85"/><rect x="-38" y="20" width="10" height="120" rx="5" fill="#fff" opacity=".6"/>
      <ellipse cx="34" cy="148" rx="34" ry="22" fill="url(#tg-skin)"/>`, .12))}
    ${[[1180, 330, .3], [1260, 480, .45], [600, 250, .55], [1130, 210, .65]].map(([x, y, d]) => at(x, y, 1, anim('t-twinkle', sparkle(1.2), d))).join('')}
    ${[[1250, 640, .8, .35], [420, 520, .6, .5]].map(([x, y, s, d]) => at(x, y, s, anim('t-pop', anim('t-float', drop()), d))).join('')}`)
};
export const SCENE_KEYS = Object.keys(TUTORIAL_SCENES);

// Durata unui pas, din lungimea narațiunii: cât să poată fi citită liniștit (aprox. 2,6 cuvinte pe secundă), între 5 și 22 de secunde.
export const sceneSeconds = text => {
  const words = String(text ?? '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(22, Math.max(5, 2.5 + words / 2.6)) * 10) / 10;
};
