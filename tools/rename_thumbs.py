#!/usr/bin/env python3
import os
import time
import shutil

ROOT = "/mnt/kDrive/Foto"
OLD_SUFFIX = ".jpg.jpg"
NEW_PREFIX = "thumb-"
THUMB_DIR = ".thumb"

SKIP_DIRS = {"Originaler", ".thumbs"}  # we still walk .thumb itself
MAX_RETRIES = 5
RETRY_SLEEP = 2.0  # seconds

renamed = 0
skipped = 0
failed = 0

def robust_rename(old_path: str, new_path: str) -> bool:
    """
    Try rename/replace with retries; fallback to copy+delete.
    Returns True on success.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # os.replace handles overwrite atomically on local FS; on WebDAV it may still fail.
            os.replace(old_path, new_path)
            return True
        except OSError as e:
            # Retry on transient I/O
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_SLEEP)
                continue

            # Final attempt: copy + delete (more WebDAV-friendly)
            try:
                shutil.copy2(old_path, new_path)
                os.remove(old_path)
                return True
            except Exception:
                return False

for root, dirs, files in os.walk(ROOT):
    # prune unwanted trees
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

    if os.path.basename(root) != THUMB_DIR:
        continue

    for f in files:
        if not f.lower().endswith(OLD_SUFFIX):
            continue

        old_path = os.path.join(root, f)

        # Convert "DSC00139.JPG.jpg" -> "thumb-DSC00139.JPG"
        # Keep original base name casing/extension before the extra ".jpg"
        original_name = f[:-len(".jpg")]  # strip only the final ".jpg"
        # Now original_name ends with ".JPG" or ".jpg" etc.
        new_name = NEW_PREFIX + original_name
        new_path = os.path.join(root, new_name)

        if os.path.exists(new_path):
            skipped += 1
            continue

        ok = robust_rename(old_path, new_path)
        if ok:
            renamed += 1
            if renamed % 500 == 0:
                print(f"Progress: renamed {renamed} (skipped {skipped}, failed {failed})")
        else:
            failed += 1
            print("FAILED:", old_path, "->", new_path)

print("\nDone.")
print("Renamed:", renamed)
print("Skipped:", skipped)
print("Failed:", failed)
