#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import os
import re
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, date, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO = Path("/srv/billeder-repo")

IMAGES_JSON = REPO / "data/source/images.json"
TRIPS_JSON = REPO / "trips.json"

OUT_TID = REPO / "data/tid"
OUT_STED = REPO / "data/sted"
OUT_ANV = REPO / "data/anvendelse"
OUT_PROB = REPO / "data/problems"
REPORTS_DIR = REPO / "reports"

# NOTE: runtime should not need areas.geo.json anymore once sted datasets exist.
# We keep sted outputs as already produced by the pipeline; the app will load data/sted/index.json + data/sted/<id>.geo.json.
AREAS_GEOJSON = REPO / "areas.geo.json"

try:
    from shapely.geometry import shape, Point
    from shapely.prepared import prep
except Exception as e:
    raise SystemExit(
        "ERROR: Shapely is required.\n"
        "Install: sudo apt-get update && sudo apt-get install -y python3-shapely\n"
        f"Original error: {e}"
    )

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)

def utc_stamp(dt: Optional[datetime] = None) -> str:
    dt = dt or utc_now()
    return dt.strftime("%Y%m%dT%H%M%SZ")

def utc_iso(dt: Optional[datetime] = None) -> str:
    dt = dt or utc_now()
    return dt.isoformat().replace("+00:00", "Z")

def atomic_write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
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

def parse_ts(ts: str) -> Optional[datetime]:
    ts = (ts or "").strip()
    if not ts:
        return None
    try:
        ts2 = re.split(r"(Z|[+-]\d\d:\d\d)$", ts)[0]
        return datetime.fromisoformat(ts2)
    except Exception:
        return None

def parse_iso_date(d: str) -> date:
    return datetime.strptime(d, "%Y-%m-%d").date()

def month_id(dt: datetime) -> str:
    return f"{dt.year:04d}-{dt.month:02d}"

def decade_label(year: int) -> str:
    return f"{(year // 10) * 10}s"

def fc(features: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}

def feature_from_item(item: Dict[str, Any]) -> Dict[str, Any]:
    # thumb path is derived in app; no need to store it
    lat = item.get("lat")
    lon = item.get("lon")

    geom = None
    if lat is not None and lon is not None:
        geom = {"type": "Point", "coordinates": [lon, lat]}

    props = {
        "img": item.get("img"),
        "ts": item.get("ts") or "",
        "camera": item.get("camera") or "",
    }
    return {"type": "Feature", "geometry": geom, "properties": props}

# ---- Areas (still used for generating sted datasets) ----
@dataclass
class Area:
    area_id: str
    name: str
    prepared: Any

def load_active_areas(path: Path) -> List[Area]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out: List[Area] = []
    for f in data.get("features", []):
        props = f.get("properties") or {}
        area_id = props.get("id")
        name = props.get("name")
        if not area_id or not name:
            continue
        geom = f.get("geometry")
        if not geom:
            continue
        out.append(Area(str(area_id), str(name), prep(shape(geom))))
    return out

def match_area(areas: List[Area], lon: float, lat: float) -> Optional[Area]:
    p = Point(lon, lat)
    for a in areas:
        if a.prepared.contains(p):
            return a
    return None

# ---- Trips ----
@dataclass
class Trip:
    trip_id: str
    title: str
    comment: str
    filename: str
    start: date
    end: date
    group: str

def load_trips(path: Path) -> List[Trip]:
    data = json.loads(path.read_text(encoding="utf-8"))
    trips: List[Trip] = []
    for g in data.get("groups", []):
        gname = str(g.get("group") or "Trips")
        for t in g.get("trips", []):
            tid = t.get("id")
            if not tid:
                continue
            trips.append(
                Trip(
                    trip_id=str(tid),
                    title=str(t.get("title") or tid),
                    comment=str(t.get("comments") or t.get("comment") or "").strip(),
                    filename=str(t.get("filename") or "").strip(),
                    start=parse_iso_date(t["startDate"]),
                    end=parse_iso_date(t["endDate"]),
                    group=gname,
                )
            )
    return trips

def match_trip(trips: List[Trip], dt: datetime) -> Optional[Trip]:
    d = dt.date()
    for t in trips:
        if t.start <= d <= t.end:
            return t
    return None

def build_time_index(counts_by_month: Dict[str, int]) -> Dict[str, Any]:
    months_sorted = sorted(counts_by_month.keys())
    decade_map: Dict[str, Dict[int, List[str]]] = {}
    for mid in months_sorted:
        y = int(mid.split("-")[0])
        decade_map.setdefault(decade_label(y), {}).setdefault(y, []).append(mid)

    idx = {"decades": []}
    for dlab in sorted(decade_map.keys()):
        years_block = []
        for y in sorted(decade_map[dlab].keys()):
            months_block = [{"id": mid, "count": counts_by_month[mid]} for mid in decade_map[dlab][y]]
            years_block.append({"id": f"{y:04d}", "months": months_block})
        idx["decades"].append({"id": dlab, "years": years_block})
    return idx

def progress_line(start_ts: float, n: int, total: int, extra: str = "") -> str:
    elapsed = max(0.001, time.time() - start_ts)
    rate = n / elapsed
    return f"[{utc_iso()}] {n}/{total}  {rate:.1f} items/s  elapsed={int(elapsed)}s{('  ' + extra) if extra else ''}"

def main() -> int:
    t0 = time.time()
    started = utc_now()

    for p in (IMAGES_JSON, AREAS_GEOJSON, TRIPS_JSON):
        if not p.exists():
            print(f"ERROR: missing {p}")
            return 2

    images_doc = json.loads(IMAGES_JSON.read_text(encoding="utf-8"))
    items: List[Dict[str, Any]] = images_doc.get("items") or []
    print(f"Loaded {len(items)} images from {IMAGES_JSON}")

    areas = load_active_areas(AREAS_GEOJSON)
    print(f"Loaded {len(areas)} active areas")

    trips = load_trips(TRIPS_JSON)
    print(f"Loaded {len(trips)} trips")

    area_name = {a.area_id: a.name for a in areas}
    trip_by_id = {t.trip_id: t for t in trips}

    by_month: Dict[str, List[Dict[str, Any]]] = {}
    by_area: Dict[str, List[Dict[str, Any]]] = {}
    by_trip: Dict[str, List[Dict[str, Any]]] = {}

    # Problems:
    prob_no_ts: List[Dict[str, Any]] = []
    prob_unmatched_geom: List[Dict[str, Any]] = []

    # New: problems/no-coordinates segmented by month
    prob_no_coords_by_month: Dict[str, List[Dict[str, Any]]] = {}
    prob_no_coords_no_ts: List[Dict[str, Any]] = []

    for n, item in enumerate(items, start=1):
        feat = feature_from_item(item)

        dt = parse_ts(item.get("ts") or "")
        lat = item.get("lat")
        lon = item.get("lon")

        # Time + Trips
        if dt is None:
            prob_no_ts.append(feat)
        else:
            mid = month_id(dt)
            by_month.setdefault(mid, []).append(feat)

            tr = match_trip(trips, dt)
            if tr:
                by_trip.setdefault(tr.trip_id, []).append(feat)

        # Place
        if lat is None or lon is None:
            if dt is None:
                prob_no_coords_no_ts.append(feat)
            else:
                prob_no_coords_by_month.setdefault(month_id(dt), []).append(feat)
        else:
            ar = match_area(areas, float(lon), float(lat))
            if ar is None:
                prob_unmatched_geom.append(feat)  # renamed bucket
            else:
                by_area.setdefault(ar.area_id, []).append(feat)

        if n % 5000 == 0 or n == len(items):
            extra = f"no-ts={len(prob_no_ts)} no-coords={sum(len(v) for v in prob_no_coords_by_month.values())+len(prob_no_coords_no_ts)} unmatched-geom={len(prob_unmatched_geom)}"
            print(progress_line(t0, n, len(items), extra))

    # ---- Write Tid ----
    OUT_TID.mkdir(parents=True, exist_ok=True)
    tid_index = build_time_index({m: len(v) for m, v in by_month.items()})
    for mid, feats in by_month.items():
        atomic_write_json(OUT_TID / f"{mid}.geo.json", fc(feats))
    atomic_write_json(OUT_TID / "index.json", tid_index)
    print(f"Wrote tid: {len(by_month)} month files + index.json")

    # ---- Write Sted ----
    OUT_STED.mkdir(parents=True, exist_ok=True)
    sted_index: List[Dict[str, Any]] = []
    for aid in sorted(by_area.keys()):
        feats = by_area[aid]
        atomic_write_json(OUT_STED / f"{aid}.geo.json", fc(feats))
        sted_index.append({"id": aid, "name": area_name.get(aid, aid), "count": len(feats)})
    atomic_write_json(OUT_STED / "index.json", sted_index)
    print(f"Wrote sted: {len(by_area)} area files + index.json")

    # ---- Write Anvendelse ----
    OUT_ANV.mkdir(parents=True, exist_ok=True)

    group_map: Dict[str, List[Dict[str, Any]]] = {}
    for trip_id, feats in by_trip.items():
        atomic_write_json(OUT_ANV / f"{trip_id}.geo.json", fc(feats))

        t = trip_by_id.get(trip_id)
        if t is None:
            group = "Trips"
            entry = {
                "id": trip_id,
                "title": trip_id,
                "comment": "",
                "startDate": "",
                "endDate": "",
                "filename": "",
                "count": len(feats),
            }
        else:
            group = t.group
            entry = {
                "id": t.trip_id,
                "title": t.title,
                "comment": t.comment,
                "startDate": t.start.isoformat(),
                "endDate": t.end.isoformat(),
                "filename": t.filename,   # <— added back for UseOnMap(KMLfile)
                "count": len(feats),
            }
        group_map.setdefault(group, []).append(entry)

    anv_index = {"groups": []}
    for g in sorted(group_map.keys()):
        anv_index["groups"].append({"group": g, "trips": sorted(group_map[g], key=lambda x: x["id"])})
    atomic_write_json(OUT_ANV / "index.json", anv_index)
    print(f"Wrote anvendelse: {len(by_trip)} trip files + index.json")

    # ---- Write Problems ----
    OUT_PROB.mkdir(parents=True, exist_ok=True)

    # no-timestamp (all images missing dt)
    atomic_write_json(OUT_PROB / "no-timestamp.geo.json", fc(prob_no_ts))

    # unmatched renamed:
    atomic_write_json(OUT_PROB / "unmatched-geometry.geo.json", fc(prob_unmatched_geom))

    # New folder for segmented no-coordinates
    no_coords_dir = OUT_PROB / "no-coordinates"
    no_coords_dir.mkdir(parents=True, exist_ok=True)

    for mid, feats in prob_no_coords_by_month.items():
        atomic_write_json(no_coords_dir / f"{mid}.geo.json", fc(feats))
    atomic_write_json(no_coords_dir / "no-timestamp.geo.json", fc(prob_no_coords_no_ts))

    no_coords_counts = {mid: len(feats) for mid, feats in prob_no_coords_by_month.items()}
    no_coords_index = {
        "count": sum(no_coords_counts.values()) + len(prob_no_coords_no_ts),
        "noTimestamp": len(prob_no_coords_no_ts),
        "timeIndex": build_time_index(no_coords_counts),
    }
    atomic_write_json(no_coords_dir / "index.json", no_coords_index)

    # problems/index.json is now a small "directory of problems"
    problems_index = {
        "datasets": {
            "no-timestamp": {"path": "data/problems/no-timestamp.geo.json", "count": len(prob_no_ts)},
            "no-coordinates": {"path": "data/problems/no-coordinates/index.json", "count": no_coords_index["count"]},
            "unmatched-geometry": {"path": "data/problems/unmatched-geometry.geo.json", "count": len(prob_unmatched_geom)},
        }
    }
    atomic_write_json(OUT_PROB / "index.json", problems_index)
    print("Wrote problems datasets + index.json")

    # ---- Report ----
    ended = utc_now()
    report = {
        "version": 3,
        "generatedAt": utc_iso(ended),
        "durationSeconds": int((ended - started).total_seconds()),
        "inputs": {
            "imagesJson": "data/source/images.json",
            "areasGeoJson": "areas.geo.json",
            "tripsJson": "trips.json",
            "imageCount": len(items),
            "activeAreas": len(areas),
            "trips": len(trips),
            "imagesVersion": images_doc.get("version"),
            "imagesStats": images_doc.get("stats"),
        },
        "outputs": {
            "tid": {"months": len(by_month)},
            "sted": {"areasWithPhotos": len(by_area)},
            "anvendelse": {"tripsWithPhotos": len(by_trip)},
            "problems": {
                "noTimestamp": len(prob_no_ts),
                "noCoordinatesTotal": no_coords_index["count"],
                "noCoordinatesMonths": len(prob_no_coords_by_month),
                "unmatchedGeometry": len(prob_unmatched_geom),
            },
        },
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"datasets_build_{utc_stamp(ended)}.json"
    atomic_write_json(report_path, report)
    print(f"Wrote report: {report_path}")

    print("Done.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
