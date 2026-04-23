# 배포 가이드

Vercel 배포 → 커스텀 도메인 연결 → GA4 연동 → giscus 연동, 이 순서로 정리했습니다. 각 단계는 **이전 단계가 끝난 뒤에 진행**해도 무방합니다.

## 전체 체크리스트

- [ ] Step 1. GitHub 저장소 생성 & push
- [ ] Step 2. Vercel Import로 배포 (기본 `*.vercel.app` 도메인)
- [ ] Step 3. 커스텀 도메인 구매 후 연결
- [ ] Step 4. `src/config.ts` 의 `website` 값을 커스텀 도메인으로 교체
- [ ] Step 5. Google Analytics 4 속성 만들고 `PUBLIC_GA_ID` 등록
- [ ] Step 6. giscus 설정 후 `PUBLIC_GISCUS_*` 4개 값 등록
- [ ] Step 7. (선택) Google Search Console 등록 + sitemap 제출

---

## Step 1. GitHub 저장소에 올리기

로컬에서 이 프로젝트의 루트 디렉토리(이 README가 있는 위치)에서 시작합니다.

```bash
git init
git add .
git commit -m "chore: initial commit (astro-paper starter)"

# 미리 GitHub에서 빈 repo를 만들어두고 URL 복사
git branch -M main
git remote add origin git@github.com:your-username/dev-blog.git
git push -u origin main
```

> **Public repo 전제**. 드래프트는 frontmatter `draft: true` 로 빌드에서 제외되므로 repo 자체를 public으로 두어도 안전합니다. 글 소스와 GitHub 활동 그래프 자체가 포트폴리오가 됩니다.

---

## Step 2. Vercel 배포

### 2-1. GitHub 연동 Import (권장)

1. [vercel.com/new](https://vercel.com/new) 접속 → GitHub 로그인
2. 방금 push한 repo 선택 → **Import**
3. Framework Preset: **Astro** (자동 감지됨)
4. Build Command / Output Directory는 기본값 유지

   | 항목 | 값 |
   |---|---|
   | Build Command | `pnpm build` |
   | Output Directory | `dist` |
   | Install Command | `pnpm install` |

5. **Environment Variables** 는 일단 비워두고 Deploy. 첫 배포는 GA/giscus 없이도 정상 빌드됩니다.
6. 배포 완료되면 `your-project.vercel.app` 형태의 기본 도메인으로 접속 확인.

### 2-2. Vercel CLI로 직접 배포 (대안)

GitHub 연동 없이 로컬에서 바로 올리고 싶을 때.

```bash
pnpm dlx vercel login
pnpm dlx vercel          # 최초: 프로젝트 링크
pnpm dlx vercel --prod   # 프로덕션 배포
```

> `git push = 자동 배포` 파이프라인을 얻으려면 **2-1을 강하게 권장**합니다. 2-2는 일회성 배포용.

---

## Step 3. 커스텀 도메인 연결

### 3-1. 도메인 구매

추천 레지스트라: **Cloudflare Registry** (마진 없는 원가), **Porkbun**, **가비아**.
`.com`, `.dev`, `.me`, `.io` 중 선택. 블로그라면 `yourname.dev` 혹은 `yourname.com`이 무난.

### 3-2. Vercel에 도메인 추가

1. Vercel 프로젝트 → **Settings → Domains** → **Add**
2. 도메인 입력 후 Add → Vercel이 **DNS 설정 방식**을 안내합니다.

### 3-3. DNS 설정 — 두 가지 방식

**방식 A. 레지스트라 DNS 유지 (가장 쉬움)**

레지스트라(가비아 등) 관리 패널에서 아래 2개 레코드를 추가:

| Type | Name | Value |
|---|---|---|
| `A` | `@` (apex) | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

**방식 B. Vercel Nameserver 위임**

레지스트라에서 네임서버를 Vercel이 알려주는 값(`ns1.vercel-dns.com`, `ns2.vercel-dns.com`)으로 바꿉니다. DNS 관리를 Vercel에서 하게 됨. 방식 A가 더 일반적.

### 3-4. 전파 대기

DNS 전파는 보통 **몇 분 ~ 최대 24시간**. Vercel Domains 페이지에서 **"Valid Configuration"** 초록 체크가 뜨면 완료.

`https://` 는 Vercel이 Let's Encrypt로 자동 발급.

### 3-5. `src/config.ts` 업데이트

```ts
// src/config.ts
export const SITE = {
  website: "https://yourdomain.com/",  // ← 여기를 커스텀 도메인으로
  // ...
};
```

commit & push → Vercel이 자동 재배포. sitemap, canonical URL, OG 링크가 전부 새 도메인으로 갱신됩니다.

---

## Step 4. Google Analytics 4

### 4-1. GA4 속성 생성

1. [analytics.google.com](https://analytics.google.com) → 관리자 → **속성 만들기**
2. 속성 이름: `Dev Blog` (자유)
3. 보고 시간대: `(GMT+09:00) 대한민국`, 통화: `원(KRW)`
4. 비즈니스 정보 → 사이트 목적 선택 → **만들기**

### 4-2. 데이터 스트림 추가

1. **데이터 스트림** → **웹** 선택
2. 웹사이트 URL: `https://yourdomain.com`
3. 스트림 이름: `Blog Web`
4. 생성 후 **측정 ID** (`G-XXXXXXXXXX` 형식) 복사

### 4-3. 환경변수 등록

**로컬**: `.env` 파일

```bash
PUBLIC_GA_ID=G-XXXXXXXXXX
```

**Vercel**: Project → Settings → **Environment Variables**
  - Name: `PUBLIC_GA_ID`
  - Value: `G-XXXXXXXXXX`
  - Environment: **Production**, **Preview**, **Development** 전부 체크
  - Save → 프로젝트 **Deployments** 탭에서 최신 배포 Redeploy

### 4-4. 동작 확인

- 배포 후 블로그 방문 → GA4 **보고서 → 실시간**에서 본인 세션 확인
- 페이지 이동(홈 → 포스트 → 태그) 시 **페이지뷰 이벤트**가 카운트되어야 정상
  (이 프로젝트는 `astro:page-load` 이벤트에 수동으로 `page_view`를 보냅니다)
- 유입 경로는 **보고서 → 획득 → 트래픽 획득**에서 확인

---

## Step 5. giscus (댓글)

### 5-1. 사전 조건

- 블로그 repo가 **public**
- Settings → General → **Features** 섹션 → **Discussions** 체크
- [github.com/apps/giscus](https://github.com/apps/giscus) 에서 해당 repo에 giscus 앱 **설치**

### 5-2. giscus 설정값 발급

1. [giscus.app](https://giscus.app) 접속
2. **Repository**: `your-username/your-repo` 입력 → 초록 체크 확인
3. **Page ↔ Discussions Mapping**: `pathname` 선택 (이 프로젝트 기본값)
4. **Discussion Category**: 댓글용 카테고리 선택
   - 추천: repo Discussions 탭에서 **"Announcements"** 타입의 새 카테고리("Comments" 등) 생성 후 선택. 일반 사용자가 최상위 Discussion을 못 만들게 막아 블로그 댓글만 쌓이게 됨.
5. **Features**: "Enable reactions for the main post" 체크
6. **Theme**: `Preferred color scheme` (다크/라이트 자동 전환)

설정을 다 하면 페이지 하단 **Enable giscus** 섹션에 아래 값이 생성됩니다.

```html
<script src="https://giscus.app/client.js"
  data-repo="your-username/your-repo"
  data-repo-id="R_kgDO..."
  data-category="Comments"
  data-category-id="DIC_kwDO..."
```

### 5-3. 환경변수 등록

**로컬** `.env`:

```bash
PUBLIC_GISCUS_REPO=your-username/your-repo
PUBLIC_GISCUS_REPO_ID=R_kgDO...
PUBLIC_GISCUS_CATEGORY=Comments
PUBLIC_GISCUS_CATEGORY_ID=DIC_kwDO...
```

**Vercel**: 위와 동일하게 **Environment Variables** 에 4개 전부 추가 → Redeploy.

### 5-4. 동작 확인

- 글 상세 페이지 하단 스크롤 → "Write" 입력창이 뜨면 정상
- 다크모드 토글 → 댓글 위젯도 같이 전환되는지 확인
- 테스트 댓글 작성 → GitHub repo **Discussions** 탭에 해당 글의 pathname으로 topic이 생성됐는지 확인

---

## Step 6. (선택) Google Search Console

검색 유입을 추적하려면 Search Console에 사이트를 등록해야 합니다.

1. [search.google.com/search-console](https://search.google.com/search-console) → 속성 추가 → **도메인** 타입 권장
2. 소유권 확인 — **DNS TXT 레코드** 방식이 가장 단순
   - 레지스트라 DNS에 TXT 레코드 추가:
     - Type: `TXT`, Name: `@`, Value: `google-site-verification=...` (Search Console이 알려준 값)
3. sitemap 제출:
   - 좌측 메뉴 → **Sitemaps** → `https://yourdomain.com/sitemap-index.xml` 입력 → 제출
4. (선택) meta 태그 방식을 쓰고 싶다면 `.env` 에 `PUBLIC_GOOGLE_SITE_VERIFICATION=...` 값만 넣으면 이 프로젝트가 자동으로 `<meta>` 삽입.

---

## 문제 해결

**빌드가 Vercel에서 실패한다**

- `pnpm build` 를 로컬에서 돌려 재현 확인. 타입 에러면 `astro check` 결과 읽기.
- `pnpm-lock.yaml` 이 repo에 커밋되어 있는지 확인 (Vercel은 lockfile 기반 설치).

**댓글 위젯이 안 뜬다**

- Console에서 4xx 발생 여부 확인. `data-repo-id`, `data-category-id` 오타 가능성 큼.
- repo가 private이거나 Discussions 비활성화 상태면 동작 안 함.
- `.env` 의 값 4개 중 하나라도 비면 이 프로젝트는 **의도적으로 위젯을 렌더하지 않습니다** (`Giscus.astro` 참고).

**GA4 이벤트가 안 보인다**

- `PUBLIC_GA_ID` 가 **Production** 환경에 등록되었는지 확인 (Preview만 체크된 경우 Production 배포에선 작동 X).
- 광고 차단 확장(`uBlock Origin` 등)이 본인 브라우저에서 GA를 막고 있을 수 있음. 시크릿 창에서 재확인.
- 네트워크 탭에서 `collect?v=2&...` 요청이 200으로 나가는지 확인.

**DNS 전파가 너무 느리다**

- `dig yourdomain.com` 로 A 레코드가 `76.76.21.21` 로 보이는지 확인.
- 24시간 지나도 Vercel이 "Valid Configuration" 을 인식 못하면, 레지스트라에서 TTL 을 **300초 (5분)** 이하로 낮추고 다시 기다려보기.
