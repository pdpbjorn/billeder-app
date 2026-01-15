#!/usr/bin/env python3
import os
import time
import shutil

LIST = "/tmp/thumb_rename_list.txt"
OLD_SUFFIX = ".jpg.jpg"
NEW_PREFIX = "thumb-"
MAX_RETRIES = 5
RETRY_SLEEP = 2.0

def robust_move(old_path: str, new_path: str) -> bool:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            os.replace(old_path, new_path)
            return True
        except OSError:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_SLEEP)
                continue
            try:
                shutil.copy2(old_path, new_path)
                os.remove(old_path)
                return True
            except Exception:
                return False

renamed = 0
skipped = 0
missing = 0
failed = 0

with open(LIST, "r", encoding="utf-8") as f:
    paths = [line.strip() for line in f if line.strip()]

for n, old_path in enumerate(paths, start=1):
    if not os.path.exists(old_path):
        missing += 1
        continue

    d = os.path.dirname(old_path)
    fn = os.path.basename(old_path)

    # Turn "DSC00139.JPG.jpg" -> "thumb-DSC00139.JPG"
    if not fn.lower().endswith(OLD_SUFFIX):
        skipped += 1
        continue

    original_name = fn[:-len(".jpg")]  # strip only the last ".jpg"
    new_name = NEW_PREFIX + original_name
    new_path = os.path.join(d, new_name)

    if os.path.exists(new_path):
        skipped += 1
        # Optionally remove old duplicate:
        # os.remove(old_path)
        continue

    ok = robust_move(old_path, new_path)
    if ok:
        renamed += 1
    else:
        failed += 1
        print("FAILED:", old_path, "->", new_path)

    if n % 500 == 0:
        print(f"Progress: {n}/{len(paths)}  renamed={renamed} skipped={skipped} missing={missing} failed={failed}")

print("\nDone.")
print("Renamed:", renamed)
print("Skipped:", skipped)
print("Missing:", missing)
print("Failed:", failed)
