#!/usr/bin/env python3
import json
import os
import subprocess
import time
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

PHOTO_ROOT = "/mnt/kDrive/Foto"
OUT_JSON = "/srv/billeder-repo/data/source/images.json"
REPORTS_DIR = "/srv/billeder-repo/reports"

SKIP_DIR_NAMES = {".thumb", ".thumbs", "Originaler"}
EXTS = {".jpg", ".jpeg", ".png"}

# Thumbnails (still generated if missing)
THUMB_DIRNAME = ".thumb"
THUMB_PREFIX = "thumb-"
THUMB_SIZE = "300x300"

RETRIES = 5
RETRY_SLEEP = 2.0
HEALTHCHECK_EVERY = 500

MAGICK_CMD = None  # set in main()

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)

def utc_stamp(dt: Optional[datetime] = None) -> str:
    dt = dt or utc_now()
    return dt.strftime("%Y%m%dT%H%M%SZ")

def atomic_write_json(path: str, obj: Dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(path) + ".", suffix=".tmp", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except Exception:
            pass

def run(cmd: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True)

def mount_healthcheck() -> None:
    try:
        _ = os.listdir(PHOTO_ROOT)
    except Exception as e:
        raise RuntimeError(f"Mount list failed: {e}")

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

def build_snapshot_list() -> List[str]:
    prune_parts = []
    for d in SKIP_DIR_NAMES:
        prune_parts += ["-path", f"*/{d}/*", "-o"]

    cmd = ["find", PHOTO_ROOT, "("] + prune_parts
    if cmd[-1] == "-o":
        cmd = cmd[:-1]
    cmd += [")", "-prune", "-o", "-type", "f", "(", "-iname", "*.jpg", "-o", "-iname", "*.jpeg", "-o", "-iname", "*.png", ")", "-print"]

    r = run(cmd)
    if r.returncode != 0:
        raise RuntimeError(f"find failed:\n{r.stderr}")

    paths = [line.strip() for line in r.stdout.splitlines() if line.strip()]
    paths = [p for p in paths if p.startswith(PHOTO_ROOT.rstrip("/") + "/")]
    paths.sort()
    return paths

def normalize_ts(ts: str) -> str:
    # exiftool typical: "2011:01:11 23:43:27" -> "2011-01-11T23:43:27"
    if not ts:
        return ""
    if ":" in ts and " " in ts and len(ts) >= 19 and ts[4] == ":":
        return ts.replace(":", "-", 2).replace(" ", "T", 1)
    return ts

def exif_for_one(abs_path: str) -> Tuple[str, Optional[float], Optional[float], str]:
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
            abs_path,
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
                pass

        if attempt < RETRIES:
            time.sleep(RETRY_SLEEP)

    return "", None, None, ""

def ensure_thumb(abs_img: str) -> bool:
    img_dir = os.path.dirname(abs_img)
    img_name = os.path.basename(abs_img)

    thumb_dir = os.path.join(img_dir, THUMB_DIRNAME)
    thumb_name = f"{THUMB_PREFIX}{img_name}"
    thumb_abs = os.path.join(thumb_dir, thumb_name)

    if os.path.exists(thumb_abs):
        return True

    os.makedirs(thumb_dir, exist_ok=True)

    for attempt in range(1, RETRIES + 1):
        try:
            if MAGICK_CMD == "magick":
                cmd = ["magick", abs_img, "-auto-orient", "-thumbnail", THUMB_SIZE, "-strip", thumb_abs]
            else:
                cmd = ["convert", abs_img, "-auto-orient", "-thumbnail", THUMB_SIZE, "-strip", thumb_abs]

            r = run(cmd)
            if r.returncode == 0 and os.path.exists(thumb_abs):
                return True
        except Exception:
            pass

        if attempt < RETRIES:
            time.sleep(RETRY_SLEEP)

    return False

def load_existing_index() -> Tuple[Dict[str, Dict], Dict[str, Any]]:
    """
    Returns:
      existing_by_img: { "rel/path.jpg": item_dict }
      existing_doc: full json dict (or empty)
    """
    if not os.path.exists(OUT_JSON):
        return {}, {}

    try:
        with open(OUT_JSON, "r", encoding="utf-8") as f:
            doc = json.load(f)
        items = doc.get("items") or []
        by_img = {it.get("img"): it for it in items if it.get("img")}
        return by_img, doc
    except Exception:
        return {}, {}

def main():
    global MAGICK_CMD
    start = utc_now()

    print("== build_index.py ==")
    print("-- healthcheck (pre)")
    mount_healthcheck()

    MAGICK_CMD = find_imagemagick_cmd()
    if not MAGICK_CMD:
        raise SystemExit("ImageMagick not found. Install imagemagick (magick/convert).")
    print(f"-- ImageMagick cmd: {MAGICK_CMD}")

    print("-- building snapshot list via find")
    paths = build_snapshot_list()
    total = len(paths)
    print(f"-- found {total} image files")

    existing_by_img, existing_doc = load_existing_index()
    print(f"-- existing index items: {len(existing_by_img)}")

    snapshot_rel = []
    for abs_path in paths:
        rel_img = os.path.relpath(abs_path, PHOTO_ROOT).replace("\\", "/")
        snapshot_rel.append(rel_img)

    snapshot_set = set(snapshot_rel)

    # stats
    counts = {
        "total_snapshot": total,
        "reused_existing": 0,
        "new_indexed": 0,
        "removed_from_index": 0,
        "no_timestamp": 0,
        "has_coords": 0,
        "no_coords": 0,
        "thumb_ok": 0,
        "thumb_fail": 0,
    }
    failed_exif: List[str] = []
    failed_thumb: List[str] = []

    # Remove entries for files that no longer exist in snapshot
    for img in list(existing_by_img.keys()):
        if img not in snapshot_set:
            del existing_by_img[img]
            counts["removed_from_index"] += 1

    items_out: List[Dict] = []
    last_print = time.time()
    last_health = 0

    for n, abs_path in enumerate(paths, start=1):
        if n == 1 or (n % HEALTHCHECK_EVERY == 0):
            try:
                mount_healthcheck()
            except Exception as e:
                raise SystemExit(f"Mount became unhealthy at file {n}/{total}: {e}")
            last_health = n

        rel_img = os.path.relpath(abs_path, PHOTO_ROOT).replace("\\", "/")

        if rel_img in existing_by_img:
            items_out.append(existing_by_img[rel_img])
            counts["reused_existing"] += 1
        else:
            ts, lat, lon, camera = exif_for_one(abs_path)
            if not ts:
                counts["no_timestamp"] += 1
                if lat is None and lon is None and camera == "":
                    failed_exif.append(rel_img)

            has_coords = lat is not None and lon is not None
            if has_coords:
                counts["has_coords"] += 1
            else:
                counts["no_coords"] += 1

            ok_thumb = ensure_thumb(abs_path)
            if ok_thumb:
                counts["thumb_ok"] += 1
            else:
                counts["thumb_fail"] += 1
                failed_thumb.append(rel_img)

            # NOTE: no "gps" and no "thumb" in the JSON anymore.
            items_out.append({
                "img": rel_img,
                "ts": ts,
                "lat": lat,
                "lon": lon,
                "camera": camera,
            })
            counts["new_indexed"] += 1

        # timed progress output (every ~30 seconds, or every 2000 files)
        now = time.time()
        if (now - last_print) >= 30 or (n % 2000 == 0):
            elapsed = (utc_now() - start).total_seconds()
            rate = n / elapsed if elapsed > 0 else 0
            print(f"[{utc_now().isoformat().replace('+00:00','Z')}] "
                  f"{n}/{total}  new={counts['new_indexed']}  reused={counts['reused_existing']}  "
                  f"no_ts={counts['no_timestamp']}  thumb_fail={counts['thumb_fail']}  "
                  f"{rate:.1f} files/s  last_health={last_health}")
            last_print = now

    # Sort output deterministically by img path
    items_out.sort(key=lambda x: x.get("img") or "")

    out_doc = {
        "version": utc_now().isoformat().replace("+00:00", "Z"),
        "count": len(items_out),
        "items": items_out,
        "stats": counts,
        "failures": {
            "exif": failed_exif[:200],
            "thumb": failed_thumb[:200],
        }
    }

    print("-- writing output atomically:", OUT_JSON)
    atomic_write_json(OUT_JSON, out_doc)

    # Report file
    os.makedirs(REPORTS_DIR, exist_ok=True)
    end = utc_now()
    report_path = os.path.join(REPORTS_DIR, f"index_build_{utc_stamp(end)}.json")
    report = {
        "version": 1,
        "generatedAt": end.isoformat().replace("+00:00", "Z"),
        "durationSeconds": int((end - start).total_seconds()),
        "output": "data/source/images.json",
        "stats": counts,
        "failuresSample": {
            "exif": failed_exif[:50],
            "thumb": failed_thumb[:50],
        }
    }
    atomic_write_json(report_path, report)

    print("-- wrote report:", report_path)
    print("Done.")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
