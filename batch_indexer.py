#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DailyPoem 2.0 — Synology DS420+ (Intel Celeron J4025) Nightly Batch Indexer & FHD Cache Builder
- Runs at 03:00 AM (via built-in scheduler or Synology DSM Task Scheduler / cron)
- Throttles CPU usage via os.nice(15), cv2.setNumThreads(1), and configurable sleep pacing
- Pre-generates EXIF-corrected FHD (1920px) cached JPEGs so daytime streaming uses 0% CPU
- Detects human faces / upper bodies via OpenCV Headless on 640px downscaled frames
  to compute face-centered focal coordinates (focalX, focalY) for Smart Crop & Ken Burns
"""

import argparse
import gc
import hashlib
import json
import os
import pathlib
import resource
import time
from datetime import datetime

# Force single-thread execution for DS420+ (2-core Celeron J4025) safety
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import cv2
import numpy as np
from PIL import ExifTags, Image, ImageOps

cv2.setNumThreads(1)

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Optional friendly metadata overrides for the built-in GitHub Pages sample gallery
SAMPLE_META_OVERRIDES = {
    "sample_01_portrait_golden.jpg": {
        "album": "인물_스냅",
        "title": "노을빛 산책길의 미소",
        "takenAt": "2026-09-28T17:42:10",
        "dateLabel": "2026년 9월 28일 · 노을빛 산책",
        "hasPerson": True,
        "faceCount": 1,
        "focalX": 50.0,
        "focalY": 32.0,
        "hearts": 19,
    },
    "sample_02_portrait_cafe.jpg": {
        "album": "인물_스냅",
        "title": "오후 세 시, 창가의 독서",
        "takenAt": "2026-10-03T15:18:00",
        "dateLabel": "2026년 10월 3일 · 오후의 창가",
        "hasPerson": True,
        "faceCount": 1,
        "focalX": 48.0,
        "focalY": 30.0,
        "hearts": 27,
    },
    "sample_03_portrait_twilight.jpg": {
        "album": "가족_일상",
        "title": "수성못의 푸른 저녁",
        "takenAt": "2026-10-07T18:35:22",
        "dateLabel": "2026년 10월 7일 · 수성못의 저녁",
        "hasPerson": True,
        "faceCount": 1,
        "focalX": 53.0,
        "focalY": 34.0,
        "hearts": 22,
    },
    "sample_04_vertical_autumn.jpg": {
        "album": "계절_풍경",
        "title": "팔공산 단풍이 물드는 길",
        "takenAt": "2026-10-10T11:20:45",
        "dateLabel": "2026년 10월 10일 · 가을 숲길",
        "hasPerson": False,
        "faceCount": 0,
        "focalX": 52.0,
        "focalY": 38.0,
        "hearts": 15,
    },
    "sample_05_landscape_family.jpg": {
        "album": "가족_일상",
        "title": "가을 들녘의 다정한 오후",
        "takenAt": "2026-10-11T16:50:12",
        "dateLabel": "2026년 10월 11일 · 들녘의 오후",
        "hasPerson": True,
        "faceCount": 1,
        "focalX": 38.0,
        "focalY": 38.0,
        "hearts": 31,
    },
    "sample_06_landscape_lake.jpg": {
        "album": "계절_풍경",
        "title": "물안개 피어오르는 새벽 호수",
        "takenAt": "2026-10-12T06:45:30",
        "dateLabel": "2026년 10월 12일 · 새벽 호수",
        "hasPerson": False,
        "faceCount": 0,
        "focalX": 58.0,
        "focalY": 42.0,
        "hearts": 18,
    },
    "sample_07_wide_night.jpg": {
        "album": "계절_풍경",
        "title": "별빛이 내려앉은 밤의 능선",
        "takenAt": "2026-10-13T21:15:00",
        "dateLabel": "2026년 10월 13일 · 별빛 능선",
        "hasPerson": False,
        "faceCount": 0,
        "focalX": 36.0,
        "focalY": 35.0,
        "hearts": 24,
    },
    "sample_08_portrait_warmth.jpg": {
        "album": "가족_일상",
        "title": "따뜻한 차 한 잔과 다정한 시선",
        "takenAt": "2026-10-14T10:12:00",
        "dateLabel": "2026년 10월 14일 · 다정한 아침",
        "hasPerson": True,
        "faceCount": 1,
        "focalX": 52.0,
        "focalY": 33.0,
        "hearts": 29,
    },
}


class DS420BatchIndexer:
    def __init__(
        self,
        photos_dir: pathlib.Path,
        cache_dir: pathlib.Path,
        index_file: pathlib.Path,
        fhd_max_edge: int = 1920,
        jpeg_quality: int = 86,
        sleep_ms: int = 60,
        low_priority: bool = True,
    ):
        self.photos_dir = pathlib.Path(photos_dir)
        self.cache_dir = pathlib.Path(cache_dir)
        self.index_file = pathlib.Path(index_file)
        self.fhd_max_edge = fhd_max_edge
        self.jpeg_quality = jpeg_quality
        self.sleep_ms = sleep_ms

        if low_priority and hasattr(os, "nice"):
            try:
                os.nice(15)
            except OSError:
                pass

        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.frontal_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.profile_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_profileface.xml"
        )

    @staticmethod
    def extract_exif_datetime(img: Image.Image, fallback_mtime: float) -> tuple[str, str]:
        try:
            exif = img.getexif()
            if exif:
                for tag_id, val in exif.items():
                    tag = ExifTags.TAGS.get(tag_id, tag_id)
                    if tag in ("DateTimeOriginal", "DateTime") and isinstance(val, str):
                        clean = val.strip().replace("-", ":")
                        dt = datetime.strptime(clean[:19], "%Y:%m:%d %H:%M:%S")
                        iso = dt.strftime("%Y-%m-%dT%H:%M:%S")
                        label = f"{dt.year}년 {dt.month}월 {dt.day}일의 기록"
                        return iso, label
        except Exception:
            pass
        dt = datetime.fromtimestamp(fallback_mtime)
        return dt.strftime("%Y-%m-%dT%H:%M:%S"), f"{dt.year}년 {dt.month}월 {dt.day}일의 기록"

    def detect_face_and_focal(self, pil_img: Image.Image) -> tuple[bool, int, float, float]:
        """
        Downscales image to max 640px on CPU and runs Haar frontal + profile face detection.
        If no explicit face is found, uses contrast/saliency center-of-mass with portrait bias.
        """
        w, h = pil_img.size
        scale = min(1.0, 640.0 / max(w, h))
        sw, sh = max(64, int(w * scale)), max(64, int(h * scale))
        small = pil_img.resize((sw, sh), Image.Resampling.BILINEAR)
        gray = cv2.cvtColor(np.array(small), cv2.COLOR_RGB2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        faces = self.frontal_cascade.detectMultiScale(
            gray_eq, scaleFactor=1.12, minNeighbors=4, minSize=(28, 28)
        )
        if len(faces) == 0:
            faces = self.profile_cascade.detectMultiScale(
                gray_eq, scaleFactor=1.12, minNeighbors=4, minSize=(28, 28)
            )

        if len(faces) > 0:
            total_area = 0.0
            wx, wy = 0.0, 0.0
            for (fx, fy, fw, fh) in faces:
                area = float(fw * fh)
                cx = (fx + fw * 0.5) / sw * 100.0
                cy = (fy + fh * 0.45) / sh * 100.0
                wx += cx * area
                wy += cy * area
                total_area += area
            return True, int(len(faces)), round(wx / total_area, 1), round(wy / total_area, 1)

        # Fallback: edge-saliency weighted focal point (prevents sky/floor clipping)
        edges = cv2.Canny(gray, 50, 140).astype(np.float32)
        if edges.sum() > 100:
            ys, xs = np.indices(edges.shape)
            fx = float((xs * edges).sum() / edges.sum()) / sw * 100.0
            fy = float((ys * edges).sum() / edges.sum()) / sh * 100.0
            fx = max(20.0, min(80.0, fx))
            fy = max(24.0, min(68.0, fy))
            return False, 0, round(fx, 1), round(fy, 1)

        default_y = 35.0 if h > w else 46.0
        return False, 0, 50.0, default_y

    @staticmethod
    def extract_dominant_color(pil_img: Image.Image) -> tuple[str, bool]:
        tiny = pil_img.resize((16, 16), Image.Resampling.BILINEAR)
        arr = np.array(tiny, dtype=np.float32)
        r, g, b = int(arr[:, :, 0].mean()), int(arr[:, :, 1].mean()), int(arr[:, :, 2].mean())
        luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
        return f"#{r:02x}{g:02x}{b:02x}", bool(luma < 0.46)

    def run_batch(self, force_reanalyse: bool = False) -> dict:
        t0 = time.perf_counter()
        existing_map = {}
        if self.index_file.exists() and not force_reanalyse:
            try:
                old_data = json.loads(self.index_file.read_text(encoding="utf-8"))
                for item in old_data.get("items", []):
                    existing_map[item["relPath"]] = item
            except Exception:
                existing_map = {}

        items = []
        scanned = 0
        cached_hits = 0

        for path in sorted(self.photos_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTS:
                continue
            rel_path = path.relative_to(self.photos_dir).as_posix()
            stat = path.stat()
            photo_id = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:12]
            cache_path = self.cache_dir / f"{photo_id}.jpg"

            prev = existing_map.get(rel_path)
            if (
                prev
                and prev.get("mtime") == int(stat.st_mtime)
                and prev.get("size") == stat.st_size
                and cache_path.exists()
            ):
                items.append(prev)
                cached_hits += 1
                continue

            with Image.open(path) as raw_img:
                taken_at, date_label = self.extract_exif_datetime(raw_img, stat.st_mtime)
                img = ImageOps.exif_transpose(raw_img).convert("RGB")
                orig_w, orig_h = img.size

                # 1. Pre-build FHD (1920px) streaming cache
                if max(orig_w, orig_h) > self.fhd_max_edge:
                    scale = self.fhd_max_edge / float(max(orig_w, orig_h))
                    fhd_w = max(1, int(round(orig_w * scale)))
                    fhd_h = max(1, int(round(orig_h * scale)))
                    fhd_img = img.resize((fhd_w, fhd_h), Image.Resampling.LANCZOS)
                else:
                    fhd_w, fhd_h = orig_w, orig_h
                    fhd_img = img

                fhd_img.save(cache_path, format="JPEG", quality=self.jpeg_quality, optimize=True, progressive=True)

                # 2. Run low-overhead OpenCV face & focal coordinate analysis
                has_person, face_count, focal_x, focal_y = self.detect_face_and_focal(fhd_img)
                dom_hex, is_dark = self.extract_dominant_color(fhd_img)

            album = path.parent.name if path.parent != self.photos_dir else "기본_갤러리"
            aspect = round(fhd_w / float(fhd_h), 4)
            if aspect < 0.88:
                orientation = "portrait"
            elif aspect > 1.15:
                orientation = "landscape"
            else:
                orientation = "square"

            entry = {
                "id": photo_id,
                "filename": path.name,
                "relPath": rel_path,
                "src": f"./photos/{rel_path}",
                "cacheSrc": f"./cache_fhd/{photo_id}.jpg",
                "album": album,
                "title": path.stem.replace("_", " "),
                "takenAt": taken_at,
                "dateLabel": date_label,
                "width": fhd_w,
                "height": fhd_h,
                "aspectRatio": aspect,
                "orientation": orientation,
                "hasPerson": has_person,
                "faceCount": face_count,
                "focalX": focal_x,
                "focalY": focal_y,
                "dominantHex": dom_hex,
                "isDarkPhoto": is_dark,
                "hearts": prev.get("hearts", 0) if prev else 0,
                "mtime": int(stat.st_mtime),
                "size": stat.st_size,
            }

            if path.name in SAMPLE_META_OVERRIDES:
                entry.update(SAMPLE_META_OVERRIDES[path.name])

            items.append(entry)
            scanned += 1

            if scanned % 20 == 0:
                gc.collect()
            if self.sleep_ms > 0:
                time.sleep(self.sleep_ms / 1000.0)

        elapsed = round(time.perf_counter() - t0, 3)
        rss_mb = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1)

        albums_summary = {}
        for it in items:
            alb = it["album"]
            albums_summary[alb] = albums_summary.get(alb, 0) + 1

        payload = {
            "version": "2.0",
            "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "hardwareProfile": "Synology DS420+ (Intel Celeron J4025 x86_64) Low-CPU Batch Mode",
            "scheduleCron": "0 3 * * * (Daily 03:00 AM)",
            "benchmark": {
                "totalPhotos": len(items),
                "newlyIndexed": scanned,
                "skippedCached": cached_hits,
                "elapsedSeconds": elapsed,
                "avgMsPerPhoto": round((elapsed * 1000.0) / max(1, scanned), 1),
                "peakMemoryMB": rss_mb,
            },
            "albums": [{"name": k, "count": v} for k, v in sorted(albums_summary.items())],
            "items": items,
        }

        tmp_file = self.index_file.with_suffix(".tmp")
        tmp_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_file.replace(self.index_file)
        return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DailyPoem 2.0 Nightly Batch Indexer for Synology DS420+")
    parser.add_argument("--photos", default="./photos", help="Input photos directory")
    parser.add_argument("--cache", default="./cache_fhd", help="Output FHD cache directory")
    parser.add_argument("--index", default="./media_index.json", help="Output media_index.json path")
    parser.add_argument("--sleep-ms", type=int, default=60, help="Throttling sleep ms between photos")
    parser.add_argument("--force", action="store_true", help="Force re-indexing all photos")
    args = parser.parse_args()

    indexer = DS420BatchIndexer(
        photos_dir=pathlib.Path(args.photos),
        cache_dir=pathlib.Path(args.cache),
        index_file=pathlib.Path(args.index),
        sleep_ms=args.sleep_ms,
    )
    res = indexer.run_batch(force_reanalyse=args.force)
    print(json.dumps(res["benchmark"], ensure_ascii=False, indent=2))
