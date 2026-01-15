#!/usr/bin/env bash
set -euo pipefail

REPO="/srv/billeder-repo"

cd "$REPO"

# Optional: ensure we're on a branch (not detached)
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then
  echo "ERROR: Repo is in detached HEAD state. Checkout a branch first."
  exit 1
fi

echo "Repo: $REPO"
echo "Branch: $BRANCH"
echo

# Show status
echo "---- git status ----"
git status
echo

# Stage everything that is not ignored
# -A stages tracked deletions too
git add -A

# If you want to be extra strict and avoid accidentally committing ignored files
# (normally impossible), you can sanity-check:
# git ls-files -i --exclude-standard | sed 's/^/IGNORED: /'

# Show what will be committed
echo "---- staged changes ----"
git diff --cached --stat || true
echo

# Abort if no staged changes
if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

# Commit message: allow custom message as args; otherwise timestamp
if [[ $# -gt 0 ]]; then
  MSG="$*"
else
  MSG="Server update $(date -u +'%Y-%m-%d %H:%M:%SZ')"
fi

echo "Committing with message: $MSG"
git commit -m "$MSG"

echo
echo "Pushing to origin $BRANCH ..."
git push origin "$BRANCH"

echo
echo "Done."
