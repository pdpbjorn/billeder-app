#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/srv/billeder-repo"
WEB_DIR="/var/www/billeder"

echo "== Deploy start: $(date -Is) =="

cd "$REPO_DIR"

echo "-- git pull (as ubuntu)"
sudo -u ubuntu git pull --ff-only

echo "-- rsync to web root (excluding .git)"
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
