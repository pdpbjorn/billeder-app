#!/usr/bin/env bash
set -euo pipefail

REPO="/srv/billeder-repo"

cd "$REPO"

# Make sure ignore rules are applied
git status --porcelain >/dev/null

echo "== Staging curated files =="

# Always track these (hand-edited sources + scripts)
git add -A \
  .gitignore \
  areas.geo.json \
  trips.json \
  tools \
  deploy.sh 2>/dev/null || true

# Track ONLY the dropdown indexes (small files)
git add -A \
  data/tid/index.json \
  data/sted/index.json \
  data/anvendelse/index.json 2>/dev/null || true

echo
echo "== Changes to commit =="
git status --short

# If no changes, exit cleanly
if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing to commit."
  exit 0
fi

MSG="${1:-Update indexes/scripts}"
echo
echo "== Committing: $MSG =="
git commit -m "$MSG"

echo
echo "== Pushing to origin =="
git push

echo "Done."
