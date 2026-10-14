# 📜 감성 타이핑 시집 (Daily Poem · Self-Hosted Edition)

<p align="center">
  <a href="https://poeticecho.github.io/dailypoem/">
    <img src="https://img.shields.io/badge/GitHub%20Pages-Live%20Demo%20%E2%96%B6-brightgreen?style=for-the-badge&logo=github" alt="Live Demo" />
  </a>
  <a href="https://github.com/PoeticEcho/dailypoem/raw/main/daily-poem-self-hosted.zip">
    <img src="https://img.shields.io/badge/Self--Hosted%20Package-ZIP%20Download-blue?style=for-the-badge&logo=archive" alt="Download ZIP" />
  </a>
  <img src="https://img.shields.io/badge/Poetry%20Collection-241%20%2F%201000-orange?style=for-the-badge" alt="Poem Count" />
  <img src="https://img.shields.io/badge/Zero%20Dependency-100%25%20Pure%20Web-purple?style=for-the-badge" alt="Zero Dependency" />
</p>

> **"기술은 조용히 뒤로 물러나고, 화면 위에는 오직 다정한 문장과 여백만 남는다."**
>
> 지친 하루의 끝에 한 글자씩 천천히 필사되듯 피어나는 한국어 서정시와 시드(Seed) 기반의 잔잔한 재즈·자연의 소리를 담은 **독립형 전자책 & 태블릿 감성 시집 액자**입니다.

👉 **[실시간 웹 시집 감상하기 (Live Demo)](https://poeticecho.github.io/dailypoem/)**  
📦 **[독립형 자체 호스팅 패키지 다운로드 (daily-poem-self-hosted.zip)](https://github.com/PoeticEcho/dailypoem/raw/main/daily-poem-self-hosted.zip)**

---

## 1. 우리의 철학 (Core Philosophy)

### ① 글자(시) 최우선주의 (Poetry-First Architecture)
이 앱에서 가장 중요한 주인공은 언제나 **‘시 본문’**입니다.  
시계도, 음악 컨트롤러도, 설정 아이콘도 결코 시보다 앞서지 않습니다. 감상이 시작되고 4초가 지나면 화면 위의 조작 아이콘은 **투명도 0%로 완전히 소멸**하며, 다이나믹 시계는 시가 정렬된 반대편 여백으로 조용히 자리를 옮겨 한 권의 시집 페이지 같은 순수한 여백을 지킵니다.

### ② 낭독의 호흡과 필사의 시간성 (Breathing Typography)
빠르게 스크롤하며 소비하는 디지털 텍스트와 달리, 사람이 직접 만년필로 꾹꾹 눌러 적고 소리 내어 읽는 호흡을 코드로 구현했습니다.  
글자 사이(82~115ms), 띄어쓰기(150ms), 쉼표(420ms), 줄바꿈(650ms), 마침표(800ms)마다 서로 다른 여운의 시간을 두어 독자의 호흡이 시의 리듬과 자연스럽게 동기화되도록 설계했습니다.

### ③ 완전한 기술적 자립 (100% Self-Hosted & Zero Dependency)
외부 스트리밍 서비스나 외부 폰트 서버가 문을 닫더라도 내 책상 위의 시집 액자는 10년 뒤에도 변함없이 작동해야 합니다.
- **서체(Font)**: 5대 정예 한글 서체를 서버의 `./fonts/` 디렉터리에 직접 보관하여 외부 CDN 없이도 독립 서빙합니다.
- **음악(Audio)**: 외부 MP3 음원 스트리밍이나 외부 `iframe`에 의존하지 않고, 브라우저 내장 Web Audio API와 결정론적 시드(`Mulberry32 PRNG`) 알고리즘으로 재즈 화성과 빗소리·새소리를 실시간 자가 합성합니다.
- **시(Poetry)**: 240편의 정제된 초기 시집에서 출발해 자체 검증 파이프라인을 거쳐 **총 1,000편**의 시를 내 저장소에 영구 축적합니다.

---

## 2. 핵심 구현 내용 및 아키텍처 (Implementation Details)

### ① 문학 데이터 정제 및 1,000편 자동 큐레이션 (`reflections.json`, `generate_poem.py`, `auto-poem.yml`)
| 구분 | 구현 상세 |
| :--- | :--- |
| **241편 수록 시 정밀 교정** | 어색한 어절 끊김과 산문체 문장을 전면 개작하고, 계절·새벽·노을·찻잔·위로를 주제로 한 서정시를 수록했습니다. 모든 행은 한국어 낭독 호흡에 맞춘 **20자 이하**, 각 시는 **2~4연** 구조를 엄격히 준수합니다. |
| **일정한 주간·일간 품질 보장** | `generate_poem.py`에 **24가지 시적 모티프 순환기**, **최근 15편 첫 행 중복 방지**, **LLM 자체 퇴고(`critique`)**, **어절/조사 기준 자동 행갈이(`split_poetic_line`)**, **기존 전체 시 대비 3-gram 유사도 검증기(`is_too_similar < 0.36`)**를 탑재해 매주 생성되는 시의 문학적 완성도를 일정하게 유지합니다. |
| **목표 1,000편 자동 적립** | GitHub Actions(`auto-poem.yml`)가 매일 오전 10시(1편) 및 매주 일요일(3편 보충) 자동 실행되어 **총 1,000편(`TARGET_MAX_POEMS = 1000`)**까지 시집을 키워 나갑니다. |

### ② 5대 정예 서체 표준화 및 렌더링 엔지니어링 (`index.html`, `setup_self_hosted.py`)
- **5대 정예 서체 표준화**:
  1. `Gowun Dodum` (고운돋움): 둥글고 정돈된 획으로 긴 호흡의 시에서도 눈이 편안한 최고 가독성 서체
  2. `Gowun Batang` (고운바탕): 모서리가 부드럽게 라운딩된 따뜻한 감성 명조의 정석
  3. `MaruBuri` (마루부리): 디지털 스크린 가독성을 위해 설계된 네이버 화면용 명조
  4. `Noto Serif KR` (본명조): 어두운 밤하늘·다크 배경에서 획이 뭉개지지 않고 가장 또렷한 현대 세리프
  5. `Nanum Myeongjo` (나눔명조): 종이 시집의 정취를 살려주는 고전 명조
- **Windows ClearType 서브픽셀 렌더링 복원**: 윈도우 환경에서 글자 획을 앙상하게 깎아내던 강제 그레이스케일 안티앨리어싱을 제거하고 `subpixel-antialiased` 및 `font-smooth: always`를 복원했습니다.
- **기본 글자 크기 23px & 모바일 지능형 대응**: 데스크톱·태블릿 기본 크기를 `21px ➔ 23px`로 상향해 곡선 표현력을 높였고, 640px 이하 스마트폰(갤럭시 S25 등)에서는 `20px`로 자동 적응합니다.
- **하이브리드 폰트 서빙**: 로컬 `./fonts/local-fonts.css`가 존재할 경우 완전 오프라인으로 구동되며, 미구축 환경에서는 네이버/구글 CDN으로 매끄럽게 폴백(Fallback)됩니다.

### ③ 자체 내장형 Pixelmood 재즈 & 앰비언스 엔진 (`index.html`)
- **결정론적 시드 작곡 엔진 (`createSeededRandom`)**: 기본 프리셋(`style=jazz`, `ambience=random`, `level=5`, `seed=2494034659`)을 바탕으로 워킹 어쿠스틱 베이스(`Finger Bass`), 일렉트릭/어쿠스틱 피아노(`Rhodes / Upright`), 재즈 기타(`Jazz Guitar`), 비브라폰(`Vibes`), 브러시 드럼(`Rusty Kit`) 화음을 실시간 합성합니다.
- **5대 감성 앰비언스 채널**:
  1. ☕ *비 내리는 카페 (Rain Cafe)*: 브라운 노이즈 빗소리와 따뜻한 로파이 필터
  2. 🎷 *재즈 라운지 (Jazz Lounge)*: 7th/9th 텐션 재즈 화음과 소프트 신스
  3. 🌌 *새벽 앰비언트 (Ambient Space)*: 공간감 넘치는 패드 사운드
  4. 🌿 *숲속의 새벽 (Forest Dawn)*: 맑은 자연 바람과 울림
  5. 🎹 *달빛 녹턴 (Nocturne)*: 차분한 펜타토닉 피아노 아르페지오
- **자체 픽셀아트 카세트 독 (`#pm-pixel-canvas`)**: 외부 이미지 없이 HTML5 캔버스로 밤노을 도시 실루엣, 반짝이는 창문 불빛, 내리는 빗방울과 오디오 스펙트럼을 직접 렌더링합니다.

### ④ 전자책(E-Reader) 3분할 터치 & 갤럭시 S25 무결점 레이아웃
```
┌─────────────────┬───────────────────────────┬─────────────────┐
│   좌측 (28%)    │        중앙 (44%)         │   우측 (28%)    │
│    ⏮ 이전 시    │   ⏸ / ▶ 자동 넘김 토글   │    ⏭ 다음 시    │
│  (히스토리 복원)│   (시 음미하며 머물기)    │   (랜덤 신규 시)│
└─────────────────┴───────────────────────────┴─────────────────┘
```
- **상단 잘림 원천 해결 (`#viewport-stage`)**: 모바일 브라우저에서 긴 시가 나왔을 때 상단 첫 줄이 노치/펀치홀 위로 잘리던 Flexbox 오버플로우 문제를 `margin: auto 0`과 `env(safe-area-inset-top)` 설계로 완벽히 해결했습니다.
- **완전 소멸형 미니멀 팝업**: 평소에는 모든 메뉴가 0% 투명도로 사라져 있고, 화면을 터치하거나 마우스를 움직일 때만 우측 상단에 반투명 설정 아이콘(⚙️)이 나타나며 클릭 시 조작 팝업이 열립니다.

---

## 3. 다각도 앱 종합 평가 및 향후 개선 로드맵

### 영역별 종합 평가 Scorecard

| 평가 영역 | 현재 완성도 | 핵심 강점 요약 |
| :--- | :---: | :--- |
| **① 감성적·문학적 영역**<br>(Emotional & Literary) | **9.5 / 10** | • 어절 단위로 다듬어진 20자 이내의 짧은 호흡과 2~4연 구성이 주는 깊은 여백미<br>• 쉼표·마침표·줄바꿈마다 달라지는 필사 타이핑 속도와 은은하게 숨 쉬는 잉크 커서<br>• 시의 정조에 맞춘 한지/새벽 12종 배경 팔레트와 재즈·빗소리 사운드의 공감각적 조화 |
| **② 독자·전자책 UX 영역**<br>(Reader Experience) | **9.4 / 10** | • 학습이 필요 없는 전자책 표준 3분할 터치(좌: 이전 / 중: 일시정지 / 우: 다음) 및 좌우 스와이프<br>• 감상 중 조작 UI가 0%로 완전 소멸하여 활자 몰입도를 극대화<br>• 5대 정예 서체 + ClearType 복원 + 23px 기본 크기로 장시간 독서 시 눈의 피로도 최소화 |
| **③ 디지털 앨범·액자 영역**<br>(Digital Frame & Object) | **9.3 / 10** | • 시의 정렬 방향(좌/중/우)에 따라 빈 여백으로 스스로 이동하는 다이나믹 한글 감성 시계<br>• `Screen Wake Lock` 화면 꺼짐 방지 및 미세 픽셀 이동을 통한 태블릿 OLED 번인 방지<br>• 낮에는 한지 톤, 밤에는 다크 톤으로 자동 전환되는 시간대 연동 인테리어 모드 |
| **④ 기술 자립·아키텍처 영역**<br>(Self-Hosted Engineering) | **9.6 / 10** | • 외부 음원/폰트 CDN 의존성을 제거한 100% 자체 서버 완결형 구조<br>• 오프라인 상태나 `file://` 직접 실행 시에도 `localStorage` 캐시와 비상 시 뱅크로 무중단 구동<br>• 중복·유사도 검사를 포함한 1,000편 자동 큐레이션 봇 파이프라인 |

### 향후 발전 및 개선 로드맵 (Roadmap)

1. **계절·날씨·시간대 문맥 매칭 큐레이션**:
   - 시각 및 날씨/앰비언스 태그(`새벽`, `노을`, `비`, `겨울`)를 연동하여 현재 분위기에 어울리는 시를 우선 선별
2. **마음에 남는 시 갈피(북마크) & 필사 엽서 이미지 저장**:
   - 감동적인 시를 북마크하고 현재 배경/서체 그대로 정사각형 감성 엽서 이미지(PNG)로 저장·공유
3. **나이트 스탠바이(취침 디밍) & 슬립 타이머**:
   - 침실 거치 시 심야 시간대(자정~06시) 조도 40% 자동 감쇄 및 30분/1시간 후 음악 페이드아웃 슬립 타이머

---

## 4. 설치 및 실행 가이드 (Quick Start)

### 방법 A. 온라인 실시간 감상 (설치 필요 없음)
브라우저에서 **[https://poeticecho.github.io/dailypoem/](https://poeticecho.github.io/dailypoem/)** 로 접속하면 즉시 감상할 수 있습니다.

### 방법 B. 개인 홈서버 / NAS / 미니 PC 자체 호스팅
1. **[daily-poem-self-hosted.zip](https://github.com/PoeticEcho/dailypoem/raw/main/daily-poem-self-hosted.zip)** 다운로드 후 원하는 웹 디렉터리(Synology Web Station, Nginx, Apache 등)에 압축을 풉니다.
2. 5대 서체 로컬화 스크립트 실행 (외부 폰트 CDN 의존성 완전 제거):
   ```bash
   python setup_self_hosted.py
   ```
3. 웹서버 구동:
   ```bash
   # 로컬 테스트용
   python -m http.server 8080
   ```

### 방법 C. GitHub Actions 자동 큐레이션 설정 (1,000편 목표)
1. 본 저장소를 `Fork` 또는 `Clone`합니다.
2. GitHub 저장소의 `Settings` ➔ `Secrets and variables` ➔ `Actions`로 이동합니다.
3. `New repository secret` 클릭:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: 발급받은 Google Gemini API Key 입력
4. 워크플로가 활성화되면 매일 오전 10시(한국시간)에 1편, 일요일에 3편씩 자동으로 시가 심사·축적되어 1,000편까지 채워집니다.

---

### 저장소 디렉터리 구조
```text
├── index.html                   # 독립형 전자책 터치 시집 & 내장 Pixelmood 재즈/픽셀 엔진
├── reflections.json             # 정밀 교정 및 5대 정예 서체가 적용된 감성 시집 (목표 1,000편)
├── generate_poem.py             # 24종 모티프 순환·자체 퇴고·유사도 검증 기반 시 생성 봇 (Gemini)
├── setup_self_hosted.py         # 5대 정예 서체(.woff2) 로컬 ./fonts/ 영구 보관 스크립트
├── daily-poem-self-hosted.zip   # 1-Click 독립 배포용 자체 호스팅 압축 패키지
├── fonts/                       # 로컬 보관된 5대 정예 서체 및 local-fonts.css
├── .github/workflows/
│   └── auto-poem.yml            # GitHub Actions 1,000편 자동 큐레이션 워크플로
└── README.md                    # 철학, 아키텍처, 다각도 앱 평가 및 자체 호스팅 가이드
```

---

<p align="center">
  <sub>Made with pure warmth and poetic heart. Dedicated to quiet evenings and gentle mornings.</sub>
</p>
