#!/bin/bash
# Release the newest due scheduled build over the live site.
# Installed into the public repo as .github/release.sh by publish.sh and run
# there by .github/workflows/release.yml; core/scripts/schedule-test.js runs
# it against two local repos.
#
#   HOLDING  checkout of the private holding repo (releases/<stamp>/ folders)
#   SITE     checkout of the public site repo (default: .)
#   STAMP    release this folder now, whatever the time (workflow_dispatch input)
#   NOW      override the clock, as a stamp (tests)
#
# A stamp is the release instant in UTC, 2026-09-18T08-00-00Z: fixed width, so
# "is it due" is a string comparison. Prints released=<stamp> (or empty) and
# writes the same to $GITHUB_OUTPUT when there is one.
set -euo pipefail
HOLDING="${HOLDING:?HOLDING (the holding checkout) is required}"
SITE="${SITE:-.}"
NOW="${NOW:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
BRANCH="${BRANCH:-main}"

due=()
if [ -d "$HOLDING/releases" ]; then
  for d in "$HOLDING"/releases/*/; do
    [ -d "$d" ] || continue
    s=$(basename "$d")
    if [ -n "${STAMP:-}" ]; then
      [ "$s" = "$STAMP" ] && due+=("$s")
    elif [[ "$s" < "$NOW" || "$s" = "$NOW" ]]; then
      due+=("$s")
    fi
  done
fi

if [ ${#due[@]} -eq 0 ]; then
  if [ -n "${STAMP:-}" ]; then echo "No release folder named $STAMP." >&2; exit 1; fi
  echo "Nothing due at $NOW."
  echo "released="
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "released=" >> "$GITHUB_OUTPUT"
  exit 0
fi

# the newest due one is the site as it should be now; anything older among
# them was superseded by it (every release folder is a whole build)
pick="${due[${#due[@]}-1]}"
echo "Releasing $pick (due: ${due[*]})"

rsync -a --delete --exclude='.git' --exclude='.github' --exclude='.release.json' \
  "$HOLDING/releases/$pick/" "$SITE/"

source=$(sed -n 's/^ *"source": *"\([0-9a-f]*\)".*/\1/p' "$HOLDING/releases/$pick/.release.json" 2>/dev/null | head -1)
cd "$SITE"
git add -A
if git diff --cached --quiet; then
  echo "The live site already matches $pick."
else
  git -c user.name="${GIT_NAME:-DCMSX release}" -c user.email="${GIT_EMAIL:-dcmsx@users.noreply.github.com}" \
    commit --quiet -m "Release $pick" -m "DCMSX-Source: ${source:-unknown}"
  git push --quiet origin "HEAD:$BRANCH"
  echo "Pushed the release to $BRANCH."
fi
cd - >/dev/null

# what has gone out leaves the holding repo, so the next firing finds nothing
cd "$HOLDING"
for s in "${due[@]}"; do rm -rf "releases/$s"; done
git add -A
if ! git diff --cached --quiet; then
  git -c user.name="${GIT_NAME:-DCMSX release}" -c user.email="${GIT_EMAIL:-dcmsx@users.noreply.github.com}" \
    commit --quiet -m "Released ${due[*]}"
  git push --quiet origin "HEAD:$BRANCH"
fi
cd - >/dev/null

echo "released=$pick"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "released=$pick" >> "$GITHUB_OUTPUT"
exit 0
