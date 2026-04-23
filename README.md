# Dev Blog

[`astro-paper`](https://github.com/satnaing/astro-paper) starter 기반, Vercel 배포.

배포 절차, 커스텀 도메인 연결, GA4/giscus 설정은 [`DEPLOY.md`](./DEPLOY.md) 참고.

---

## Use as a template

이 블로그의 세팅을 그대로 쓰고 싶다면 `template` 브랜치를 받으세요:

```bash
git clone -b template --single-branch https://github.com/wisedev93/devlog.git my-blog
cd my-blog && rm -rf .git && git init
pnpm install && pnpm dev
```

## 빠른 시작

```bash
# 1) 의존성 설치
pnpm install

# 2) 환경 변수 설정 (선택: GA4/giscus 값 채우기)
cp .env.example .env

# 3) 개발 서버
pnpm dev         # http://localhost:4321

# 4) 프로덕션 빌드 & 로컬 프리뷰
pnpm build
pnpm preview
```

Node 20+ 권장, pnpm 10+ 사용.

---

## 글 쓰기

글은 전부 `src/data/blog/` 안에 **Markdown/MDX**로 둡니다. 파일명이 그대로 URL slug로 쓰이므로 영어 kebab-case 를 권장합니다.

```bash
src/data/blog/my-new-post.md
# → /posts/my-new-post
```

### 최소 frontmatter 템플릿

```markdown
---
author: Your Name
pubDatetime: 2026-04-20T09:00:00+09:00
title: "글 제목"
description: "SEO description / OG description 용도. 한 줄."
tags:
  - frontend
  - refactoring
draft: false # true면 빌드에서 제외됨
featured: false # true면 홈 상단 featured 섹션에 노출
---
```

`draft: true` 글은 개발 서버에서는 보이지만 **프로덕션 빌드·sitemap·RSS에서 제외**됩니다. 쓰다 만 글은 draft로 두면 안전하게 repo에 push할 수 있어요.

### 코드 블록

Shiki가 내장되어 있어 언어 태그만 넣으면 됩니다.

````markdown
```tsx title="components/Button.tsx"
export function Button({ children }: { children: React.ReactNode }) {
  return <button>{children}</button>;
}
```
````

`title="..."` 를 넣으면 파일명이 코드 블록 상단에 표시됩니다. 줄 강조·diff 표시는 [Shiki transformers 문서](https://shiki.style/packages/transformers) 참고.

---

## 디렉토리 구조

```
src/
├── assets/              # 아이콘, 이미지
├── components/          # Astro/React 컴포넌트
│   ├── Giscus.astro            ← 댓글 위젯
│   └── GoogleAnalytics.astro   ← GA4 스니펫
├── data/
│   └── blog/            # ← 여기에 md/mdx 추가하면 글 생성
├── layouts/
│   ├── Layout.astro     # 공통 <head>, GA 로드 지점
│   └── PostDetails.astro # 글 상세, giscus 삽입 지점
├── pages/               # 라우팅
├── config.ts            # 사이트 메타 (placeholder 값 수정 필요)
└── constants.ts         # 소셜 링크 (placeholder 값 수정 필요)
```

처음 한 번만 수정하면 되는 파일:

| 파일               | 수정 포인트                                          |
| ------------------ | ---------------------------------------------------- |
| `src/config.ts`    | `website`, `author`, `title`, `desc`, `editPost.url` |
| `src/constants.ts` | GitHub/LinkedIn/Mail 링크                            |
| `.env`             | `PUBLIC_GA_ID`, `PUBLIC_GISCUS_*`                    |

각 파일에 `TODO[PLACEHOLDER]` 주석으로 무엇을 바꿔야 하는지 표시해뒀습니다.

---

## 스크립트

| 명령                | 설명                                         |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | 개발 서버                                    |
| `pnpm build`        | 타입 체크 + 정적 빌드 + Pagefind 인덱스 생성 |
| `pnpm preview`      | 빌드된 결과를 로컬 서빙                      |
| `pnpm lint`         | ESLint                                       |
| `pnpm format`       | Prettier 자동 포맷                           |
| `pnpm format:check` | Prettier 검사만                              |

---

## 배포 & 도메인

Vercel에 올리고 커스텀 도메인을 붙이는 전체 절차는 [`DEPLOY.md`](./DEPLOY.md)에 단계별로 정리되어 있습니다.

---

## 라이선스

`astro-paper` starter의 MIT 라이선스를 그대로 유지합니다 ([`LICENSE`](./LICENSE)). 내가 쓴 글(마크다운 콘텐츠)의 저작권은 본인에게 있습니다.
