#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DailyPoem 2.0 — Synology DS420+ (Intel Celeron J4025) FastAPI Backend & 03:00 AM Batch Scheduler
- Daytime: 0% CV / 0% image resize overhead — streams pre-cached FHD (1920px) JPEGs from /data/cache_fhd
- Nighttime (03:00 AM KST): Triggers DS420BatchIndexer in a low-priority background thread (os.nice(15), 1 thread)
- Weather Proxy: Caches Daegu (35.8714, 128.6014) Open-Meteo weather for 30 minutes
"""

import asyncio
import json
import os
import pathlib
import time
import urllib.request
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from batch_indexer import DS420BatchIndexer

APP_DIR = pathlib.Path(__file__).resolve().parent
PHOTOS_DIR = pathlib.Path(os.environ.get("PHOTOS_DIR", str(APP_DIR / "photos")))
DATA_DIR = pathlib.Path(os.environ.get("DATA_DIR", str(APP_DIR)))
CACHE_DIR = pathlib.Path(os.environ.get("CACHE_DIR", str(DATA_DIR / "cache_fhd")))
INDEX_FILE = DATA_DIR / "media_index.json"
BATCH_HOUR = int(os.environ.get("BATCH_INDEX_HOUR", "3"))  # Default: 03:00 AM
BATCH_SLEEP_MS = int(os.environ.get("BATCH_SLEEP_MS", "80"))

WEATHER_CACHE = {"data": None, "ts": 0.0}
LAST_BATCH_DATE = None


def run_sync_batch(force: bool = False):
    indexer = DS420BatchIndexer(
        photos_dir=PHOTOS_DIR,
        cache_dir=CACHE_DIR,
        index_file=INDEX_FILE,
        sleep_ms=BATCH_SLEEP_MS,
        low_priority=True,
    )
    return indexer.run_batch(force_reanalyse=force)


async def nightly_batch_loop():
    global LAST_BATCH_DATE
    # Initial incremental check on container startup (skips already cached photos in <10ms)
    await asyncio.to_thread(run_sync_batch, False)
    while True:
        await asyncio.sleep(300)  # Check every 5 minutes
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        if now.hour == BATCH_HOUR and LAST_BATCH_DATE != today_str:
            LAST_BATCH_DATE = today_str
            await asyncio.to_thread(run_sync_batch, False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(nightly_batch_loop())
    yield
    task.cancel()


app = FastAPI(title="DailyPoem 2.0 Synology DS420+ Frame Server", lifespan=lifespan)


@app.get("/api/media")
async def get_media():
    if not INDEX_FILE.exists():
        await asyncio.to_thread(run_sync_batch, False)
    try:
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        # Rewrite src to use the zero-CPU FHD cached streaming endpoint
        for item in data.get("items", []):
            item["src"] = f"./api/photo/{item['id']}"
        return JSONResponse(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/photo/{photo_id}")
async def stream_cached_photo(photo_id: str):
    safe_id = "".join(c for c in photo_id if c.isalnum() or c in ("_", "-"))
    cached_jpg = CACHE_DIR / f"{safe_id}.jpg"
    if cached_jpg.exists():
        return FileResponse(
            cached_jpg,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )
    raise HTTPException(status_code=404, detail="Cached photo not found")


@app.post("/api/scan")
async def trigger_manual_scan(force: bool = Query(False)):
    result = await asyncio.to_thread(run_sync_batch, force)
    return {"status": "ok", "benchmark": result.get("benchmark", {})}


@app.get("/api/weather")
async def get_daegu_weather(lat: float = 35.8714, lon: float = 128.6014):
    now = time.time()
    if WEATHER_CACHE["data"] and (now - WEATHER_CACHE["ts"] < 1800):
        return WEATHER_CACHE["data"]

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&current=temperature_2m,weather_code&timezone=Asia%2FSeoul"
    )
    try:
        def _fetch():
            req = urllib.request.Request(url, headers={"User-Agent": "DailyPoemFrame/2.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode("utf-8"))

        raw = await asyncio.to_thread(_fetch)
        cur = raw.get("current", {})
        code = cur.get("weather_code", 0)
        icon, label = "☀️", "맑음"
        if code in (1, 2):
            icon, label = "🌤️", "구름 조금"
        elif code == 3:
            icon, label = "☁️", "흐림"
        elif code in (45, 48):
            icon, label = "🌫️", "안개"
        elif 51 <= code <= 67 or 80 <= code <= 82:
            icon, label = "🌧️", "비"
        elif 71 <= code <= 77:
            icon, label = "❄️", "눈"

        payload = {
            "temp": round(float(cur.get("temperature_2m", 18.4)), 1),
            "icon": icon,
            "label": label,
            "city": "대구",
            "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        WEATHER_CACHE["data"] = payload
        WEATHER_CACHE["ts"] = now
        return payload
    except Exception:
        return WEATHER_CACHE["data"] or {"temp": 18.4, "icon": "☀️", "label": "맑음", "city": "대구"}




@app.post("/api/heart")
async def record_heart(payload: dict):
    target_type = payload.get("targetType", "poem")
    item_id = str(payload.get("id", ""))
    hearts_file = DATA_DIR / "hearts_store.json"
    store = {"poem": {}, "photo": {}}
    if hearts_file.exists():
        try:
            store = json.loads(hearts_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    bucket = store.setdefault(target_type, {})
    bucket[item_id] = int(bucket.get(item_id, 0)) + 1
    hearts_file.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "ok", "targetType": target_type, "id": item_id, "hearts": bucket[item_id]}

app.mount("/", StaticFiles(directory=str(APP_DIR), html=True), name="static")
