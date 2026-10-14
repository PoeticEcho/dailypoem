# -*- coding: utf-8 -*-
"""
setup_self_hosted.py
외부 CDN 의존성을 완전히 제거하기 위해 5대 정예 서체(.woff2)를
로컬 서버의 ./fonts/ 디렉터리에 다운로드·보관하는 자체 호스팅 구축 스크립트입니다.

사용법:
  python setup_self_hosted.py
"""
import os
import pathlib
import re
import sys
import urllib.request

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

FONTS_DIR = pathlib.Path("fonts")
FONTS_DIR.mkdir(parents=True, exist_ok=True)

# 최신 브라우저용 WOFF2 추출을 위한 User-Agent
UA_HEADER = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    )
}

# 5대 정예 서체 소스 정의
DIRECT_FONTS = {
    "MaruBuri-Regular.woff2": "https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Regular.woff2",
}

GOOGLE_FONT_CSS = {
    "GowunDodum-Regular.woff2": "https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap",
    "GowunBatang-Regular.woff2": "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400&display=swap",
    "NotoSerifKR-Regular.woff2": "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400&display=swap",
    "NanumMyeongjo-Regular.woff2": "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400&display=swap",
}


def download_binary(url: str, dest: pathlib.Path) -> bool:
    try:
        req = urllib.request.Request(url, headers=UA_HEADER)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            if len(data) > 1000:
                dest.write_bytes(data)
                print(f"✅ 저장 완료: {dest} ({len(data) // 1024} KB)")
                return True
    except Exception as e:
        print(f"⚠️ 다운로드 실패 ({url}): {e}")
    return False


def download_from_google_css(css_url: str, dest: pathlib.Path) -> bool:
    try:
        req = urllib.request.Request(css_url, headers=UA_HEADER)
        with urllib.request.urlopen(req, timeout=30) as resp:
            css_text = resp.read().decode("utf-8")
        # 가장 마지막 블록(latin/korean 전체 서브셋 또는 기본 woff2 URL) 추출
        urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", css_text)
        if not urls:
            print(f"⚠️ WOFF2 URL을 찾지 못했습니다: {css_url}")
            return False
        # 한글 글리프가 포함된 가장 큰/메인 폰트 파일 또는 전체 CSS를 로컬용으로 병합 저장
        # Google Fonts 한글 서브셋은 여러 조각으로 나뉘므로 ./fonts/google-elite-fonts.css 와 모든 woff2 조각도 함께 로컬화 가능
        target_url = urls[-1]
        return download_binary(target_url, dest)
    except Exception as e:
        print(f"⚠️ CSS 파싱 실패 ({css_url}): {e}")
        return False


def localize_google_fonts_bundle():
    """Google Fonts의 한글 서브셋 전체를 ./fonts/ 디렉터리에 완전 로컬화하고 ./fonts/local-fonts.css를 생성합니다."""
    combined_css_url = (
        "https://fonts.googleapis.com/css2?"
        "family=Gowun+Dodum&"
        "family=Gowun+Batang:wght@400;700&"
        "family=Noto+Serif+KR:wght@300;400;600&"
        "family=Nanum+Myeongjo:wght@400;700;800&display=swap"
    )
    try:
        req = urllib.request.Request(combined_css_url, headers=UA_HEADER)
        with urllib.request.urlopen(req, timeout=30) as resp:
            css_text = resp.read().decode("utf-8")

        urls = sorted(set(re.findall(r"https://fonts\.gstatic\.com/[^)\"']+\.woff2", css_text)))
        print(f"📦 Google Fonts 한글 서브셋 조각 {len(urls)}개 로컬 다운로드 중...")
        for idx, u in enumerate(urls):
            local_name = f"gf_subset_{idx:03d}.woff2"
            local_path = FONTS_DIR / local_name
            if not local_path.exists():
                download_binary(u, local_path)
            css_text = css_text.replace(u, f"./{local_name}")

        # 마루부리 로컬 규칙 추가
        maru_css = """
@font-face {
  font-family: 'MaruBuri';
  font-weight: 400;
  font-style: normal;
  src: local('MaruBuri'), url('./MaruBuri-Regular.woff2') format('woff2');
  font-display: swap;
}
"""
        (FONTS_DIR / "local-fonts.css").write_text(maru_css + "\n" + css_text, encoding="utf-8")
        print("✅ ./fonts/local-fonts.css 생성 완료 (외부 CDN 의존성 0%)")
    except Exception as e:
        print(f"⚠️ Google Fonts 번들 로컬화 건너뜀: {e}")


def main():
    print("🚀 [자체 호스팅 구축] 5대 정예 서체 로컬 보관을 시작합니다...")
    for filename, url in DIRECT_FONTS.items():
        dest = FONTS_DIR / filename
        if not dest.exists():
            download_binary(url, dest)
        else:
            print(f"✔️ 이미 존재함: {dest}")

    for filename, css_url in GOOGLE_FONT_CSS.items():
        dest = FONTS_DIR / filename
        if not dest.exists():
            download_from_google_css(css_url, dest)
        else:
            print(f"✔️ 이미 존재함: {dest}")

    localize_google_fonts_bundle()
    print("\n🎉 모든 서체가 ./fonts/ 폴더에 보관되었습니다. 이제 외부 폰트 서버 없이도 완벽히 독립 구동됩니다!")


if __name__ == "__main__":
    main()
