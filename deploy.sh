#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/srv/billeder-repo"
WEB_DIR="/var/www/billeder"
GIT_USER="ubuntu"

echo "== Deploy start: $(date -Is) =="

cd "$REPO_DIR"

echo "-- repo status (before)"
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" rev-parse --short HEAD
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" status --porcelain || true

echo "-- fetch origin (as $GIT_USER)"
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" fetch origin

echo "-- merge origin/main into main (as $GIT_USER)"
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" checkout main >/dev/null 2>&1 || true


#sudo -u "$GIT_USER" -H git -C "$REPO_DIR" merge --no-ff --no-edit origin/main || {
#  echo "ERROR: Merge failed (likely conflicts)."
#  echo "Run: sudo -u $GIT_USER -H git -C $REPO_DIR status"
#  exit 1
#}

echo "-- reset main to origin/main (as $GIT_USER)"
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" checkout -f main
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" reset --hard origin/main
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" clean -fd


echo "-- repo status (after)"
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" rev-parse --short HEAD

echo "-- rsync to web root (excluding .git/.github)"
sudo rsync -av --delete \
  --exclude '.git' \
  --exclude '.github' \
  "$REPO_DIR/" "$WEB_DIR/"

echo "-- ensure Foto symlink exists"
if [ ! -L "$WEB_DIR/Foto" ]; then
  sudo ln -s /mnt/kDrive/Foto "$WEB_DIR/Foto"
fi

echo "-- permissions"
sudo chown -R ubuntu:www-data "$WEB_DIR"
sudo find "$WEB_DIR" -type d -exec chmod 755 {} \;
sudo find "$WEB_DIR" -type f -exec chmod 644 {} \;

echo "== Deploy done: $(date -Is) =="
