"""Build the static JSON data, images and audio used by the website.

Inputs (all inside bda_project/):
  project_bda/f1-azerbaijan/data/*.csv      raw TracingInsights CSVs (also in HDFS /bda/f1-telemetry/raw)
  f1_dashboard_data/analysis_v2/            Spark outputs pulled from HDFS
  f1_dashboard_data/model_export/           Random Forest exported by code/f1_export_rf_model.py
  data_sources/tracinginsights_2025/        session JSON, images and team radio from TracingInsights/2025

Output: website/public/{data,img,audio}

Usage: python website/scripts/build_data.py
"""
import json
import math
import os
import shutil
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "project_bda", "f1-azerbaijan", "data")
SPARK = os.path.join(ROOT, "f1_dashboard_data", "analysis_v2")
MODEL = os.path.join(ROOT, "f1_dashboard_data", "model_export", "next_lap_rf.json")
TI = os.path.join(ROOT, "data_sources", "tracinginsights_2025")
EVENT_DIR = os.path.join(TI, "Azerbaijan Grand Prix")
PUBLIC = os.path.join(ROOT, "website", "public")
DATA = os.path.join(PUBLIC, "data")

SESSIONS = [
    ("Practice 1", "practice-1", "FP1"),
    ("Practice 2", "practice-2", "FP2"),
    ("Practice 3", "practice-3", "FP3"),
    ("Qualifying", "qualifying", "QUALI"),
    ("Race", "race", "RACE"),
]
REPLAY_STEP = 0.5          # seconds between replay frames
FASTEST_STEP = 10.0        # metres between fastest-lap telemetry samples
POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]


def slugify(name):
    return name.lower().replace(" ", "-")


def load_json(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return json.load(f)


def write_json(obj, *parts):
    path = os.path.join(DATA, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)
    print(f"  {os.path.relpath(path, PUBLIC):45s} {os.path.getsize(path) / 1024:8.1f} KB")


def clean(v, digits=3):
    """JSON-safe scalar: NaN/None -> None, numpy -> python, floats rounded."""
    if v is None:
        return None
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return None if math.isnan(v) or math.isinf(v) else round(float(v), digits)
    if isinstance(v, str) and v in ("None", "nan", ""):
        return None
    return v


def records(df, digits=3):
    return [{k: clean(v, digits) for k, v in row.items()} for row in df.to_dict("records")]


def parse_utc(s):
    s = s.replace("Z", "").split("+")[0]
    if "." in s:
        head, frac = s.split(".")
        s = head + "." + frac[:6]
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------
# Circuit geometry (FastF1-style rotation, metres, SVG y-down)
# ------------------------------------------------------------------

corners_raw = load_json(EVENT_DIR, "Race", "corners.json")
ROT = math.radians(corners_raw["Rotation"])
COS, SIN = math.cos(ROT), math.sin(ROT)


def to_track(x, y):
    """Raw position units (1/10 m) -> rotated metres with y pointing down."""
    x = np.asarray(x, dtype=float) / 10.0
    y = np.asarray(y, dtype=float) / 10.0
    rx = x * COS - y * SIN
    ry = x * SIN + y * COS
    return rx, -ry


def build_circuit():
    tx, ty = to_track(corners_raw["TrackX"], corners_raw["TrackY"])
    # Light decimation: keep a point roughly every 8 m.
    keep = [0]
    for i in range(1, len(tx)):
        if math.hypot(tx[i] - tx[keep[-1]], ty[i] - ty[keep[-1]]) >= 8:
            keep.append(i)
    outline = [[round(tx[i], 1), round(ty[i], 1)] for i in keep]

    corners = []
    cx, cy = to_track(corners_raw["X"], corners_raw["Y"])
    for i, num in enumerate(corners_raw["CornerNumber"]):
        ang = math.radians(corners_raw["Angle"][i])
        # Offset the label 55 m away from the apex along the corner angle (FastF1 example).
        ox, oy = 550 * math.cos(ang), 550 * math.sin(ang)
        lx, ly = to_track([corners_raw["X"][i] + ox], [corners_raw["Y"][i] + oy])
        corners.append({
            "n": f"{num}{corners_raw['CornerLetter'][i]}",
            "x": round(cx[i], 1), "y": round(cy[i], 1),
            "lx": round(float(lx[0]), 1), "ly": round(float(ly[0]), 1),
            "d": round(corners_raw["Distance"][i], 1),
        })

    sectors = []
    for i, n in enumerate(corners_raw["MarshalSectorNumber"]):
        sx, sy = to_track([corners_raw["MarshalSectorX"][i]], [corners_raw["MarshalSectorY"][i]])
        sectors.append({"n": n, "x": round(float(sx[0]), 1), "y": round(float(sy[0]), 1)})

    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    return {
        "name": "Baku City Circuit",
        "location": corners_raw["Location"],
        "country": corners_raw["CountryName"],
        "pitLoss": corners_raw["PitLossNormal"],
        "pitLossSC": corners_raw["PitLossSC"],
        "outline": outline,
        "corners": corners,
        "marshalSectors": sectors,
        "bounds": [min(xs), min(ys), max(xs), max(ys)],
    }


# ------------------------------------------------------------------
# Drivers, images
# ------------------------------------------------------------------

def build_drivers():
    manifest = load_json(TI, "images", "manifest.json")
    heads = {d["driver"]: d["file"] for d in manifest["headshots"]}
    bodies = {d["driver"]: d["file"] for d in manifest["drivers"]}
    cars = {c["team"]: c["file"] for c in manifest["cars"]}

    img_dir = os.path.join(PUBLIC, "img")
    shutil.rmtree(img_dir, ignore_errors=True)
    os.makedirs(os.path.join(img_dir, "drivers"))
    os.makedirs(os.path.join(img_dir, "cars"))

    drivers, teams = [], {}
    for d in load_json(EVENT_DIR, "Race", "drivers.json")["drivers"]:
        code = d["driver"]
        src = heads.get(code) or bodies.get(code)
        if src:
            im = Image.open(os.path.join(TI, "images", src)).convert("RGBA")
            if src.startswith("drivers/"):
                # Full-body render: crop a square around the head.
                w, h = im.size
                im = im.crop((0, 0, w, min(h, w)))
            im.thumbnail((320, 320))
            im.save(os.path.join(img_dir, "drivers", f"{code}.webp"), quality=86)
        team_slug = slugify(d["team"])
        if d["team"] not in teams:
            car_src = cars.get(d["team"])
            if car_src:
                im = Image.open(os.path.join(TI, "images", car_src)).convert("RGBA")
                im.thumbnail((900, 900))
                im.save(os.path.join(img_dir, "cars", f"{team_slug}.webp"), quality=86)
            teams[d["team"]] = {
                "name": d["team"], "slug": team_slug, "color": "#" + d["tc"],
                "car": f"img/cars/{team_slug}.webp" if car_src else None,
            }
        drivers.append({
            "code": code, "number": int(d["dn"]), "first": d["fn"], "last": d["ln"],
            "team": d["team"], "color": "#" + d["tc"],
            "photo": f"img/drivers/{code}.webp" if src else None,
        })

    # Team-mates get a dashed line in charts, like F1 TV graphics.
    seen = set()
    for d in drivers:
        d["second"] = d["team"] in seen
        seen.add(d["team"])
    return drivers, list(teams.values())


# ------------------------------------------------------------------
# Laps
# ------------------------------------------------------------------

LAP_COLS = {
    "driver": "driver", "lap": "lap", "lap_time_s": "time",
    "sector1_s": "s1", "sector2_s": "s2", "sector3_s": "s3",
    "compound": "compound", "tyre_life": "tyre", "stint": "stint", "fresh_tyre": "fresh",
    "position": "pos", "lap_start_time_s": "start", "session_time_s": "end",
    "pit_in_time_s": "pitIn", "pit_out_time_s": "pitOut", "track_status": "status",
    "deleted": "deleted", "is_accurate": "accurate", "personal_best": "pb",
    "speed_trap": "trap", "air_temp_c": "air", "track_temp_c": "track",
}


def build_laps(lt, session):
    df = lt[lt.session == session][list(LAP_COLS)].rename(columns=LAP_COLS)
    df = df.sort_values(["driver", "lap"])
    df["status"] = df["status"].apply(lambda s: None if pd.isna(s) else str(int(s)) if isinstance(s, float) else str(s))
    out = {}
    for drv, g in df.groupby("driver"):
        out[drv] = records(g.drop(columns="driver"))
    return out


def classification(session, laps, drivers):
    order = [d["code"] for d in drivers]
    rows = []
    if session == "Race":
        official = [d["driver"] for d in load_json(EVENT_DIR, "Race", "drivers.json")["drivers"]]
        total = max(len(v) for v in laps.values())
        winner_end = None
        for pos, code in enumerate(official, 1):
            L = laps.get(code, [])
            done = len(L)
            end = L[-1]["end"] if L else None
            if pos == 1:
                winner_end = end
            best = min((l["time"] for l in L if l["time"]), default=None)
            if done == total:
                gap = None if pos == 1 else round(end - winner_end, 3)
                status = "Finished"
            else:
                gap = None
                status = f"+{total - done} Lap{'s' if total - done > 1 else ''}" if done >= total * 0.9 else "DNF"
            rows.append({"pos": pos, "code": code, "laps": done, "gap": gap, "status": status,
                         "best": best, "points": POINTS[pos - 1] if pos <= 10 and status != "DNF" else 0,
                         "raceTime": round(end - L[0]["start"], 3) if pos == 1 and L else None})
    else:
        best = []
        for code in order:
            L = [l for l in laps.get(code, []) if l["time"] and not l["deleted"]]
            if L:
                b = min(L, key=lambda l: l["time"])
                best.append((b["time"], code, b["lap"], b["compound"], len(laps[code])))
        best.sort()
        for pos, (t, code, lap, comp, n) in enumerate(best, 1):
            rows.append({"pos": pos, "code": code, "best": t, "bestLap": lap, "compound": comp,
                         "laps": n, "gap": None if pos == 1 else round(t - best[0][0], 3)})
    return rows


# ------------------------------------------------------------------
# Replay positions (raw telemetry, resampled to a fixed time grid)
# ------------------------------------------------------------------

def build_replay(tel, lt, session, info):
    starts = lt[lt.session == session].set_index(["driver", "lap"])["lap_start_time_s"]
    t = tel[tel.session == session].copy()
    t["ts"] = t.set_index(["driver", "lap"]).index.map(starts).values + t["time"].values
    t = t.dropna(subset=["ts", "x", "y", "rel_distance"])
    t = t[(t.x != 0) | (t.y != 0)]

    if session == "Race":
        t_start = info["session_start_time"] - 20
    else:
        t_start = t.ts.min()
    t_end = t.ts.max()
    grid = np.arange(math.floor(t_start), math.ceil(t_end) + REPLAY_STEP, REPLAY_STEP)

    cars = {}
    for drv, g in t.groupby("driver", observed=True):
        g = g.sort_values("ts").drop_duplicates("ts")
        ts = g.ts.values
        x, y = to_track(g.x.values, g.y.values)
        prog = (g.lap.values - 1) + np.clip(g.rel_distance.values, 0, 1)
        speed = np.nan_to_num(g.speed.values)
        gear = np.nan_to_num(g.gear.values)
        idx = np.searchsorted(ts, grid)
        prev_gap = grid - ts[np.clip(idx - 1, 0, len(ts) - 1)]
        next_gap = ts[np.clip(idx, 0, len(ts) - 1)] - grid
        valid = (idx > 0) & (idx < len(ts)) & (prev_gap <= 2.0) & (next_gap <= 2.0)
        gx = np.interp(grid, ts, x)
        gy = np.interp(grid, ts, y)
        gp = np.interp(grid, ts, prog)
        near = np.clip(np.searchsorted(ts, grid), 0, len(ts) - 1)
        cars[drv] = {
            "x": [int(round(v)) if ok else None for v, ok in zip(gx, valid)],
            "y": [int(round(v)) if ok else None for v, ok in zip(gy, valid)],
            "p": [int(round(v * 1000)) if ok else None for v, ok in zip(gp, valid)],
            # speed*10 + gear packed into one int
            "s": [int(speed[i]) * 10 + int(gear[i]) if ok else None for i, ok in zip(near, valid)],
        }
    return {"t0": float(grid[0]), "dt": REPLAY_STEP, "n": len(grid), "cars": cars}


# ------------------------------------------------------------------
# Fastest laps (Spark output analysis_v2/fastest_laps)
# ------------------------------------------------------------------

def build_fastest(fast, session, laps):
    out = {}
    f = fast[fast.session == session]
    for drv, g in f.groupby("driver"):
        g = g.sort_values("distance").drop_duplicates("distance")
        g = g[g.distance >= 0]
        if len(g) < 50:
            continue
        lap = int(g.lap.iloc[0])
        lap_time = next((l["time"] for l in laps.get(drv, []) if l["lap"] == lap), None)
        d = np.arange(0, g.distance.max(), FASTEST_STEP)
        speed = np.interp(d, g.distance, g.speed)
        # Cumulative time from distance / speed, rescaled so it ends at the real lap time.
        tt = np.concatenate([[0], np.cumsum(FASTEST_STEP / np.maximum(speed[:-1], 20) * 3.6)])
        if lap_time:
            tt *= lap_time / (tt[-1] + FASTEST_STEP / max(speed[-1], 20) * 3.6)
        near = np.clip(np.searchsorted(g.distance.values, d), 0, len(g) - 1)
        x, y = to_track(g.x.values, g.y.values)
        out[drv] = {
            "lap": lap, "lapTime": lap_time, "compound": next((l["compound"] for l in laps.get(drv, []) if l["lap"] == lap), None),
            "d": [round(v) for v in d],
            "t": [round(v, 3) for v in tt],
            "speed": [round(v) for v in speed],
            "throttle": [int(np.clip(g.throttle.values[i], 0, 100)) for i in near],
            "brake": [int(g.brake.values[i]) for i in near],
            "gear": [int(g.gear.values[i]) if not np.isnan(g.gear.values[i]) else 0 for i in near],
            "drs": [int(g.drs.values[i] >= 10 or g.drs.values[i] == 1) for i in near],
            "x": [round(float(np.interp(v, g.distance, x)), 1) for v in d],
            "y": [round(float(np.interp(v, g.distance, y)), 1) for v in d],
        }
    return out


# ------------------------------------------------------------------
# Race events: track status, race control, team radio, weather
# ------------------------------------------------------------------

STATUS_NAMES = {"1": "Green", "2": "Yellow", "4": "Safety Car", "5": "Red Flag", "6": "VSC", "7": "VSC Ending"}


def build_events(session, slug):
    info = load_json(EVENT_DIR, session, "session_info.json")
    t0 = parse_utc(info["t0_date"])
    ts = info["track_status"]
    status = [{"t": round(t, 2), "code": c, "label": STATUS_NAMES.get(c, m)}
              for t, c, m in zip(ts["Time"], ts["Status"], ts["Message"])]

    rcm = load_json(EVENT_DIR, session, "rcm.json")
    messages = []
    for i, when in enumerate(rcm["time"]):
        messages.append({
            "t": round((parse_utc(when) - t0).total_seconds(), 1),
            "cat": clean(rcm["cat"][i]), "msg": rcm["msg"][i], "flag": clean(rcm["flag"][i]),
            "lap": clean(rcm["lap"][i]),
        })

    radio = []
    tr = load_json(EVENT_DIR, session, "team_radio.json")
    audio_dir = os.path.join(PUBLIC, "audio", slug)
    os.makedirs(audio_dir, exist_ok=True)
    for drv, when, file in zip(tr["drv"], tr["date"], tr["file"]):
        src = os.path.join(EVENT_DIR, session, *file.split("/"))
        if not os.path.exists(src):
            continue
        name = os.path.basename(file)
        shutil.copyfile(src, os.path.join(audio_dir, name))
        radio.append({"t": round((parse_utc(when) - t0).total_seconds(), 1),
                      "driver": drv, "src": f"audio/{slug}/{name}"})

    w = load_json(EVENT_DIR, session, "weather.json")
    weather = {"t": w["wT"], "air": w["wAT"], "track": w["wTT"], "humidity": w["wH"],
               "rain": w["wR"], "wind": w["wWS"], "windDir": w["wWD"]}

    sess_status = info.get("session_status", {})
    return info, {
        "trackStatus": status, "raceControl": messages, "radio": radio, "weather": weather,
        "sessionStatus": [{"t": t, "status": s} for t, s in zip(sess_status.get("Time", []), sess_status.get("Status", []))],
        "start": info.get("session_start_time"), "totalLaps": info.get("total_laps"),
        "date": info["t0_date"],
    }


# ------------------------------------------------------------------
# Spark analytics (analysis_v2)
# ------------------------------------------------------------------

def build_analytics():
    p = lambda *x: pd.read_parquet(os.path.join(SPARK, *x))
    lf = pd.read_parquet(os.path.join(ROOT, "f1_dashboard_data", "lap_features"))
    return {
        "tyreDegradation": records(p("tyre_degradation"), 4),
        "driverClusters": records(p("driver_clusters"), 4),
        "anomalies": records(p("telemetry_anomalies"), 3),
        "chase": {
            "edges": records(p("chase_graph", "edges").sort_values("weight", ascending=False), 2),
            "inDegree": records(p("chase_graph", "in_degree")),
            "outDegree": records(p("chase_graph", "out_degree")),
        },
        "nextLap": {
            "predictions": records(p("next_lap_prediction", "predictions").sort_values(["driver", "lap"]), 3),
            "metrics": records(p("next_lap_prediction", "session_metrics"), 4),
        },
        "lapFeatures": {
            "rows": int(len(lf)),
            "pushLaps": int(lf.is_push_lap.sum()),
            "perSession": records(lf.groupby("session").agg(laps=("lap", "size"), push=("is_push_lap", "sum"),
                                                            avgSpeed=("avg_speed", "mean"), samples=("telemetry_samples", "sum"))
                                  .reset_index(), 2),
        },
    }


def main():
    shutil.rmtree(DATA, ignore_errors=True)
    shutil.rmtree(os.path.join(PUBLIC, "audio"), ignore_errors=True)
    os.makedirs(DATA)

    print("Reading raw CSVs ...")
    lt = pd.read_csv(os.path.join(RAW, "laptimes.csv"))
    tel = pd.read_csv(
        os.path.join(RAW, "telemetry.csv"),
        usecols=["session", "driver", "lap", "time", "speed", "gear", "rel_distance", "x", "y"],
        dtype={"session": "category", "driver": "category", "lap": "int16", "time": "float64",
               "speed": "float32", "gear": "float32", "rel_distance": "float32", "x": "float32", "y": "float32"},
    )
    fast = pd.read_parquet(os.path.join(SPARK, "fastest_laps"))
    stints = pd.read_parquet(os.path.join(SPARK, "stints"))
    tel_rows = len(tel)

    print("Circuit, drivers, images ...")
    circuit = build_circuit()
    drivers, teams = build_drivers()

    sessions_meta = []
    for session, slug, short in SESSIONS:
        print(f"{session} ...")
        info, events = build_events(session, slug)
        laps = build_laps(lt, session)
        replay = build_replay(tel, lt, session, info)
        st = stints[stints.session == session].drop(columns="session").sort_values(["driver", "stint"])
        write_json(laps, "sessions", slug, "laps.json")
        write_json(replay, "sessions", slug, "replay.json")
        write_json(build_fastest(fast, session, laps), "sessions", slug, "fastest.json")
        write_json(events, "sessions", slug, "events.json")
        write_json({"classification": classification(session, laps, drivers),
                    "stints": records(st)}, "sessions", slug, "results.json")
        all_laps = [l for L in laps.values() for l in L]
        timed = [l for l in all_laps if l["time"] and not l["deleted"]]
        fastest = min(timed, key=lambda l: l["time"])
        fastest_driver = next(d for d, L in laps.items() if fastest in L)
        sessions_meta.append({
            "name": session, "slug": slug, "short": short, "date": info["t0_date"][:10],
            "laps": len(all_laps), "maxLap": max(l["lap"] for l in all_laps),
            "drivers": len(laps), "replayFrames": replay["n"], "radio": len(events["radio"]),
            "fastest": {"driver": fastest_driver, "time": fastest["time"], "lap": fastest["lap"]},
            "airTemp": round(float(np.mean(events["weather"]["air"])), 1),
            "trackTemp": round(float(np.mean(events["weather"]["track"])), 1),
        })

    write_json({
        "event": {"name": "Azerbaijan Grand Prix", "official": "Formula 1 Qatar Airways Azerbaijan Grand Prix 2025",
                  "round": 17, "year": 2025, "dates": "19 - 21 Sep 2025"},
        "circuit": circuit,
        "drivers": drivers,
        "teams": teams,
        "sessions": sessions_meta,
        "dataset": {
            "telemetryRows": int(tel_rows), "lapRows": int(len(lt)),
            "telemetryMB": round(os.path.getsize(os.path.join(RAW, "telemetry.csv")) / 1024 ** 2, 1),
            "source": "TracingInsights/2025 (GitHub, Apache-2.0)",
            "sourceUrl": "https://github.com/TracingInsights/2025",
            "doi": "10.5281/zenodo.17312803",
        },
    }, "meta.json")

    write_json(build_analytics(), "analytics.json")
    if os.path.exists(MODEL):
        with open(MODEL) as f:
            write_json(json.load(f), "model.json")
    else:
        print("  !! model.json missing: run code/f1_export_rf_model.py on the cluster first")


if __name__ == "__main__":
    main()
