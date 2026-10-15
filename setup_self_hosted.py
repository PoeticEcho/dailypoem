#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DailyPoem 1.0 & 2.0 — 5대 정예 한글 서체 (.woff2) 로컬 영구 보관 스크립트
외부 CDN 의존성을 완전히 제거하고 ./fonts/ 폴더에 서체를 내려받습니다.
"""
import pathlib
import urllib.request

FONTS_DIR = pathlib.Path(__file__).resolve().parent / "fonts"
FONTS_DIR.mkdir(parents=True, exist_ok=True)

FONT_URLS = {
    "GowunDodum-Regular.woff2": "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/GowunDodum-Regular.woff",
    "GowunBatang-Regular.woff2": "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/GowunBatang-Regular.woff",
    "MaruBuri-Regular.woff2": "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-10-21@1.0/MaruBuri-Regular.woff",
}

if __name__ == "__main__":
    for name, url in FONT_URLS.items():
        dest = FONTS_DIR / name
        if dest.exists():
            print(f"[SKIP] {name} already exists")
            continue
        try:
            print(f"[DOWNLOAD] {name} ...")
            urllib.request.urlretrieve(url, dest)
        except Exception as e:
            print(f"[WARN] Could not download {name}: {e}")
    print("Done.")
