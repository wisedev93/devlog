---
author: seulgi um
pubDatetime: 2026-04-27T11:40:00+09:00
title: "블로그를 시작합니다"
featured: true
draft: false
tags:
  - intro
  - astro
  - frontend
description: "첫 글입니다. velog나 tistory 대신 블로그를 직접 만든 이유, Next.js가 본업 스택인데도 Astro를 고른 이유, 앞으로 쓰려는 주제들을 남겨둡니다."
---

안녕하세요. 프론트엔드 개발자의 기술 블로그입니다.

첫 글이니 블로그 자체에 대한 이야기를 남겨두려고 합니다. 왜 블로그 플랫폼을 쓰지 않고 직접 만들었는지, 왜 본업 스택인 Next.js가 아니라 Astro였는지, 앞으로 뭘 쓰려고 하는지. 이 세 가지입니다.

## Table of contents

## 왜 velog/tistory/GitHub Pages가 아닌가

결론부터 말하면, 블로그 자체를 제 이름을 거는 작업물 중 하나로 만들고 싶었습니다. 글 내용과는 별개로요.

velog는 한국 개발자 커뮤니티에 자연스럽게 노출되는 장점이 크고 시작도 빠릅니다. 다만 `velog.io/@username`이라는 URL과 고정된 레이아웃으로는 블로그 자체에서 제가 내린 판단이 하나도 드러나지 않는다는 게 걸렸어요.

tistory는 커스터마이징 폭이 넓지만 광고와 전반적인 톤이 2010년대 블로그 감성에 가깝게 느껴졌습니다. 지금 만드는 기술 블로그와는 결이 안 맞았고요.

GitHub Pages + Jekyll은 무료에 커스텀 도메인도 되지만, Jekyll이 Ruby 기반이라 프론트엔드 스택과 동떨어집니다. Next.js를 Pages에 올리는 방법도 있긴 한데 SSR/ISR이 제한되고, 어차피 Vercel에 올릴 거라면 GitHub Pages를 거칠 이유가 없다는 결론이 났습니다.

## Next.js와 Astro 중에서

본업 스택이 React/Next.js라서 Next.js가 자연스러운 선택이긴 했습니다. 그런데 "블로그"라는 구체적인 목적에 맞춰 다시 보니 Astro 쪽이 더 설득력 있었어요.

제게 중요했던 기준은 세 가지입니다. 글쓰기에 집중할 수 있는 구조일 것, 기본 성능이 뛰어날 것, 학습 비용이 지나치게 크지 않을 것.

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

글 하나 쓰는 데 드는 코드 유지 비용이 눈에 띄게 달랐습니다.

그래서 Astro로 갔습니다. 익숙한 도구라는 관성보다 이 문제에 맞는 도구를 고른 것이고, 이 선택 자체가 블로그의 첫 번째 기술적 메시지가 된다고 봤어요.

starter는 [`astro-paper`](https://github.com/satnaing/astro-paper)를 썼습니다. MDX + Shiki 코드 하이라이팅, OG 이미지 자동 생성, sitemap/RSS/robots.txt, Pagefind 정적 검색, 다크 모드, 태그 분류까지 기본으로 들어 있어서 글쓰기 외의 시간이 거의 안 들었습니다.

## 앞으로 쓰고 싶은 주제들

일단 머릿속에 있는 것들을 나열해둡니다. 순서는 미정입니다.

- 레거시 프로젝트에 테스트를 도입한 과정과 받은 저항, 가장 효과가 컸던 테스트 유형
- 거대해진 컴포넌트를 리팩토링한 실제 PR 이야기. "이렇게 하면 좋다"가 아니라 "이렇게 해서 이런 문제가 생겼고 이렇게 풀었다" 쪽으로
- Core Web Vitals를 실무에서 개선한 케이스. CLS, LCP를 어떤 지표로 봤고 어떤 코드 변경이 효과가 있었는지
- 디자인 시스템을 처음 구축할 때 빠지기 쉬운 함정들
- 팀 리뷰 문화를 바꿔본 시도들

목표는 단순합니다. 제가 읽었을 때 도움이 됐을 글을 쓰는 것.

## 마무리

블로그는 결국 오래 써야 가치가 쌓입니다. 이 첫 글이 그 시작이 되기를.

피드백이나 궁금한 점은 아래 giscus 댓글로 남겨주세요. GitHub 계정만 있으면 바로 쓸 수 있습니다.
