#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple

# -----------------------------
# Paths (adjust if needed)
# -----------------------------
REPO_ROOT = "/srv/billeder-repo"

IMAGES_INDEX = os.path.join(REPO_ROOT, "data/source/images.json")
AREAS_FILE   = os.path.join(REPO_ROOT, "areas.geo.json")
TRIPS_FILE   = os.path.join(REPO_ROOT, "trips.json")

OUT_TID  = os.path.join(REPO_ROOT, "data/tid")
OUT_STED = os.path.join(REPO_ROOT, "data/sted")
OUT_ANV  = os.path.join(REPO_ROOT, "data/anvendelse")
OUT_PROB = os.path.join(REPO_ROOT, "data/problems")

REPORTS_DIR = os.path.join(REPO_ROOT, "reports")

# -----------------------------
# Helpers
# -----------------------------
def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)

def atomic_write_json(path: str, obj: Any) -> None:
    ensure_dir(os.path.dirname(path))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)

def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def parse_yyyy_mm_dd(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()

def month_id_from_ts(ts: str) -> Optional[str]:
    # expects ts like "YYYY-MM-..." (ISO-ish)
    if not ts or len(ts) < 7:
        return None
    return ts[:7]

def decade_id_from_year(y: int) -> str:
    return f"{(y // 10) * 10}s"

def feature_from_item(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Convert one images.json item to a GeoJSON Feature.
    Expected item keys (typical):
      img (path), ts (timestamp or None), lat, lon, camera (maybe)
    """
    img = item.get("img")
    if not img:
        return None

    ts = item.get("ts")  # may be None
    lat = item.get("lat")
    lon = item.get("lon")
    camera = item.get("camera")

    props: Dict[str, Any] = {
        "image": img,
    }
    if ts:
        props["timestamp"] = ts
    if camera:
        props["camera"] = camera

    geom = None
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        geom = {"type": "Point", "coordinates": [lon, lat]}

    return {"type": "Feature", "properties": props, "geometry": geom}

# Very small, dependency-free point-in-polygon test (ray casting)
def point_in_poly(lon: float, lat: float, ring: List[List[float]]) -> bool:
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersect = ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi)
        if intersect:
            inside = not inside
        j = i
    return inside

def point_in_geometry(lon: float, lat: float, geom: Dict[str, Any]) -> bool:
    gtype = geom.get("type")
    if gtype == "Polygon":
        # GeoJSON Polygon: coordinates: [ ring1, ring2(hole), ... ]
        rings = geom.get("coordinates", [])
        if not rings:
            return False
        outer = rings[0]
        if not point_in_poly(lon, lat, outer):
            return False
        # ignore holes for now (good enough for your use)
        return True
    if gtype == "MultiPolygon":
        # MultiPolygon: [ [ [ring...] ], [ [ring...] ], ... ]
        polys = geom.get("coordinates", [])
        for poly in polys:
            if not poly:
                continue
            outer = poly[0]
            if point_in_poly(lon, lat, outer):
                return True
        return False
    return False

# -----------------------------
# Build steps
# -----------------------------
def load_inputs() -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    images = load_json(IMAGES_INDEX)
    areas = load_json(AREAS_FILE)
    trips = load_json(TRIPS_FILE)
    items = images.get("items", [])
    return items, areas, trips

def build_all_features(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    feats: List[Dict[str, Any]] = []
    for it in items:
        f = feature_from_item(it)
        if f:
            feats.append(f)
    return feats

def build_time_datasets(features: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]]]:
    by_month: Dict[str, List[Dict[str, Any]]] = {}
    no_ts: List[Dict[str, Any]] = []

    for f in features:
        ts = f.get("properties", {}).get("timestamp")
        if not ts:
            no_ts.append(f)
            continue
        mid = month_id_from_ts(ts)
        if not mid:
            no_ts.append(f)
            continue
        by_month.setdefault(mid, []).append(f)

    # build tid/index.json in your structure
    # decades -> years -> months
    years_map: Dict[int, Dict[str, Any]] = {}
    for mid, feats in by_month.items():
        y = int(mid[:4])
        years_map.setdefault(y, {"id": str(y), "months": []})
        years_map[y]["months"].append({"id": mid, "count": len(feats)})

    # sort months inside years
    for y in years_map:
        years_map[y]["months"].sort(key=lambda m: m["id"])

    decades_map: Dict[str, Dict[str, Any]] = {}
    for y, yobj in years_map.items():
        did = decade_id_from_year(y)
        decades_map.setdefault(did, {"id": did, "years": []})
        decades_map[did]["years"].append(yobj)

    # sort years in decades
    for did in decades_map:
        decades_map[did]["years"].sort(key=lambda yy: yy["id"])

    # sort decades
    decades = [decades_map[k] for k in sorted(decades_map.keys())]
    tid_index = {"decades": decades}

    return tid_index, by_month, no_ts

def build_place_datasets(features: List[Dict[str, Any]], areas: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Returns:
      sted_index_list (list of {id,name,count})
      by_area (area-id -> features)
      unmatched_geometry (geotagged but not inside any area)
      no_coordinates (no geometry)
    """
    # active areas = features with properties.id and properties.name
    area_list: List[Tuple[str, str, Dict[str, Any]]] = []
    for af in areas.get("features", []):
        pid = af.get("properties", {}).get("id")
        pname = af.get("properties", {}).get("name")
        geom = af.get("geometry")
        if pid and pname and geom:
            area_list.append((pid, pname, geom))

    by_area: Dict[str, List[Dict[str, Any]]] = {pid: [] for pid, _, _ in area_list}
    unmatched: List[Dict[str, Any]] = []
    no_coords: List[Dict[str, Any]] = []

    for f in features:
        geom = f.get("geometry")
        if not geom:
            no_coords.append(f)
            continue
        coords = geom.get("coordinates") or []
        if len(coords) != 2:
            no_coords.append(f)
            continue
        lon, lat = coords[0], coords[1]
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            no_coords.append(f)
            continue

        hit = False
        for pid, _, ageom in area_list:
            if point_in_geometry(lon, lat, ageom):
                by_area[pid].append(f)
                hit = True
                break
        if not hit:
            unmatched.append(f)

    # build sted/index.json: only areas with photos
    sted_index_list: List[Dict[str, Any]] = []
    for pid, pname, _ in area_list:
        c = len(by_area.get(pid, []))
        if c > 0:
            sted_index_list.append({"id": pid, "name": pname, "count": c})

    # sort by name (or by count; pick what you prefer)
    sted_index_list.sort(key=lambda x: x["name"].lower())

    return sted_index_list, by_area, unmatched, no_coords

def build_trip_datasets(features: List[Dict[str, Any]], trips: Dict[str, Any]) -> Dict[str, Any]:
    """
    Produces:
      anvendelse/index.json shaped like trips.json groups/trips,
      but each trip includes count + startDate/endDate/filename/title/comment/id.

    Datasets:
      data/anvendelse/<trip-id>.geo.json only when count>0
    """
    out = {"groups": []}

    for grp in trips.get("groups", []):
        gname = grp.get("group") or grp.get("title") or "Ukendt"
        out_grp = {"group": gname, "trips": []}

        for trip in grp.get("trips", []):
            tid = trip.get("id")
            if not tid:
                continue
            start = trip.get("startDate")
            end = trip.get("endDate")
            filename = trip.get("filename")
            title = trip.get("title")
            comment = trip.get("comment")

            # Date filtering by timestamp
            if not start or not end:
                # If dates missing, we can’t match -> count 0
                matched: List[Dict[str, Any]] = []
            else:
                sd = parse_yyyy_mm_dd(start)
                ed = parse_yyyy_mm_dd(end)
                matched = []
                for f in features:
                    ts = f.get("properties", {}).get("timestamp")
                    if not ts:
                        continue
                    try:
                        d = parse_yyyy_mm_dd(ts[:10])
                    except Exception:
                        continue
                    if sd <= d <= ed:
                        matched.append(f)

            count = len(matched)
            if count > 0:
                # write dataset file
                atomic_write_json(os.path.join(OUT_ANV, f"{tid}.geo.json"), {"type": "FeatureCollection", "features": matched})

            out_grp["trips"].append({
                "id": tid,
                "title": title,
                "comment": comment,
                "startDate": start,
                "endDate": end,
                "filename": filename,   # <- YOU REQUESTED THIS BACK
                "count": count,
            })

        # keep groups even if all trips are 0? (I’d keep them; you can hide in UI if needed)
        out["groups"].append(out_grp)

    return out

def build_problems_no_coordinates(no_coords: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Segment no-coordinate photos by YYYY-MM based on timestamp (like time index),
    but keep them under data/problems/no-coordinates/...
    """
    by_month: Dict[str, List[Dict[str, Any]]] = {}
    undated: List[Dict[str, Any]] = []

    for f in no_coords:
        ts = f.get("properties", {}).get("timestamp")
        if not ts:
            undated.append(f)
            continue
        mid = month_id_from_ts(ts)
        if not mid:
            undated.append(f)
            continue
        by_month.setdefault(mid, []).append(f)

    # write month datasets
    out_dir = os.path.join(OUT_PROB, "no-coordinates")
    ensure_dir(out_dir)

    index_years: Dict[int, Dict[str, Any]] = {}
    for mid, feats in by_month.items():
        atomic_write_json(os.path.join(out_dir, f"{mid}.geo.json"), {"type": "FeatureCollection", "features": feats})
        y = int(mid[:4])
        index_years.setdefault(y, {"id": str(y), "months": []})
        index_years[y]["months"].append({"id": mid, "count": len(feats)})

    for y in index_years:
        index_years[y]["months"].sort(key=lambda m: m["id"])

    decades_map: Dict[str, Dict[str, Any]] = {}
    for y, yobj in index_years.items():
        did = decade_id_from_year(y)
        decades_map.setdefault(did, {"id": did, "years": []})
        decades_map[did]["years"].append(yobj)

    for did in decades_map:
        decades_map[did]["years"].sort(key=lambda yy: yy["id"])

    decades = [decades_map[k] for k in sorted(decades_map.keys())]
    idx = {"decades": decades}

    atomic_write_json(os.path.join(out_dir, "index.json"), idx)

    # Optionally also write undated here if you want:
    atomic_write_json(os.path.join(out_dir, "no-timestamp.geo.json"), {"type": "FeatureCollection", "features": undated})

    return {
        "no_coordinates_total": len(no_coords),
        "no_coordinates_dated": sum(len(v) for v in by_month.values()),
        "no_coordinates_undated": len(undated),
        "no_coordinates_month_files": len(by_month),
    }

def write_stats(features: List[Dict[str, Any]], no_ts: List[Dict[str, Any]], no_coords: List[Dict[str, Any]]) -> None:
    total = len(features)
    dated = total - len(no_ts)
    geotagged = sum(1 for f in features if f.get("geometry") and f["geometry"].get("type") == "Point")
    stats = {
        "total": total,
        "dated": dated,
        "geotagged": geotagged,
        "no_timestamp": len(no_ts),
        "no_coordinates": len(no_coords),
        "updated": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    atomic_write_json(os.path.join(REPO_ROOT, "data/stats.json"), stats)

def main() -> int:
    started = datetime.utcnow()
    ensure_dir(OUT_TID)
    ensure_dir(OUT_STED)
    ensure_dir(OUT_ANV)
    ensure_dir(OUT_PROB)
    ensure_dir(REPORTS_DIR)

    report: Dict[str, Any] = {
        "started": started.isoformat(timespec="seconds") + "Z",
        "inputs": {
            "images_index": IMAGES_INDEX,
            "areas": AREAS_FILE,
            "trips": TRIPS_FILE,
        },
        "outputs": {},
        "notes": [],
        "errors": [],
    }

    try:
        items, areas, trips = load_inputs()
        features = build_all_features(items)

        # TIME
        tid_index, by_month, no_ts = build_time_datasets(features)
        atomic_write_json(os.path.join(OUT_TID, "index.json"), tid_index)
        for mid, feats in by_month.items():
            atomic_write_json(os.path.join(OUT_TID, f"{mid}.geo.json"), {"type": "FeatureCollection", "features": feats})
        atomic_write_json(os.path.join(OUT_TID, "no-timestamp.geo.json"), {"type": "FeatureCollection", "features": no_ts})

        report["outputs"]["tid"] = {
            "months": len(by_month),
            "no_timestamp": len(no_ts),
        }

        # PLACE
        sted_index_list, by_area, unmatched, no_coords = build_place_datasets(features, areas)
        atomic_write_json(os.path.join(OUT_STED, "index.json"), sted_index_list)
        for area_id, feats in by_area.items():
            if feats:
                atomic_write_json(os.path.join(OUT_STED, f"{area_id}.geo.json"), {"type": "FeatureCollection", "features": feats})
        # Renamed per your request
        atomic_write_json(os.path.join(OUT_STED, "unmatched-geometry.geo.json"), {"type": "FeatureCollection", "features": unmatched})
        atomic_write_json(os.path.join(OUT_STED, "no-coordinates.geo.json"), {"type": "FeatureCollection", "features": no_coords})

        report["outputs"]["sted"] = {
            "areas_with_photos": len([x for x in sted_index_list if x.get("count", 0) > 0]),
            "unmatched_geometry": len(unmatched),
            "no_coordinates": len(no_coords),
        }

        # TRIPS / ANVENDELSE
        anv_index = build_trip_datasets(features, trips)
        atomic_write_json(os.path.join(OUT_ANV, "index.json"), anv_index)

        report["outputs"]["anvendelse"] = {
            "groups": len(anv_index.get("groups", [])),
        }

        # PROBLEMS (segmented no-coordinates)
        prob_stats = build_problems_no_coordinates(no_coords)
        report["outputs"]["problems"] = prob_stats

        # Tiny stats for UI
        write_stats(features, no_ts, no_coords)
        report["outputs"]["stats_json"] = os.path.join(REPO_ROOT, "data/stats.json")

    except Exception as e:
        report["errors"].append(repr(e))
        finished = datetime.utcnow()
        report["finished"] = finished.isoformat(timespec="seconds") + "Z"
        report["duration_seconds"] = (finished - started).total_seconds()
        stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        atomic_write_json(os.path.join(REPORTS_DIR, f"datasets-{stamp}.json"), report)
        raise

    finished = datetime.utcnow()
    report["finished"] = finished.isoformat(timespec="seconds") + "Z"
    report["duration_seconds"] = (finished - started).total_seconds()
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    atomic_write_json(os.path.join(REPORTS_DIR, f"datasets-{stamp}.json"), report)

    return 0

if __name__ == "__main__":
    sys.exit(main())