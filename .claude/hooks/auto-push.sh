#!/usr/bin/env bash
# Hook „Stop” (plasă de siguranță): la finalul unui răspuns, dacă au rămas modificări necomise,
# rulează testele, face commit și push pe origin/main. Dacă testele pică, nu urcă nimic.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ "$(git branch --show-current)" = "main" ] || exit 0

msg() { printf '{"systemMessage":"%s"}\n' "$1"; }

if [ -n "$(git status --porcelain)" ]; then
  if ! npm test --silent >/dev/null 2>&1; then
    msg "Purapa: testele pică, deci modificările NU au fost urcate pe GitHub."
    exit 0
  fi
  files=$(git status --porcelain | sed 's/^...//' | head -4 | paste -sd ',' - | sed 's/,/, /g')
  git add -A
  git commit -q -m "Actualizare: ${files}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || exit 0
fi

ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
if [ "$ahead" -gt 0 ]; then
  if git push -q origin main 2>/dev/null; then
    msg "Purapa: ${ahead} commit(uri) urcate pe GitHub."
  else
    msg "Purapa: push-ul pe GitHub a eșuat; modificările sunt doar local."
  fi
fi
exit 0
