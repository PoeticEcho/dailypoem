# 🚀 감성 타이핑 시집 (Daily Poem) - 타 웹사이트 배포 가이드

본 패키지는 외부 CDN이나 데이터베이스 연결 없이, **HTML / CSS / JS / JSON 정적 파일만으로 100% 자립 구동**되는 올인원 감성 시집 배포 패키지입니다.

---

## 📦 포함된 핵심 파일 목록

```text
├── index.html          # 메인 감성 타이핑 시집 (전자책 터치, Web Audio 라디오, 더블탭 하트, 공유)
├── stats.html          # 감성 서재 & 통계 페이지 (공감 하트 TOP 10 & 최근 7일 신작 시)
├── 404.html            # 범용 Clean URL (/2341/) 리다이렉트 라우터 (어떤 도메인/경로든 자동 인식)
├── reflections.json    # 340편의 감성 시 및 서체 매핑 데이터베이스
├── fonts/              # 자체 호스팅 5대 정예 한글 서체 (.woff2) 및 local-fonts.css
├── favicon.png         # 파비콘 (64x64 PNG)
├── apple-touch-icon.png# 홈 화면 바로가기 아이콘 (180x180 PNG)
├── og-image.png        # SNS / 카카오톡 공유 썸네일 (1200x630, 25.9KB 초경량)
├── .htaccess           # Apache / Cafe24 / cPanel 호스팅용 404 및 MIME 설정
├── _redirects          # Netlify / Cloudflare Pages용 404 라우팅 설정
└── nginx.conf.sample   # Nginx 서버 배포용 가상 호스트 설정 예시
```

---

## 🌐 호스팅 플랫폼별 배포 방법

### 1. 일반 웹 호스팅 (카페24, 가비아, cPanel, 호스팅KR 등)
1. 본 압축 파일(`daily-poem-web-distribution.zip`)의 압축을 해제합니다.
2. FileZilla 등 FTP 프로그램을 사용하여 서버의 웹 루트 폴더(예: `html/`, `public_html/`, `www/`)에 파일 전체를 업로드합니다.
3. 업로드 즉시 별도의 설정 없이 바로 웹사이트가 열리며 정상 작동합니다.
   * `.htaccess` 파일이 포함되어 있어 Apache 환경에서 Clean URL(`/2341/`) 공유도 완벽하게 지원됩니다.

---

### 2. Vercel / Netlify / Cloudflare Pages (무료 정적 웹 호스팅)
1. **Netlify**:
   * Netlify 대시보드에서 `Sites` ➔ `Add new site` ➔ `Deploy manually` 선택
   * 압축을 푼 폴더를 브라우저 화면에 그대로 **드래그 앤 드롭**하면 수 초 내에 배포 완료!
   * 동봉된 `_redirects` 파일에 의해 `/2341/` Clean URL 링크도 즉시 지원됩니다.
2. **Cloudflare Pages**:
   * Cloudflare 대시보드 ➔ `Workers & Pages` ➔ `Upload assets`
   * 폴더를 드래그 앤 드롭하여 배포합니다.
3. **Vercel**:
   * Vercel CLI(`vercel deploy`)를 사용하거나 GitHub 저장소 연결 후 루트 디렉토리 그대로 배포합니다.

---

### 3. 개인 서버 (Nginx / Docker / NAS)
1. 서버의 원하는 경로(예: `/var/www/dailypoem/`)에 압축을 풉니다.
2. 동봉된 `nginx.conf.sample` 파일을 참고하여 Nginx 설정 파일에 `error_page 404 /404.html;` 및 `try_files` 구문을 적용합니다.
3. `nginx -t && nginx -s reload`로 설정을 반영하면 완료됩니다.

---

## 💡 도메인 변경 시 선택 권장 사항 (Open Graph 썸네일)
카카오톡이나 페이스북, 슬랙 등 외부 SNS에 링크를 공유할 때 나타나는 썸네일과 미리보기는 `index.html` 상단의 메타 태그를 참조합니다.
추후 독자적인 도메인(예: `https://my-poem.com/`)을 연결하시는 경우, `index.html` 상단의 아래 두 줄을 변경해주시면 가장 완벽합니다:

```html
<!-- index.html 23행, 26행 부근 -->
<meta property="og:url" content="https://내도메인.com/" />
<meta property="og:image" content="https://내도메인.com/og-image.png" />
```
*(수정하지 않더라도 현재의 GitHub Pages 주소로 기본 썸네일 이미지가 정상 로드되므로 동작에는 문제가 없습니다.)*
