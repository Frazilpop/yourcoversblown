#!/bin/bash
# Release the newest due scheduled build onto the live site.
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
#
# HOW THE COPY IS MADE. A held folder is a whole build of the site, and
# beside it (.base.sha256, written by core/scripts/schedule.js) is a hash of
# every file in the ORDINARY build of the same source – the site as a Publish
# of that moment would have made it. The release is a three-way merge, file
# by file:
#   held == base   the release did not change this file: the live site keeps
#                  whatever it has (a Publish since the sync, or nothing)
#   held != base   the release changes it (the episode's page and mp3, the
#                  feed, the listings): the held version goes live
# So a held copy that is behind a Publish never undoes that Publish, and an
# edit synced but never published does not slip out on the day. The one thing
# it cannot save is a file BOTH changed – a home page republished after the
# sync, say, that the release also lists the episode on: the release's version
# wins there and the run says so. publish.sh syncs after every publish and
# the admin re-syncs by itself, so that is rare.
# A held folder without .base.sha256 (held before this existed) is copied
# whole, as before.
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
HELD="$HOLDING/releases/$pick"
echo "Releasing $pick (due: ${due[*]})"

# a release is a whole site; anything less would take the live site apart
if [ ! -f "$HELD/index.html" ] || [ ! -f "$HELD/feed.xml" ]; then
  echo "Refusing: releases/$pick is not a whole site (no index.html or feed.xml). The live site is untouched." >&2
  exit 1
fi

# "<sha256>  <path>" for every file under a directory, sorted by path –
# the same shape schedule.js writes into .base.sha256
if command -v sha256sum >/dev/null 2>&1; then SHA="sha256sum"; else SHA="shasum -a 256"; fi
hash_tree() {
  # shellcheck disable=SC2086  # $SHA is a command with its flags
  (cd "$1" && find . -type f ! -path './.git/*' ! -path './.github/*' ! -name .release.json ! -name .base.sha256 -print0 \
    | xargs -0 $SHA 2>/dev/null || true) | sed 's#  \./#  #' | sort -k2
}

changed=0 kept=0 conflicts=()
if [ -f "$HELD/.base.sha256" ]; then
  work=$(mktemp -d)
  hash_tree "$HELD" > "$work/held"
  hash_tree "$SITE" > "$work/live"
  # one line per file the release changes: "<copy|rm>\t<conflict|->\t<path>"
  awk -v OFS='\t' '
    { h = $1; p = substr($0, 67) }
    FILENAME == ARGV[1] { base[p] = h; next }
    FILENAME == ARGV[2] { held[p] = h; all[p] = 1; next }
    { live[p] = h; all[p] = 1 }
    END {
      for (p in all) {
        hv = (p in held) ? held[p] : ""; bv = (p in base) ? base[p] : ""; lv = (p in live) ? live[p] : ""
        if (hv == bv) continue
        print (hv == "" ? "rm" : "copy"), (lv != bv && lv != hv ? "conflict" : "-"), p
      }
    }' "$HELD/.base.sha256" "$work/held" "$work/live" | sort -t "$(printf '\t')" -k3 > "$work/plan"
  while IFS=$'\t' read -r act conflict p; do
    [ -n "$p" ] || continue
    case "$p" in .git/*|.github/*) continue ;; esac
    if [ "$act" = copy ]; then
      mkdir -p "$SITE/$(dirname "$p")"
      cp "$HELD/$p" "$SITE/$p"
    else
      rm -f "$SITE/$p"
    fi
    changed=$((changed + 1))
    [ "$conflict" = conflict ] && conflicts+=("$p")
    echo "  $act  $p$([ "$conflict" = conflict ] && echo '  (the live site had changed this too – the release wins)')"
  done < "$work/plan"
  kept=$(( $(wc -l < "$work/live") - changed ))
  rm -rf "$work"
  echo "The release changes $changed file(s); the live site keeps its other $kept as published."
  if [ ${#conflicts[@]} -gt 0 ]; then
    echo "WARNING: ${#conflicts[@]} file(s) had been republished since the held copy was made and are replaced by the release's version: ${conflicts[*]}" >&2
    echo "         Publish again from DCMSX to put today's version of those back." >&2
  fi
else
  echo "No .base.sha256 beside this release – copying it whole over the live site."
  rsync -a --delete --exclude='.git' --exclude='.github' --exclude='.release.json' "$HELD/" "$SITE/"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Released $pick"
    echo
    echo "- files changed by the release: $changed"
    echo "- live files left as published: $kept"
    if [ ${#conflicts[@]} -gt 0 ]; then
      echo "- **republished since the held copy was made, replaced by the release's version:** ${conflicts[*]} – Publish again from DCMSX to restore today's version"
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi

source=$(sed -n 's/^ *"source": *"\([0-9a-f]*\)".*/\1/p' "$HELD/.release.json" 2>/dev/null | head -1)
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
