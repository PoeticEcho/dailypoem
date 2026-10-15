# -*- coding: utf-8 -*-
import os
import json
import random
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

# 콘솔 UTF-8 출력 보장
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# 🎯 목표 시 개수 설정 (총 1,000편 목표)
TARGET_MAX_POEMS = int(os.environ.get("TARGET_MAX_POEMS", "1000"))
POEM_COUNT = int(os.environ.get("POEM_COUNT", "1"))
FILENAME = os.environ.get("REFLECTIONS_FILE", "reflections.json")

# 지원 모델 목록 (최신 모델 및 기존 검증된 모델 폴백 체인)
MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
]

# 🎨 5대 정예 서체 기반 12가지 감성 팔레트 프리셋
PALETTES = [
    {
        "background": "#FBF8F3",
        "color": "#3C342C",
        "fontFamily": "'Gowun Batang', serif",
        "name": "따스한 햇살과 린넨 (고운바탕)",
    },
    {
        "background": "#F5F3ED",
        "color": "#3E4337",
        "fontFamily": "'Gowun Dodum', sans-serif",
        "name": "풀잎과 흙내음 (고운돋움)",
    },
    {
        "background": "#F4F6F7",
        "color": "#2D3748",
        "fontFamily": "'Nanum Myeongjo', serif",
        "name": "새벽 안개의 차분함 (나눔명조)",
    },
    {
        "background": "#FAF6F0",
        "color": "#4E3E32",
        "fontFamily": "'MaruBuri', serif",
        "name": "오후의 필사와 만년필 (마루부리)",
    },
    {
        "background": "#1C2026",
        "color": "#E3E7ED",
        "fontFamily": "'Noto Serif KR', serif",
        "name": "고요한 밤하늘 (본명조)",
    },
    {
        "background": "#F7F3EE",
        "color": "#4A3B32",
        "fontFamily": "'Gowun Batang', serif",
        "name": "오래된 책장과 따뜻한 차 (고운바탕)",
    },
    {
        "background": "#F2F5F1",
        "color": "#2E4235",
        "fontFamily": "'Gowun Dodum', sans-serif",
        "name": "비 갠 뒤의 산책로 (고운돋움)",
    },
    {
        "background": "#F8F3F4",
        "color": "#4A383E",
        "fontFamily": "'MaruBuri', serif",
        "name": "말린 장미와 저녁노을 (마루부리)",
    },
    {
        "background": "#202523",
        "color": "#DCE3DE",
        "fontFamily": "'Noto Serif KR', serif",
        "name": "깊은 숲의 고요 (본명조)",
    },
    {
        "background": "#F9F9F8",
        "color": "#333333",
        "fontFamily": "'Nanum Myeongjo', serif",
        "name": "정갈한 백자 (나눔명조)",
    },
    {
        "background": "#181A20",
        "color": "#EAE6DE",
        "fontFamily": "'Gowun Batang', serif",
        "name": "등불 하나 켜진 서재 (고운바탕)",
    },
    {
        "background": "#161922",
        "color": "#D8E0EB",
        "fontFamily": "'Noto Serif KR', serif",
        "name": "자정의 푸른 창가 (본명조)",
    },
]

ALLOWED_ELITE_FONTS = {
    "'Gowun Dodum', sans-serif",
    "'Gowun Batang', serif",
    "'MaruBuri', serif",
    "'Noto Serif KR', serif",
    "'Nanum Myeongjo', serif",
}

POETIC_THEMES = [
    "비 갠 뒤 돌담길과 풀잎 끝에 맺힌 맑은 물방울",
    "오래된 책갈피 사이에서 발견한 바랜 밑줄과 지난 계절의 안부",
    "새벽 네 시의 푸른 안개와 홀로 깨어 마시는 미지근한 물 한 모금",
    "저녁 귀갓길 모퉁이 작은 빵집이나 서점에서 새어 나오는 노란 불빛",
    "사각사각 연필심을 깎거나 만년필 잉크가 마르기를 기다리는 고요한 시간",
    "오후 세 시의 햇살을 머금고 베란다에서 바스락거리는 하얀 빨래",
    "비 오는 날 버스 창가에 손끝으로 그어본 작은 길과 번지는 가로등 불빛",
    "강물이나 바닷가 위로 부서지는 낮의 윤슬과 흔들리며 빛나는 마음",
    "다 마신 찻잔 바닥에 가라앉은 찻잎 하나와 은은하게 남은 잔향",
    "늦가을 보도블록 위에 노란 편지처럼 쌓이는 은행잎과 느린 발걸음",
    "함박눈이 소복이 내려 세상의 모든 날카로운 모서리와 소음을 덮어주는 밤",
    "오래 입어 보풀이 인 스웨터나 발에 길들여진 운동화가 주는 편안한 위로",
    "지지직거리는 라디오 주파수나 오래된 LP판 바늘 끝에서 흐르는 심야의 재즈 선율",
    "창가의 작은 화분에 물을 주며 내 마음의 가뭄도 함께 돌보는 아침",
    "기차역 플랫폼이나 낯선 간이역에서 스쳐 지나가는 바람과 여행자의 시선",
    "어머니의 따뜻한 밥 한 술이나 말없이 건네받은 캔커피 하나의 묵직한 온기",
    "안경을 벗어두거나 스탠드 불빛을 낮추며 세상의 또렷한 피로를 흐리게 하는 밤",
    "바람에 부러지지 않고 부드럽게 몸을 눕히는 억새와 대나무 숲의 지혜",
    "오래된 한옥 마루나 공원 벤치에 앉아 백 년 전과 같은 구름을 올려다보는 여유",
    "우산을 함께 쓰며 나보다 상대에게 조금 더 기울어졌던 마음의 각도",
    "수채화 물감이 물기를 따라 번져가듯 계획대로 되지 않아도 아름다워지는 삶",
    "초여름 저녁 미지근한 바람과 풀벌레 소리가 섞여드는 골목의 평화",
    "성급한 말 대신 끝까지 들어주고 반 박자 늦게 건네는 다정한 침묵과 눈빛",
    "한 해의 달력이 얇아질 무렵, 이루지 못한 일보다 무사히 견뎌낸 날들을 쓰다듬는 마음",
]


def split_poetic_line(line: str, max_chars: int = 19) -> list[str]:
    """어절과 문장 호흡 단위로 자연스럽게 행갈이하여 모든 행이 max_chars 이하가 되도록 다듬습니다."""
    line = line.strip()
    if len(line) <= max_chars:
        return [line]

    if ", " in line:
        idx = line.find(", ")
        if 4 <= idx <= len(line) - 5:
            left = line[: idx + 1].strip()
            right = line[idx + 2 :].strip()
            return split_poetic_line(left, max_chars) + split_poetic_line(right, max_chars)

    words = line.split(" ")
    if len(words) <= 1:
        return [line]

    best_i = 1
    best_score = 999.0
    target = len(line) / 2.0
    preferred_endings = (
        "은", "는", "이", "가", "을", "를", "에", "에서", "으로", "로",
        "와", "과", "도", "만", "며", "고", "서", "듯", "처럼", "마다",
        "보다", "에는", "에도", "에게", "부터", "까지", "라도", "지만",
        "다가", "더니", "는데", "던", "한", "진", "된", "할", "될", "갈",
        "온", "간", "날", "밤", "길", "위", "속", "앞", "뒤", "끝", "아래",
    )

    for i in range(1, len(words)):
        left = " ".join(words[:i])
        right = " ".join(words[i:])
        dist = abs(len(left) - target)
        penalty = 0.0
        if len(left) > max_chars:
            penalty += (len(left) - max_chars) * 4.0
        if len(right) > max_chars:
            penalty += (len(right) - max_chars) * 4.0
        bonus = -2.5 if any(left.endswith(end) for end in preferred_endings) else 0.0
        if len(left) < 4 or len(right) < 4:
            penalty += 8.0
        score = dist + penalty + bonus
        if score < best_score:
            best_score = score
            best_i = i

    left_str = " ".join(words[:best_i])
    right_str = " ".join(words[best_i:])
    return split_poetic_line(left_str, max_chars) + split_poetic_line(right_str, max_chars)


def polish_poem_breathing(text: str, max_chars: int = 19, max_total_lines: int = 7) -> str:
    """시의 연(stanza)과 행(line) 호흡을 다듬고, 행갈이 후 7줄을 초과하면 연 단위로 깔끔하게 갈무리합니다."""
    text = re.sub(r"\r\n?", "\n", text.strip())
    text = re.sub(r"\n{3,}", "\n\n", text)
    raw_stanzas = [s.strip() for s in text.split("\n\n") if s.strip()]

    if len(raw_stanzas) == 1:
        raw_lines = [l.strip() for l in raw_stanzas[0].split("\n") if l.strip()]
        raw_stanzas = []
        chunk = []
        for l in raw_lines:
            chunk.append(l)
            if len(chunk) >= 2:
                raw_stanzas.append("\n".join(chunk))
                chunk = []
        if chunk:
            raw_stanzas.append("\n".join(chunk))

    new_stanzas = []
    for st in raw_stanzas:
        orig_lines = [re.sub(r"\s+", " ", l.strip()) for l in st.split("\n") if l.strip()]
        wrapped = []
        for l in orig_lines:
            wrapped.extend(split_poetic_line(l, max_chars=max_chars))
        if wrapped:
            new_stanzas.append(wrapped)

    total_lines = sum(len(st) for st in new_stanzas)
    if total_lines > max_total_lines and len(new_stanzas) >= 2:
        trimmed_stanzas = []
        acc = 0
        for st in new_stanzas:
            if acc + len(st) <= max_total_lines:
                trimmed_stanzas.append(st)
                acc += len(st)
            else:
                remain = max_total_lines - acc
                if remain >= 2 and len(trimmed_stanzas) == 1:
                    trimmed_stanzas.append(st[:remain])
                break
        if len(trimmed_stanzas) >= 2:
            new_stanzas = trimmed_stanzas

    return "\n\n".join("\n".join(st) for st in new_stanzas)


def parse_gemini_json(raw_text: str) -> dict | None:
    """마크다운 코드펜스(```json ... ```)나 배열 형태 응답까지 안전하게 파싱합니다."""
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            return parsed[0]
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
    return None


def char_ngrams(text: str, n: int = 3) -> set[str]:
    cleaned = re.sub(r"\s+", "", text)
    if len(cleaned) < n:
        return {cleaned}
    return {cleaned[i : i + n] for i in range(len(cleaned) - n + 1)}


def is_too_similar(candidate: str, existing_poems: list[dict], threshold: float = 0.38) -> bool:
    cand_ngrams = char_ngrams(candidate, 3)
    if not cand_ngrams:
        return True
    for item in existing_poems:
        prev_text = item.get("text", "")
        prev_ngrams = char_ngrams(prev_text, 3)
        if not prev_ngrams:
            continue
        inter = len(cand_ngrams & prev_ngrams)
        union = len(cand_ngrams | prev_ngrams)
        if union > 0 and (inter / union) >= threshold:
            return True
    return False


def validate_poem_quality(text: str, existing_poems: list[dict]) -> tuple[bool, str]:
    """생성된 시가 감성 시집의 기준(4~7줄 이내의 단시 호흡, 연 구분, 독창성)을 충족하는지 검증합니다."""
    if not text or len(text.strip()) < 24:
        return False, "시 본문이 너무 짧습니다."

    stanzas = [s.strip() for s in text.strip().split("\n\n") if s.strip()]
    if len(stanzas) < 2 or len(stanzas) > 3:
        return False, f"연(stanza) 개수가 부적절합니다 ({len(stanzas)}연). 2~3연이어야 합니다."

    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    if len(lines) < 4 or len(lines) > 7:
        return False, f"전체 행 수가 부적절합니다 ({len(lines)}행). 최대 7줄(4~7행) 이내여야 합니다."

    max_len = max(len(l) for l in lines)
    if max_len > 20:
        return False, f"행 길이가 너무 깁니다 (최대 {max_len}자). 19자 이하여야 합니다."

    if is_too_similar(text, existing_poems):
        return False, "기존 시집에 수록된 시와 표현/소재 유사도가 높습니다."

    return True, "통과"


def build_prompt(theme: str, recent_openings: list[str]) -> str:
    palette_descriptions = "\n".join(
        [
            f"{i}: 배경 {p['background']}, 글자색 {p['color']}, 5대 정예 글꼴 {p['fontFamily']} ({p['name']})"
            for i, p in enumerate(PALETTES)
        ]
    )
    recent_str = "\n".join(f"- {op}" for op in recent_openings[-12:]) if recent_openings else "- (없음)"

    return f"""당신은 지친 하루 끝에 짧은 호흡으로 깊은 여운과 힐링을 전하는 한국 현대 서정시인입니다.
나태주, 류시화 시인의 단시(짧은 시)처럼 4~7줄 이내의 간결하고 투명한 언어로 마음을 조용히 안아주는 감성 시를 씁니다.

이번 시의 중심 모티프(소재):
👉 「{theme}」

다음 엄격한 작시 기준을 반드시 지켜 한국어 힐링 감성 시 한 편을 지어주세요:

1. **최대 7줄 이내의 응축된 단시 호흡 (가장 중요)**:
   - 전체 행(줄) 수는 빈 줄을 제외하고 **반드시 4행~6행(최대 7행 이하)**으로 간결하게 쓰세요.
   - 한 행은 **8~16자 내외(최대 18자 이하)**로 짧게 끊어 한 줄이 화면에서 절대 두 줄로 꺾이지 않게 하세요.
   - 총 **2연 또는 3연**으로 구성하고, 연과 연 사이에는 반드시 빈 줄(\\n\\n)을 넣어주세요.

2. **정서와 표현의 품격**:
   - 설명하려 하지 말고, 한 장면의 이미지와 온기를 스냅사진처럼 포착해 깊은 여운을 남기세요.
   - 최근 생성된 아래 첫 행들과 겹치지 않는 새로운 시적 첫 문장으로 시작하세요:
{recent_str}

3. **우수 단시(4~6행) 예시**:
[예시 1]
느리게 걸어도 괜찮다\\n길가의 들꽃은\\n\\n천천히 걷는 사람에게만\\n제 얼굴을 보여준다

[예시 2]
창가에 놓인 물 한 잔이\\n아침 햇살을 둥글게 모은다\\n\\n비워져 있기에\\n빛을 가득 담는 마음\\n\\n오늘의 나도 그렇게 맑기를

4. **5대 정예 서체 & 감성 팔레트 선택**:
   - 아래 팔레트(0~{len(PALETTES)-1}) 중 시의 분위기에 가장 잘 어울리는 번호를 골라주세요.
{palette_descriptions}

반드시 아래 JSON 형식으로만 응답하세요:
{{
  "critique": "7줄 이하 준수 여부, 행갈이 호흡, 시적 여운에 대한 자체 점검 메모",
  "text": "최종 완성된 시 본문 (4~6행 권장, 행 구분은 \\n, 연 구분은 \\n\\n)",
  "quality_score": 9,
  "palette_index": 0
}}
"""


def call_gemini_api(api_key: str, prompt_text: str) -> dict | None:
    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "temperature": 0.82,
            "responseMimeType": "application/json",
        },
    }

    last_error = None
    for model_name in MODELS:
        print(f"📡 Google Gemini API 호출 시도... (모델: {model_name})")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=35) as resp:
                    res_data = json.loads(resp.read().decode("utf-8"))
                    raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = parse_gemini_json(raw_text)
                    if parsed and parsed.get("text"):
                        print(f"✅ {model_name} 응답 수신 및 JSON 파싱 성공!")
                        return parsed
                    last_error = f"JSON 형식 불일치: {raw_text[:100]}"
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode("utf-8")
                last_error = f"HTTP {e.code}: {err_msg[:180]}"
                print(f"⚠️ {model_name} (시도 {attempt+1}/2) HTTP 오류: {e.code}")
                if e.code in (429, 500, 503) and attempt == 0:
                    time.sleep(3)
                else:
                    break
            except Exception as e:
                last_error = str(e)
                print(f"⚠️ {model_name} 예외 발생: {last_error}")
                break
    print(f"❌ 모든 Gemini 모델 호출 실패: {last_error}")
    return None


def main():
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.")
        print("GitHub Secrets 또는 환경 변수에 GEMINI_API_KEY를 등록해주세요.")
        sys.exit(1)

    try:
        with open(FILENAME, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = []

    print(f"📚 현재 수록된 시: {len(data)}편 / 목표: {TARGET_MAX_POEMS}편")

    kst_tz = timezone(timedelta(hours=9))
    today_str = datetime.now(kst_tz).strftime("%Y-%m-%d")

    added_count = 0
    for n in range(POEM_COUNT):
        recent_openings = [
            p.get("text", "").split("\n")[0].strip()
            for p in data[-15:]
            if p.get("text")
        ]
        theme_idx = (len(data) + n + random.randint(0, len(POETIC_THEMES) - 1)) % len(POETIC_THEMES)
        selected_theme = POETIC_THEMES[theme_idx]

        accepted_poem = None
        for retry in range(4):
            prompt_text = build_prompt(selected_theme, recent_openings)
            result_raw = call_gemini_api(api_key, prompt_text)
            if not result_raw:
                continue

            raw_poem = result_raw.get("text", "").strip()
            polished_text = polish_poem_breathing(raw_poem, max_chars=19, max_total_lines=7)
            ok, reason = validate_poem_quality(polished_text, data)

            if ok:
                palette_idx = result_raw.get("palette_index", random.randint(0, len(PALETTES) - 1))
                if not (isinstance(palette_idx, int) and 0 <= palette_idx < len(PALETTES)):
                    palette_idx = random.randint(0, len(PALETTES) - 1)
                selected_palette = PALETTES[palette_idx]
                assert selected_palette["fontFamily"] in ALLOWED_ELITE_FONTS
                accepted_poem = {
                    "id": len(data) + 1,
                    "text": polished_text,
                    "createdAt": today_str,
                    "hearts": 0,
                    "style": {
                        "background": selected_palette["background"],
                        "color": selected_palette["color"],
                        "fontFamily": selected_palette["fontFamily"],
                    },
                }
                print(f"✅ [{n+1}/{POEM_COUNT}] 품질 검증 통과 (테마: {selected_theme}, 팔레트: {selected_palette['name']})")
                break
            else:
                print(f"⚠️ [{n+1}/{POEM_COUNT}] 품질 검증 재시도 ({retry+1}/4): {reason}")
                selected_theme = random.choice(POETIC_THEMES)

        if accepted_poem:
            data.append(accepted_poem)
            added_count += 1
            print("---")
            print(accepted_poem["text"])
            print("---")

    if added_count == 0:
        print("❌ 품질 기준을 통과한 시를 생성하지 못했습니다.")
        sys.exit(1)

    if len(data) > TARGET_MAX_POEMS:
        data = data[-TARGET_MAX_POEMS:]

    with open(FILENAME, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    progress_pct = min(100.0, (len(data) / TARGET_MAX_POEMS) * 100)
    print(f"\n🎉 총 {added_count}편 추가 완료! 현재 시집 수록곡: {len(data)} / {TARGET_MAX_POEMS}편 ({progress_pct:.1f}%)")


if __name__ == "__main__":
    main()
