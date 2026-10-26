# purapa

Brain /manage și site-ul nou pentru purapa.ro. Pornire, structură și import: [README.md](README.md).

## Git

- Repo: https://github.com/toma776/purapa (public), ramura `main`.
- După fiecare modificare terminată: `npm test`, apoi commit cu un mesaj în română care spune ce s-a schimbat și de ce, apoi `git push`. Nu lăsa modificări necomise la finalul unui răspuns.
- Un hook „Stop” (`.claude/hooks/auto-push.sh`, din `.claude/settings.local.json`) urcă oricum ce a rămas necomis, dar doar dacă testele trec; e o plasă de siguranță, nu înlocuiește commiturile cu mesaj.
- Vercel publică singur fiecare push pe `main` (purapa-six.vercel.app). Baza nu e în git: o sincronizează `npm start` cu Blob-ul online (`src/core/blobsync.mjs`). Pentru scrieri de test online folosește `node` cu `fetch`, nu `curl`, care strică diacriticele în Git Bash.
- Nu intră în git: `data/` (baza și imaginile importate) și `reference/snapshot/` (conținutul site-ului vechi și al Portalia). Se refac cu `npm run import`.
