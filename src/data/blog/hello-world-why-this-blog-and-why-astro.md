---
author: wisedev93
pubDatetime: 2026-04-23T09:00:00+09:00
title: "Hello, world — 블로그를 개설했습니다. 그리고 Astro를 고른 이유"
featured: true
draft: false
tags:
  - intro
  - astro
  - frontend
description: "첫 글입니다. velog/tistory/GitHub Pages가 아닌 커스텀 블로그를 택한 이유, Next.js와 Astro 사이에서 Astro를 고른 이유, 그리고 이 블로그에서 앞으로 다룰 주제들을 정리합니다."
---

안녕하세요. 프론트엔드 개발자의 기술 블로그입니다.

첫 글이니 블로그 자체에 대한 이야기를 남겨두려고 해요. **왜 굳이 블로그 플랫폼을 쓰지 않고 직접 만들었는지**, **왜 Next.js가 아니라 Astro였는지**, 그리고 **앞으로 뭘 쓰려고 하는지**. 이 세 가지입니다.

## Table of contents

## 왜 velog/tistory/GitHub Pages가 아닌가

결론부터 말하면, **블로그 자체를 내 이름을 거는 작업물 중 하나로 만들고 싶었습니다.**

- **velog**: 한국 개발자 커뮤니티에 자연스럽게 유입되는 장점이 크고 시작이 빠릅니다. 다만 `velog.io/@username` 이라는 URL과 고정된 레이아웃은 **나를 드러내는 창**으로 쓰기엔 약했어요. 블로그 자체에서 내가 내린 판단이 하나도 드러나지 않는다는 게 걸렸습니다.
- **tistory**: 커스터마이징 폭은 넓지만, 광고 및 전반적인 톤이 **2026년 기준 프론트엔드 포트폴리오**와 결이 맞지 않았어요. 2010년대 블로그 감성에 가깝습니다.
- **GitHub Pages + Jekyll**: 무료에 커스텀 도메인 연결도 되지만 Jekyll은 Ruby 기반이라 프론트엔드 스택과 동떨어집니다. Next.js로 Pages에 올리는 것도 가능하지만 SSR/ISR이 제한되고, 결국 **Vercel에 올릴 거라면 GitHub Pages를 거칠 이유가 없다**는 결론이었어요.

## Next.js와 Astro 중에서

본업 스택이 React/Next.js라 Next.js가 자연스러운 선택이었습니다. 그런데 블로그라는 **구체적인 목적**에 맞춰 다시 보면, 오히려 Astro가 더 설득력 있었어요.

### 결정 기준

저에겐 세 가지가 중요했습니다.

1. **글쓰기에 집중할 수 있는 구조**
2. **기본 성능이 뛰어날 것**
3. **학습 비용이 지나치게 크지 않을 것**

### 비교

| 항목                                | Next.js (App Router + MDX)       | Astro                |
| ----------------------------------- | -------------------------------- | -------------------- |
| MDX 통합                            | 직접 세팅 또는 `next-mdx-remote` | 공식 integration 1줄 |
| 기본 성능                           | 평균 Lighthouse 90~95            | 평균 100/100/100/100 |
| SEO/OG/sitemap                      | 하나씩 조립                      | starter에 포함       |
| 학습 비용                           | 0                                | `.astro` 문법 30분   |
| 블로그 기능 (검색·태그·OG 자동생성) | 직접 구현                        | starter에 포함       |

```tsx title="Next.js에서 직접 짰다면..."
// generateStaticParams, MDX 파서, frontmatter 검증 로직 등
// 전부 내 코드로 관리해야 함
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}
```

```astro title="Astro에서는"
---
// src/data/blog/my-post.md 하나 추가하면 끝.
// Content Collections가 타입까지 검증.
---
```

글 쓰기에 드는 **코드 유지 비용**이 눈에 띄게 달랐습니다.

### 결정

Astro로 가기로 했습니다. "익숙한 도구"라는 관성보다 "이 문제에 맞는 도구"를 고른 것이고, 이 선택 자체가 **블로그의 첫 번째 기술적 메시지**가 된다고 봤어요.

starter는 [`astro-paper`](https://github.com/satnaing/astro-paper)를 썼습니다. 아래 기능이 모두 기본 포함되어 있어 글쓰기 이외의 시간 소요가 거의 없었습니다.

- MDX + Shiki 코드 하이라이팅
- OG 이미지 자동 생성
- sitemap, RSS, robots.txt
- Pagefind 정적 검색
- 다크/라이트 모드 자동 전환
- 태그 분류, 아카이브 페이지

## 앞으로 쓰고 싶은 주제들

일단 머릿속에 있는 것들을 나열해둡니다. 순서는 미정.

- 레거시 프로젝트에 **테스트를 도입한 과정**과 받은 저항, 그리고 가장 큰 효과를 낸 테스트 유형
- 거대해진 컴포넌트를 **리팩토링**한 실제 PR 이야기 — "이렇게 하면 좋다"가 아니라 "이렇게 해서 이런 문제가 생겼고 이렇게 해결했다"
- Core Web Vitals를 실무에서 개선한 케이스 — CLS, LCP를 실제 어떤 지표로 보고 어떤 코드 변경이 가장 효과 있었는지
- **디자인 시스템을 처음 구축**할 때 자주 빠지는 함정들
- 5년차로서 **팀 리뷰 문화를 바꿔본 시도들**

목표는 단순합니다. *"내가 읽었을 때 도움이 됐을 글"*을 쓰는 것.

## 마무리

블로그는 결국 **오래 쓸 수 있어야** 가치가 쌓입니다. 이 첫 글이 그 시작이 되기를.

피드백이나 궁금한 점은 아래 댓글(giscus)로 남겨주세요. GitHub 계정만 있으면 바로 쓸 수 있습니다.
