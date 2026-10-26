# purapa — Brain /manage

Brain-ul pentru purapa.ro, construit după **standardul Brain /manage v1**: Node 24, `node:sqlite`, fără dependențe.
Analiza site-ului și registrul propus sunt în [docs/analiza-entitati.md](docs/analiza-entitati.md).

```bash
npm run import             # crawl purapa.ro + Portalia → analyze → import → scan (data/purapa.db)
npm run import -- --offline   # din snapshot-ul existent, fără rețea
npm start                  # site: http://localhost:3100/ · panou: http://localhost:3100/manage/ · baza se sincronizează singură cu cea online
npm test                   # 36 de teste: propagare (§5), /manage, import
npm run blob:sync          # o sincronizare a bazei acum, cu serverul oprit (de obicei nu e nevoie)
npm run blob:upload -- --force    # doar în situații speciale: baza locală peste cea online
npm run blob:download -- --force  # doar în situații speciale: baza online peste cea locală (cea locală rămâne în data/backup/)
npm run deploy             # publicare manuală pe Vercel (de obicei nu e nevoie: fiecare push pe main publică singur)
npm run export             # varianta statică în dist/ (fără panou); npm run deploy:static o publică
```

La prima pornire nu există conturi: panoul e deschis fără parolă **doar de pe localhost**, până creezi primul administrator (din /manage/login/ sau din Utilizatori). După aceea, autentificarea e obligatorie peste tot.

## Online (Vercel)

Site-ul și panoul sunt pe **https://purapa-six.vercel.app**, cu panoul la [`/manage/`](https://purapa-six.vercel.app/manage/). Rulează același cod ca local (`api/index.mjs`), după modelul Nixodor.

- **Baza** (`purapa.db`) stă într-un **Blob privat** (`purapa-brain`, Frankfurt). Fiecare instanță o ține în `/tmp` și o reîncarcă doar când i se schimbă ETag-ul.
- **După o salvare din panou** rulează propagarea, iar baza se urcă înapoi condiționat. Dacă între timp a salvat altcineva, panoul primește „Reîncarcă și salvează din nou”, deci nu se pierde nimic.
- **Imaginile** de la import sunt statice, în `public/media` (`npm run build:public`).

**Panoul e deschis oricui, fără parolă:** variabila de mediu `MANAGE_OPEN=1` din Vercel, cerută explicit. Oricine are adresa poate modifica sau șterge conținut, iar schimbarea apare imediat pe site. Ca să-l închizi, șterge `MANAGE_OPEN` din Vercel (Settings → Environment Variables) și redeployează. Atunci panoul cere login, iar contul de administrator se creează local și se urcă cu baza (`npm run blob:upload`).

## Fluxul de lucru: totul automat

Lucrezi local (conținut, cod, design), iar restul se face singur:

- **Codul și designul** se comit și se urcă pe GitHub (`toma776/purapa`) după fiecare modificare. Vercel e legat de repo și publică automat fiecare push pe `main`.
- **Conținutul** (baza) se sincronizează cât rulează `npm start`, la fiecare 5 secunde (`SYNC_SECONDS`):
  - ce modifici local ajunge online;
  - ce s-a schimbat online (formularul de contact, panoul online) vine local, iar serverul redeschide baza fără repornire.

  Dacă baza s-a modificat în ambele locuri în același timp, rămâne varianta locală. Cea online e salvată în `data/backup/`, iar panoul afișează o bandă de avertizare.
- **Imaginile noi** din `data/media` se copiază în `public/media` și pleacă pe Vercel odată cu codul.

Cheia Blob vine local cu `npx vercel env pull .env.local` (fișierul nu intră în git). Fără ea, baza rămâne doar locală. Ultima stare sincronizată stă în `data/.blob-sync.json`.

Cât timp purapa.ro e încă site-ul vechi, toate paginile au `x-robots-tag: noindex`, ca să nu concureze cu el în Google.

**Adresele:** `purapa.vercel.app` e un proiect al altcuiva. Adresa noastră publică e `purapa-six.vercel.app`, iar `purapa-dwf3.vercel.app` cere login Vercel.

**Planul:** echipa DWF e pe planul Hobby, iar Vercel nu permite uz comercial pe Hobby. Pentru purapa.ro live e nevoie de Pro.

## Importul (§1.3)

| Etapă | Fișier | Ce face |
|---|---|---|
| crawl | `src/import/crawl.mjs` | sitemap + linkurile descoperite + paginile de produs de la Portalia + galeriile (1000 px) → `reference/snapshot/` cu `manifest.json` |
| analyze | `src/import/analyze.mjs` | rapoarte JSON în `reference/analysis/` (pagini, produse, firmă, contacte, rețele, texte legale, constatări); nu scrie în bază |
| import | `src/import/apply.mjs` | o singură tranzacție; potrivire pe chei naturale (`portalia:p651`, slug, platformă); sursa fiecărui câmp, cu fișierul din snapshot; refuz peste editările oamenilor și peste ciornele lor (`--overwrite-edits`); verificare dus-întors; `values:link` |
| scan | `src/core/sync.mjs` | randează tot și rescrie dependențele |

Ce s-a importat de pe purapa.ro (26.10.2026):
- prețurile, prețurile tăiate și disponibilitatea de la Portalia, plus 9 imagini;
- datele firmei din termeni, cu forma cu diacritice a adresei;
- textele legale întregi (179 de blocuri, identice la recitire), cu 41 de valori transformate în jetoane;
- descrierile produselor și meta-descrierile paginilor.

Constatările importului ajung în **Panou → De făcut**. Pe 26.10.2026 au fost 8:
- **Prețuri greșite pe site:** kitul apare la 1.800 lei, dar acesta e prețul tăiat; prețul real e 1.199 lei. Dedurizatorul de 9L apare la 1.699 lei, dar se vinde la 2.000.
- **Adresa** apare în 3 forme.
- **Sitemap-ul** trimite la `www.`, dar site-ul răspunde fără, iar `/test-rapid/` și `/ambassadors/` lipsesc din el.
- **Nicio pagină nu are `canonical`.**
- **Datele structurate** (`sameAs`) trimit la un Facebook și un Instagram care nu apar în subsol.
- **Termenii** au secțiunile numerotate 9, 11, 10.

## /manage

| Pagina | Ce are |
|---|---|
| Panou | De făcut (cu impact și link la câmp), starea propagării, „Reia” pentru eșecuri, ce așteaptă aprobare, ultimele modificări cu paginile refăcute și motivul |
| Entități | lista pe tipuri, lista cu „Apare în”; taburile Prezentare (impact, observații, mini-hartă), Detalii (formular din registru, ciornă / publicare, 409 la versiune veche, `?camp=`), Relații (din ambele capete, ordine, confirmare, 🔒 pe relațiile sensibile), Surse (cu confirmare), Unde apare (4 niveluri + „apare după publicare”), Istoric |
| Harta | tipuri pe categorii (√n, hover, perechi posibile) → membri (cei mai conectați primii, câte 40) → entitate (intrări / ieșiri, stări, pagini); traseu, sănătate, „Toate legăturile”, panoul relației, straturi, filtre, „Drumul tău” |
| Legături de verificat | grupate pe relație și dovadă, cu recomandare și încredere; confirmare sau scoatere în masă într-o tranzacție, cu un singur eveniment; respingerile se țin minte |
| Surse, Utilizatori | sursele cu certitudinea lor; conturi cu roluri (admin, editor, viewer) |

**Autentificare:** parole scrypt; tokenul de sesiune e stocat doar ca hash; cookie `HttpOnly`, `SameSite=Lax` (`Secure` în spatele HTTPS); 5 încercări greșite în 15 minute dau 429. Scrierile din alt site sunt refuzate, iar dreptul se verifică pe server, la fiecare cerere.

## Ce urmează

1. **Constatările de mai sus** sunt decizii de conținut: prețul corect, adresa canonică, `www` sau nu, rețelele.
2. **Detectarea la salvare** (§1.6 a, valori → jetoane), dublurile și `merge` (§1.7), aliasurile învățate.
3. **Redirecționările ca entitate** (§5.7), valabilitatea și publicarea programată (§3.7), SSE între utilizatori (§3.11), backup (§3.12), revenirea din Istoric.
4. **Sincronizarea periodică cu Portalia**, prin `cron/tick` + `import --offline` pe un snapshot proaspăt.
