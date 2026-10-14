import os
import json
import random
from openai import OpenAI

# 🔐 API 키 및 모델 설정
api_key = os.environ.get("OPENAI_API_KEY")
model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

client = OpenAI(api_key=api_key)

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

1. **길이와 형식**:
   - 3~6행 내외의 짧은 시 (공백 포함 50자~140자 내외)
   - 줄바꿈(\\n)을 적절히 사용하여 행간의 여백과 낭독의 호흡이 살아있게 작성해주세요.
2. **주제와 정서**:
   - 지친 마음을 다독이는 다정한 위로
   - 오늘 하루를 묵묵히 살아낸 자신에게 건네는 따뜻한 격려
   - 계절의 변화, 바람, 햇살, 노을, 차 한 잔, 밤하늘 같은 일상의 따뜻한 순간
   - 과장되거나 교훈적인 말 대신, 곁에서 조용히 손을 잡아주는 듯한 담담하고 온기 있는 어조
3. **스타일 선택**:
   - 아래 제공되는 감성 팔레트 번호(0~{len(PALETTES)-1}) 중, 지은 시의 정서와 분위기에 가장 잘 어울리는 번호 하나를 골라주세요.

[감성 팔레트 목록]
{palette_descriptions}

반드시 아래 JSON 형식으로만 응답해주세요. 마크다운 코드블록이나 다른 설명 없이 순수 JSON만 출력하세요:
{{
  "text": "시 본문 (줄바꿈은 \\n으로 표현)",
  "palette_index": 0
}}
"""

print(f"📡 OpenAI 호출 중... (모델: {model_name})")
try:
    response = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.85,
        max_tokens=600,
        response_format={"type": "json_object"}
    )
    poem_content = response.choices[0].message.content.strip()
    result_raw = json.loads(poem_content)
except Exception as e:
    print(f"⚠️ {model_name} 호출 오류: {e}. gpt-3.5-turbo로 재시도합니다.")
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.85,
        max_tokens=600
    )
    poem_content = response.choices[0].message.content.strip()
    result_raw = json.loads(poem_content)

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

print("✅ 오늘의 따뜻한 위로의 시가 성공적으로 추가되었습니다:")
print("---")
print(new_poem["text"])
print("---")
print(f"스타일: {selected_palette['name']}")
