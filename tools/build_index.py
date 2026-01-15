#!/usr/bin/env python3
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

PHOTO_ROOT = "/mnt/kDrive/Foto"
OUT_JSON = "/srv/billeder-repo/data/source/images.json"

# Skip directories anywhere in path
SKIP_DIR_NAMES = {".thumb", ".thumbs", "Originaler"}

# Extensions to include
EXTS = {".jpg", ".jpeg", ".png"}

# Thumbnails
THUMB_DIRNAME = ".thumb"
THUMB_PREFIX = "thumb-"
THUMB_SIZE = "300x300"  # you can change later

# Robustness
RETRIES = 5
RETRY_SLEEP = 2.0
HEALTHCHECK_EVERY = 500  # files

def run(cmd: List[str], check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, check=check)

def mount_healthcheck() -> None:
    """
    Raises RuntimeError if mount appears unhealthy.
    """
    # Basic list
    try:
        entries = os.listdir(PHOTO_ROOT)
        if not entries:
            # Empty could be legit, but for your mount it's unlikely
            pass
    except Exception as e:
        raise RuntimeError(f"Mount list failed: {e}")

    # Write test
    test_path = os.path.join(PHOTO_ROOT, ".healthcheck_tmp")
    try:
        with open(test_path, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(test_path)
    except Exception as e:
        raise RuntimeError(f"Mount write test failed: {e}")

def find_imagemagick_cmd() -> Optional[str]:
    for c in ("magick", "convert"):
        try:
            r = run([c, "-version"])
            if r.returncode == 0:
                return c
        except FileNotFoundError:
            continue
    return None

MAGICK_CMD = None  # set in main()

def build_snapshot_list() -> List[str]:
    """
    Use `find` to build a deterministic snapshot of image files.
    This avoids os.walk() over a WebDAV mount.
    """
    # Build prune expression: -path "*/.thumb/*" -o -path "*/Originaler/*" ...
    prune_parts = []
    for d in SKIP_DIR_NAMES:
        prune_parts += ["-path", f"*/{d}/*", "-o"]

    # find PHOTO_ROOT \( prune... \) -prune -o -type f \( -iname *.jpg ... \) -print
    cmd = ["find", PHOTO_ROOT, "("] + prune_parts
    # remove trailing -o
    if cmd[-1] == "-o":
        cmd = cmd[:-1]
    cmd += [")", "-prune", "-o", "-type", "f", "("]

    # extensions
    exts = [
        "-iname", "*.jpg", "-o",
        "-iname", "*.jpeg", "-o",
        "-iname", "*.png"
    ]
    cmd += exts + [")", "-print"]

    r = run(cmd)
    if r.returncode != 0:
        raise RuntimeError(f"find failed:\n{r.stderr}")

    paths = [line.strip() for line in r.stdout.splitlines() if line.strip()]
    # Filter out anything weird not under root
    paths = [p for p in paths if p.startswith(PHOTO_ROOT.rstrip("/") + "/")]
    paths.sort()
    return paths

def normalize_ts(ts: str) -> str:
    # exiftool output typically: "2011:01:11 23:43:27"
    # convert to ISO-like: "2011-01-11T23:43:27"
    if not ts:
        return ""
    if ":" in ts and " " in ts and len(ts) >= 19 and ts[4] == ":":
        return ts.replace(":", "-", 2).replace(" ", "T", 1)
    return ts

def exif_for_one(abs_path: str) -> Tuple[str, Optional[float], Optional[float], str]:
    """
    Returns (timestamp, lat, lon, camera)
    Uses exiftool per file with retries.
    """
    for attempt in range(1, RETRIES + 1):
        cmd = [
            "exiftool",
            "-json",
            "-n",
            "-DateTimeOriginal",
            "-CreateDate",
            "-GPSLatitude",
            "-GPSLongitude",
            "-Make",
            "-Model",
            abs_path
        ]
        r = run(cmd)
        if r.returncode == 0:
            try:
                arr = json.loads(r.stdout)
                rec = arr[0] if arr else {}
                ts = normalize_ts(rec.get("DateTimeOriginal") or rec.get("CreateDate") or "")
                lat = rec.get("GPSLatitude")
                lon = rec.get("GPSLongitude")
                make = (rec.get("Make") or "").strip()
                model = (rec.get("Model") or "").strip()
                camera = (make + " " + model).strip()
                return ts, lat, lon, camera
            except Exception:
                # parse failure, retry
                pass

        # retry on failure
        if attempt < RETRIES:
            time.sleep(RETRY_SLEEP)

    # final failure
    return "", None, None, ""

def ensure_thumb(abs_img: str) -> Tuple[bool, str]:
    """
    Ensure thumbnail exists.
    Returns (ok, rel_thumb_path or "")
    """
    img_dir = os.path.dirname(abs_img)
    img_name = os.path.basename(abs_img)

    thumb_dir = os.path.join(img_dir, THUMB_DIRNAME)
    thumb_name = f"{THUMB_PREFIX}{img_name}"
    thumb_abs = os.path.join(thumb_dir, thumb_name)

    if os.path.exists(thumb_abs):
        rel_thumb = os.path.relpath(thumb_abs, PHOTO_ROOT).replace("\\", "/")
        return True, rel_thumb

    os.makedirs(thumb_dir, exist_ok=True)

    # Create thumb with retries
    for attempt in range(1, RETRIES + 1):
        try:
            if MAGICK_CMD == "magick":
                cmd = ["magick", abs_img, "-auto-orient", "-thumbnail", THUMB_SIZE, "-strip", thumb_abs]
            else:
                cmd = ["convert", abs_img, "-auto-orient", "-thumbnail", THUMB_SIZE, "-strip", thumb_abs]

            r = run(cmd)
            if r.returncode == 0 and os.path.exists(thumb_abs):
                rel_thumb = os.path.relpath(thumb_abs, PHOTO_ROOT).replace("\\", "/")
                return True, rel_thumb
        except Exception:
            pass

        if attempt < RETRIES:
            time.sleep(RETRY_SLEEP)

    return False, ""

def atomic_write_json(path: str, obj: Dict) -> None:
    tmp = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)

def main():
    global MAGICK_CMD
    print("== build_index.py ==")

    # 0) Health check before doing anything heavy
    print("-- healthcheck (pre)")
    mount_healthcheck()

    MAGICK_CMD = find_imagemagick_cmd()
    if not MAGICK_CMD:
        raise SystemExit("ImageMagick not found. Install imagemagick (magick/convert).")

    print(f"-- ImageMagick cmd: {MAGICK_CMD}")

    # 1) Snapshot list
    print("-- building snapshot list via find...")
    paths = build_snapshot_list()
    print(f"-- found {len(paths)} image files")

    items = []
    failed_exif = []
    failed_thumb = []
    counts = {
        "total": 0,
        "no_timestamp": 0,
        "has_gps": 0,
        "no_gps": 0,
        "thumb_ok": 0,
        "thumb_fail": 0,
    }

    for n, abs_path in enumerate(paths, start=1):
        # periodic health checks
        if n == 1 or (n % HEALTHCHECK_EVERY == 0):
            try:
                mount_healthcheck()
            except Exception as e:
                raise SystemExit(f"Mount became unhealthy at file {n}/{len(paths)}: {e}")

        rel_img = os.path.relpath(abs_path, PHOTO_ROOT).replace("\\", "/")

        ts, lat, lon, camera = exif_for_one(abs_path)
        if not ts:
            counts["no_timestamp"] += 1
            # Keep record anyway; it goes into "no timestamp" buckets later.
            # If exif completely failed, note it:
            if lat is None and lon is None and camera == "":
                failed_exif.append(rel_img)

        has_gps = lat is not None and lon is not None
        if has_gps:
            counts["has_gps"] += 1
        else:
            counts["no_gps"] += 1

        ok_thumb, rel_thumb = ensure_thumb(abs_path)
        if ok_thumb:
            counts["thumb_ok"] += 1
        else:
            counts["thumb_fail"] += 1
            failed_thumb.append(rel_img)

        items.append({
            "img": rel_img,
            "ts": ts,
            "lat": lat,
            "lon": lon,
            "gps": 1 if has_gps else 0,
            "camera": camera,
            "thumb": rel_thumb,  # relative under Foto tree
        })

        # light progress output
        if n % 500 == 0:
            print(f"Progress: {n}/{len(paths)}  gps={counts['has_gps']}  no_ts={counts['no_timestamp']}  thumb_fail={counts['thumb_fail']}")

    counts["total"] = len(items)

    out = {
        "version": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "count": counts["total"],
        "items": items,
        "stats": counts,
        "failures": {
            "exif": failed_exif[:200],     # cap sample to keep file reasonable
            "thumb": failed_thumb[:200],
        }
    }

    print("-- writing output atomically:", OUT_JSON)
    atomic_write_json(OUT_JSON, out)

    print("Done.")
    print(json.dumps(counts, indent=2))
    if failed_exif:
        print(f"EXIF failures (sample {min(len(failed_exif),200)}): see OUT_JSON.failures.exif")
    if failed_thumb:
        print(f"Thumb failures (sample {min(len(failed_thumb),200)}): see OUT_JSON.failures.thumb")

if __name__ == "__main__":
    main()
