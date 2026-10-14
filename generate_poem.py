import os
import json
import random
import sys
import time
import urllib.request
import urllib.error

# 콘솔 UTF-8 출력 보장
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 🔐 API 키 불러오기 (GEMINI_API_KEY 또는 GOOGLE_API_KEY)
api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

if not api_key:
    print("❌ GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.")
    print("GitHub Secrets 또는 환경 변수에 GEMINI_API_KEY를 등록해주세요.")
    sys.exit(1)

# 지원 모델 목록 (가장 안정적인 모델 순서)
MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]

# 🎨 감성 팔레트 프리셋 (가독성 높은 텍스트색과 차분한 배경, 정갈한 세리프 글꼴)
PALETTES = [
    {
        "background": "#FBF8F3",
        "color": "#3C342C",
        "fontFamily": "'Gowun Batang', serif",
        "name": "따스한 햇살과 린넨"
    },
    {
        "background": "#F4F6F7",
        "color": "#2D3748",
        "fontFamily": "'Nanum Myeongjo', serif",
        "name": "새벽 안개의 차분함"
    },
    {
        "background": "#F7F3EE",
        "color": "#4A3B32",
        "fontFamily": "'Gowun Batang', serif",
        "name": "오래된 책장과 따뜻한 차"
    },
    {
        "background": "#1C2026",
        "color": "#E3E7ED",
        "fontFamily": "'Nanum Myeongjo', serif",
        "name": "고요한 밤하늘"
    },
    {
        "background": "#F5F3ED",
        "color": "#3E4337",
        "fontFamily": "'Gowun Dodum', sans-serif",
        "name": "풀잎과 흙내음"
    },
    {
        "background": "#F8F3F4",
        "color": "#4A383E",
        "fontFamily": "'Gowun Batang', serif",
        "name": "말린 장미와 저녁노을"
    },
    {
        "background": "#202523",
        "color": "#DCE3DE",
        "fontFamily": "'Nanum Myeongjo', serif",
        "name": "깊은 숲의 고요"
    },
    {
        "background": "#F9F9F8",
        "color": "#333333",
        "fontFamily": "'Noto Serif KR', serif",
        "name": "정갈한 백자"
    },
    {
        "background": "#181A20",
        "color": "#EAE6DE",
        "fontFamily": "'Gowun Batang', serif",
        "name": "등불 하나 켜진 서재"
    }
]

palette_descriptions = "\n".join([
    f"{i}: 배경 {p['background']}, 글자색 {p['color']}, 글꼴 {p['fontFamily']} ({p['name']})"
    for i, p in enumerate(PALETTES)
])

prompt = f"""당신은 지친 하루 끝에 따뜻한 위로와 여운을 전하는 시인입니다.
나태주 시인, 류시화 시인처럼 소박하고 다정한 일상의 언어로 사람의 마음을 조용히 안아주는 시를 씁니다.

다음 조건에 맞는 짧고 감성적인 한국어 위로시 한 편을 지어주세요:

1. **줄바꿈과 호흡 (가장 중요)**:
   - 한 문장이 너무 길게 이어지지 않도록 10~20자 내외의 짧은 호흡으로 자주 줄바꿈(\\n)을 해주세요.
   - 1~2문장(2~3행)마다 반드시 빈 줄(\\n\\n)을 넣어 문단(연)을 명확하게 구분해 주세요.
   - 산문처럼 길게 쓰지 마시고, 낭독할 때 숨을 고르듯 행과 연을 나누어 주세요.

[좋은 행/연 구분 예시]
떠난다는 건 사라지는 게 아니다.\\n남겨두는 것이다.\\n\\n흔적, 냄새, 기억, 말.\\n나는 그 모든 걸 남기고 또 누군가의 안에 머문다.\\n그러니 이별이\\n두렵다고 말하지 말자.\\n\\n우리는 언제나 어디선가\\n누군가의 하루에 남아 있다.

2. **주제와 정서**:
   - 지친 마음을 다독이는 다정한 위로
   - 오늘 하루를 묵묵히 살아낸 자신에게 건네는 따뜻한 격려
   - 계절의 변화, 바람, 햇살, 노을, 차 한 잔, 밤하늘 같은 일상의 따뜻한 순간
   - 과장되거나 교훈적인 말 대신, 곁에서 조용히 손을 잡아주는 듯한 담담하고 온기 있는 어조
3. **스타일 선택**:
   - 아래 제공되는 감성 팔레트 번호(0~{len(PALETTES)-1}) 중, 지은 시의 정서와 분위기에 가장 잘 어울리는 번호 하나를 골라주세요.

[감성 팔레트 목록]
{palette_descriptions}

반드시 아래 JSON 형식으로만 응답해주세요:
{{
  "text": "시 본문 (줄바꿈은 \\n, 연 구분은 \\n\\n으로 표현)",
  "palette_index": 0
}}
"""

payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {
        "temperature": 0.85,
        "responseMimeType": "application/json"
    }
}

result_raw = None
last_error = None

for model_name in MODELS:
    print(f"📡 Google Gemini API 호출 중... (모델: {model_name})")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    # 모델별 최대 2회 시도
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                result_raw = json.loads(raw_text)
                print(f"✅ {model_name} 호출 성공!")
                break
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            last_error = f"Gemini API 오류 ({e.code}): {err_msg}"
            print(f"⚠️ {model_name} (시도 {attempt+1}/2) 실패: {e.code}")
            if e.code == 503 and attempt == 0:
                time.sleep(2)
        except Exception as e:
            last_error = str(e)
            print(f"⚠️ {model_name} 예외 발생: {last_error}")
            break
            
    if result_raw:
        break

if not result_raw:
    print(f"❌ 모든 Gemini 모델 호출에 실패했습니다. 마지막 오류: {last_error}")
    sys.exit(1)

# 결과 매핑
text = result_raw.get("text", "").strip()
palette_idx = result_raw.get("palette_index", random.randint(0, len(PALETTES) - 1))

if isinstance(palette_idx, int) and 0 <= palette_idx < len(PALETTES):
    selected_palette = PALETTES[palette_idx]
else:
    selected_palette = random.choice(PALETTES)

new_poem = {
    "text": text,
    "style": {
        "background": selected_palette["background"],
        "color": selected_palette["color"],
        "fontFamily": selected_palette["fontFamily"]
    }
}

# 📚 reflections.json 업데이트
filename = "reflections.json"
try:
    with open(filename, "r", encoding="utf-8") as f:
        data = json.load(f)
except FileNotFoundError:
    data = []

data.append(new_poem)

# 최대 365개 유지
if len(data) > 365:
    data = data[-365:]

with open(filename, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("\n✅ 오늘의 따뜻한 위로의 시가 성공적으로 추가되었습니다:")
print("---")
print(new_poem["text"])
print("---")
print(f"스타일: {selected_palette['name']}")
