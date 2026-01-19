#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/srv/billeder-repo"
WEB_DIR="/var/www/billeder"
GIT_USER="ubuntu"

echo "== Deploy start: $(date -Is) =="

echo "-- fetch + merge from origin/main (as $GIT_USER)"
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" fetch origin
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" checkout main >/dev/null 2>&1 || true
sudo -u "$GIT_USER" -H git -C "$REPO_DIR" merge --no-ff --no-edit origin/main

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
