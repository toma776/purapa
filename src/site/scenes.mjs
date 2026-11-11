// Scene: imagini tăiate în felii după contururile figurilor, ca feliile să se poată mișca una față de alta.
// Cheia e numele fișierului din media (hash-ul conținutului): dacă imaginea e înlocuită în Brain, scena nu se mai
// aplică și imaginea nouă apare simplă, întreagă. Coordonatele sunt în pixelii imaginii originale.
// Pentru fiecare felie:
//   points  conturul feliei (cu câțiva pixeli de fundal în jur);
//   origin  punctul în jurul căruia se rotește (gâtul, pentru un cap);
//   patch   peticul de dedesubt: acoperă figura din imaginea de bază cu culoarea fundalului din jurul ei, ca atunci când
//           felia se mișcă să nu rămână o dublură în urmă. Nu acoperă locul de îmbinare (gâtul, mâneca);
//   fill    culoarea de rezervă a peticului: o culoare sau un gradient [x1, y1, culoare, x2, y2, culoare]. În browser,
//           site.js o înlocuiește cu fundalul întins din jurul peticului, calculat din imagine;
//   blur    cât de moale e marginea feliei (implicit 3).
// Mișcarea fiecărei felii: site.css, .fx-part-<nume>.
export const SCENES = {
  // „Comunitatea Purapa Ambassadors”: femeia și bărbatul așezat își strâng mâna, iar cel din picioare îl bate pe umăr.
  '631161fb96315ca23d76bc7eaab4224d41f179ec.webp': {
    width: 682, height: 1024,
    parts: [
      {name: 'woman', origin: [140, 455],
        points: '100,228 150,216 205,225 238,262 240,300 250,350 238,385 228,415 200,428 180,440 172,462 105,452 85,440 50,438 18,410 15,370 40,310 65,262',
        patch: '100,228 150,216 205,225 238,262 240,300 250,350 238,385 228,415 205,425 150,425 95,438 50,438 18,410 15,370 40,310 65,262',
        fill: [8, 0, '#deebf8', 250, 0, '#f4f7fd']},
      {name: 'standing', origin: [550, 330],
        points: '398,118 430,100 500,82 555,90 585,112 612,140 620,175 612,215 592,262 602,300 600,322 560,345 520,352 503,345 494,312 455,312 435,298 425,272 418,252 402,244 404,222 414,200 410,165 398,145',
        patch: '398,118 430,100 500,82 555,90 585,112 612,140 620,175 612,215 592,262 596,285 500,300 455,312 435,298 425,272 418,252 402,244 404,222 414,200 410,165 398,145',
        fill: '#f4f7fd'},
      {name: 'seated', origin: [548, 605],
        points: '446,412 470,392 520,385 570,398 604,430 620,475 612,520 586,566 596,598 590,612 545,630 510,640 500,600 480,598 455,585 446,555 424,535 422,515 440,490 446,450',
        patch: '446,412 470,392 520,385 570,398 604,430 620,475 612,520 586,566 585,580 500,590 480,598 455,585 446,555 424,535 422,515 440,490 446,450',
        fill: [410, 0, '#b0cfeb', 632, 0, '#86b4de']},
      {name: 'hands', origin: [275, 785], blur: 8,
        points: '190,700 260,725 300,728 340,745 365,770 410,790 415,885 370,870 340,850 300,842 255,835 215,805 185,790 150,770 140,720',
        patch: '203,742 250,727 300,725 340,740 354,772 352,805 338,838 300,848 252,842 212,812 200,785',
        fill: '#e3eff9'},
      {name: 'pat', origin: [682, 640],
        points: '570,612 600,596 650,596 682,612 682,662 640,680 600,680 575,662',
        patch: '578,615 600,601 650,601 682,613 682,660 640,675 600,675 581,660',
        fill: [575, 600, '#80afd9', 682, 680, '#5a92c6']}
    ]
  }
};
