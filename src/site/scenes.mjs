// Scene: imagini tăiate în felii după contururile figurilor, ca feliile să se poată mișca una față de alta.
// Cheia e numele fișierului din media (hash-ul conținutului): dacă imaginea e înlocuită în Brain, scena nu se mai
// aplică și imaginea nouă apare simplă, întreagă. Coordonatele sunt în pixelii imaginii originale.
// `origin` e punctul în jurul căruia se rotește felia (gâtul, pentru un cap). Mișcarea fiecărei felii: site.css, .fx-part-<nume>.
export const SCENES = {
  // „Comunitatea Purapa Ambassadors”: femeia și bărbatul așezat își strâng mâna, iar cel din picioare îl bate pe umăr.
  '631161fb96315ca23d76bc7eaab4224d41f179ec.webp': {
    width: 682, height: 1024,
    parts: [
      {name: 'woman', origin: [140, 455],
        points: '100,228 150,216 205,225 238,262 240,300 250,350 238,385 228,415 200,428 180,440 172,462 105,452 85,440 50,438 18,410 15,370 40,310 65,262'},
      {name: 'standing', origin: [550, 330],
        points: '398,118 430,100 500,82 555,90 585,112 612,140 620,175 612,215 592,262 602,300 600,322 560,345 520,352 503,345 494,312 455,312 435,298 425,272 418,252 402,244 404,222 414,200 410,165 398,145'},
      {name: 'seated', origin: [548, 605],
        points: '446,412 470,392 520,385 570,398 604,430 620,475 612,520 586,566 596,598 590,612 545,630 510,640 500,600 480,598 455,585 446,555 424,535 422,515 440,490 446,450'},
      {name: 'hands', origin: [275, 785],
        points: '190,700 260,725 300,728 340,745 365,770 410,790 415,885 370,870 340,850 300,842 255,835 215,805 185,790 150,770 140,720'},
      {name: 'pat', origin: [682, 640],
        points: '570,612 600,596 650,596 682,612 682,662 640,680 600,680 575,662'}
    ]
  }
};
