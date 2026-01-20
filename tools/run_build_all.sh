#!/usr/bin/env bash
set -euo pipefail

REPO="/srv/billeder-repo"

echo "== Build all start: $(date -Is) =="

echo "-- running index"
python3 "$REPO/tools/build_index.py"

echo "-- running datasets"
python3 "$REPO/tools/build_datasets.py"

echo "== Build all done: $(date -Is) =="
