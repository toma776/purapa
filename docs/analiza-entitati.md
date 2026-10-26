# purapa.ro — analiza site-ului și registrul propus

**26 octombrie 2026** · pasul 2 din checklistul [standardului Brain /manage](../../../Downloads/standard-brain-manage.md) (§6)

## 1. Ce e site-ul acum

- **Next.js**, randat pe server, cu `/admin/` și `/api/` proprii (blocate în `robots.txt`). Nu există un CMS clasic din care să importăm (nici wp-json, nici Payload): importul pornește din HTML, iar prețurile vin din Portalia.
- **Nu vinde direct.** Termenii spun că site-ul „nu procesează comenzi online”. Fiecare „Cumpără acum” trimite la Portalia (`portalia.ro/…-p<ID>/`), iar „Comandă Acum” trimite la căutarea `portalia.ro/search/purapa/`.
- **Operatorul:** Instant Softnet SRL, CUI RO 25383246, J40/4285/2009.

**Adresele publice**

| Adresă | În sitemap | Conținut |
|---|---|---|
| `/` | da | hero, 4 beneficii, test, calculator de economii, tehnologia în 2 etape, impact ecologic, 5 întrebări frecvente |
| `/produse/` | da | 9 produse, fiecare cu prețul și linkul spre Portalia |
| `/testare-apa/` | da | testul rapid: de ce, 5 pași, 16 parametri |
| `/despre-noi/` | da | brand, misiune, filtrarea în 2 etape, instalarea |
| `/contact/` | da | date de contact, program, formular |
| `/test-rapid/` | **nu** | aplicația testului (pasul 1: date de contact și consimțăminte; pasul 2: fotografia testului) |
| `/ambassadors/` | **nu** | programul de ambasadori: 3 pași, contact |
| `/termeni-si-conditii`, `/politica-de-confidentialitate`, `/politica-de-cookie` | da | texte legale |

## 2. Registrul propus

### Entități

| `key` | Etichetă | Câmpuri principale | Opțiuni | Câte sunt azi |
|---|---|---|---|---|
| `firma` | Date firmă | denumire, CUI, Reg. Com., adresă, telefon, email, program, timp de răspuns, înființare | `singleton`, `noStatus` | 1 |
| `retele` | Rețele sociale | platformă, URL, cont | `noStatus` | 3 (Facebook, YouTube, TikTok) |
| `produse` | Produse | nume, slug, preț, imagine, descriere, specificații (`table`), capacitate L, microni, durată de folosire, `extern_id` (`portalia:p651`), link de cumpărare | `mentions`, `duplicates` (nume normalizat + `extern_id`), `linkFields: [name, slug, price]` | 9 |
| `categorii` | Categorii de produse | nume, slug, ordine | — | 0 pe site (propun 6: Filtrare, Cartușe, Dedurizare, Testare, Dozatoare, Accesorii) |
| `retaileri` | Unde se cumpără | nume, URL de căutare | — | 1 (Portalia) + „alți parteneri autorizați” |
| `etape-filtrare` | Etapele filtrării | nume, prag (µm), ce reține, descriere | `mentions` | 2 |
| `parametri` | Parametrii testului | nume, simbol, ce indică, sursa obișnuită, praguri | `mentions`, `approval` (afirmații despre sănătate) | 16 |
| `intrebari` | Întrebări frecvente | întrebare, răspuns (`richtext`) | `approval` | 5 |
| `beneficii` | Beneficii | titlu, text, iconiță | `hub: false` (prin secțiuni) | 4 + 3 ecologice |
| `pasi` | Pași | titlu, text, ordine | `hub: false` | 5 (testare) + 3 (ambasadori) |
| `pagini` + `sectiuni` | Pagini | titlu, slug, SEO, secțiuni tipizate (hero, beneficii, produse, test, calculator, tehnologie, ecologic, întrebări, CTA, text) | `sectiuni` cu `hub: false` | 10 |
| `media` | Media | fișier, alt, amprentă | — | ~15 |
| `cereri` | Mesaje de contact | nume, email, telefon, subiect, mesaj | `operational`, `standalone` | — |
| `teste` | Teste trimise | client, locație, fotografie, rezultate pe parametri, consimțăminte | `operational`, `standalone`, date personale | — |

### Relații

| Sursă → țintă | Câmp | `rel` / `inverseLabel` | Note |
|---|---|---|---|
| produse → categorii | `ref` | „face parte din” / „Produse” | |
| produse → retaileri | `refs` | „se vinde la” / „Produse” | `attrs: [url, extern_id]` |
| produse → produse | `refs` `cartuse` | „folosește cartușele” / „Se potrivește cu” | kit → OK36M + PP 5 µm; filtrul `only`: doar categoria Cartușe |
| produse → etape-filtrare | `refs` | „acoperă etapa” / „Produse” | PP 5 µm → Prefiltrare; OK36M → Microfiltrare |
| produse (testul) → parametri | `refs` | „măsoară” / „Măsurat de” | test rapid → 16 parametri; E.Coli O157 → un parametru nou |
| parametri → produse | `refs` `recomandari` | „se rezolvă cu” / „Recomandat pentru” | `sensitive` (afirmație de sănătate); aici apar legăturile deduse |
| intrebari → produse / etape | `refs` | „despre” / „Întrebări” | |
| sectiuni → produse, intrebari, beneficii, pasi | `refs` cu `kinds` | — | homepage: kitul vedetă, 5 întrebări |
| teste → parametri | `refs` cu `attrs: [valoare, stare]` | „a măsurat” / „Teste” | `owned` |

### Jetoane (valori scrise o singură dată)

Valorile acestea sunt scrise de mână pe mai multe pagini. Toate devin trimiteri:

| Jeton | Sursa | Apare azi în |
|---|---|---|
| `{telefon}`, `{email}`, `{adresa}`, `{program}` | `firma` | antet sau subsol (toate paginile), contact, termeni |
| `{capacitate}` = 11.000 L | `produse:kit` / OK36M | homepage (×2), produse, întrebări frecvente |
| `{durata}` = 12 luni | `produse:OK36M` | homepage, întrebări frecvente |
| 5 µm / 0,5 µm | `etape-filtrare` | homepage, despre-noi, produse |
| `{nr_parametri}` = 16 | numărul de parametri ai testului | homepage, testare-apa, produse |
| preț | `produse.price` | produse (azi scris static; Portalia e sursa reală) |

## 3. Ce intră din prima zi în „De făcut”

Probleme găsite la analiză, în ordinea impactului:

1. **Mare — adresa are trei forme:** „Str. Răsăritului nr. 90, Buftea” (subsol), „…, Buftea, Ilfov” (contact) și „Str. Rasaritului nr. 90, hala C2, Buftea, jud. Ilfov” (termeni). Trebuie stabilită forma corectă în Date firmă; restul devin `{adresa}`.
2. **Mare — sitemap-ul folosește `www.purapa.ro`, dar site-ul răspunde direct pe `purapa.ro`.** Lipsesc `/test-rapid/` și `/ambassadors/`, iar adresele din sitemap sunt fără bară finală, deși linkurile interne au bară. Trebuie aleasă o singură formă canonică, iar cealaltă primește 301 (§3.8).
3. **Mare — prețurile sunt copii ale celor din Portalia.** Fără sincronizare (ID extern stabil `portalia:p<ID>`, §1.2), un preț schimbat în Portalia rămâne vechi pe site.
4. **Mediu — afirmațiile despre sănătate** (bacterii, plumb, nitrați) nu au sursă. Propun `approval: true` pe întrebări și parametri și o relație parametru → produs `sensitive`.
5. **Mediu — „Telefon Suport” și „Telefon Direct”** sunt același număr; la fel cele două emailuri. Fie le unim, fie le facem canale de contact distincte.
6. **Mic — termenii:** secțiunile sunt numerotate 9, 11, 10, iar data actualizării lipsește, deși textul o promite. Lipsesc și linkurile ANPC/SOL (de verificat cu juristul).
7. **Mic — homepage-ul promovează kitul fără să-i afișeze numele sau prețul.** Cu kitul ca entitate legată de secțiune, numele și prețul apar singure.
8. **Mic — imaginile produselor:** 7 vin de pe portalia.ro, iar 2 sunt locale. La import, toate intră în `media`, cu amprentă.

## 4. Surse pentru import (§1.3)

- `site`: cele 10 pagini de mai sus, salvate în `reference/snapshot/`;
- `endpoint`: paginile de produs din Portalia (preț, specificații, imagini), cu cheia `portalia:p651` etc.;
- `manual`: ce nu e pe site, dar trebuie (de exemplu pragurile parametrilor și categoriile), cu certitudinea `unverified` până la confirmare.

## 5. Întrebări deschise

- Rămâne Portalia singurul loc de cumpărare, sau vine un magazin propriu? Dacă vine, apar `comenzi` și `stoc`.
- Rezultatele testului rapid (aplicația) intră în Brain? Atunci `teste` e entitate cu date personale (GDPR, retenție) și sursă pentru recomandări.
- Ambasadorii: au coduri și comisioane urmărite aici? Atunci apar `ambasadori` și `coduri`.
- Calculatorul de economii: valorile implicite (preț pe litru îmbuteliat etc.) devin setări editabile?
