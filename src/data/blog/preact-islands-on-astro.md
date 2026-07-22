---
author: seulgi um
pubDatetime: 2026-05-15T10:30:00+09:00
title: "정적 블로그에 인터랙티브 추가하기 - Preact island의 비용 측정"
featured: true
draft: false
tags:
  - astro
  - preact
  - frontend
  - architecture
  - performance
  - islands architecture
description: "정적 블로그에 인터랙티브 데모 페이지 하나를 띄우면서 마주친 결정들. 왜 island였는지, 그 안에 왜 React가 아니라 Preact를 넣었는지, 그리고 그 선택의 비용이 실제로 몇 KB였는지 측정까지 정리했다."
---

이전 글([다음 버튼이 죽어 있던 이유](/posts/silent-form-validation))을 쓰면서 욕심이 하나 생겼습니다. 글에서 다루는 폼을 독자가 직접 만져보게 하고 싶었어요. zod의 검증 결과 객체에 `secondary.N` 같은 인덱스 path가 박힌다는 사실은 글로 설명하는 것보다 라이브로 보여주는 게 훨씬 강력하다고 봤거든요.

그래서 [/labs](/labs) 페이지를 만들기로 했습니다. 이 블로그는 Astro 5 기반의 정적 사이트인데, 단 한 페이지만 인터랙티브하게 만들고 싶은 상황. 답은 island였고, 그 안에 어떤 UI 프레임워크를 띄울지 고민하면서 정리한 글입니다. 마지막에는 이 선택이 실제로 몇 KB짜리였는지 측정한 결과도 있습니다.

## Table of contents

## Islands Architecture

용어는 2019년 [Jason Miller](https://jasonformat.com/islands-architecture/)가 처음 붙였고, Astro가 프레임워크의 핵심 가치로 채택하면서 대중화됐습니다. 한 문장으로 요약하면 "페이지 전체를 hydrate하지 말고, 인터랙티브가 필요한 부분만 hydrate하자"

기존 모델과 비교하면 차이가 분명해집니다.

| 모델                    | HTML 전달   | JS 전달                   | hydration 범위        |
| ----------------------- | ----------- | ------------------------- | --------------------- |
| **CSR / SPA**           | 빈 shell    | 전체 앱 번들              | 전체                  |
| **SSR / SSG** (Next.js) | 완성된 HTML | 전체 페이지 컴포넌트 트리 | 전체 (full hydration) |
| **Islands** (Astro)     | 완성된 HTML | island단위로 쪼개진 chunk | island만 (partial)    |

차이의 본질은 hydration 비용이 어디까지 따라오는가입니다. SSR/SSG가 HTML을 빠르게 보여주되 JS로 한 번 더 그려야 하는 모델이라면, Islands는 정적 HTML은 그대로 두고 필요한 곳만 JS로 살리는 모델이에요.

이게 중요한 이유는 블로그, 문서, 마케팅 페이지 같은 콘텐츠 사이트의 대부분이 정적이기 때문입니다. 5%의 인터랙티브를 위해 나머지 95%도 같이 hydrate 비용을 내는 게 SSR/SSG의 기본값인데, Islands는 그 비대칭을 인정하고 설계에 반영한 모델입니다. 정적 HTML이라는 바다 위에 작은 인터랙티브 섬들이 떠 있는 그림을 떠올리면 됩니다.

## Astro의 island 모델

Astro의 island는 이 한 줄로 시작합니다.

```astro
---
import SilentFailureLab from "@/islands/SilentFailureLab";
---

<SilentFailureLab client:visible />
```

핵심은 `client:*` directive입니다.

| Directive        | hydrate 시점                        | 적절한 사용처                                                              |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `client:load`    | `DOMContentLoaded`직후              | 페이지 진입 즉시 인터랙션 필요한 컴포넌트                                  |
| `client:idle`    | `requestIdleCallback`               | 진입에 영향 X, 메인 스레드 한가할 때                                       |
| `client:visible` | `IntersectionObserver`viewport 진입 | fold(첫 화면의 하단 경계선) 아래 위치, 사용자가 도달했을 때만 충분         |
| `client:media`   | media query 매칭 시                 | 모바일에서만 또는 데스크탑에서만 필요한 UI                                 |
| `client:only`    | SSR 안 하고 클라이언트에서만 mount  | localStorage 필요, 또는 SSR 호환 안 되는 라이브러리 (e.g. Stripe Elements) |

저는 `client:visible`을 골랐습니다. labs 페이지에서 데모가 fold 아래에 있어서, 사용자가 스크롤로 도달해야 의미가 있는 컴포넌트거든요. 사용자가 안 본 island에는 JS를 한 줄도 안 보낼 수 있다는 게 island 모델에서 제일 마음에 드는 부분입니다.

### 직접 짜면서 마주친 제약들

문서에 다 있는 얘기지만, 실제로 부딪힌 것만 추리면 이렇습니다.

props는 직렬화 가능해야 합니다. Astro가 island를 띄울 때 props를 JSON으로 직렬화해 HTML에 심고 클라이언트에서 다시 파싱해 hydrate하기 때문에, 함수나 클래스 인스턴스를 props로 넘길 수 없어요. island끼리는 직접 통신할 수 없어서, 같은 페이지의 두 island가 state를 공유하려면 `nanostores` 같은 외부 store나 `window` 이벤트를 거쳐야 합니다. island 내부에서는 Astro 컴포넌트를 못 쓰고(반대는 가능), 각 island는 별도 JS chunk가 됩니다. 같은 프레임워크의 island끼리는 런타임을 공유해서, 프레임워크 자체는 한 페이지에서 한 번만 로드돼요.

## UI 프레임워크 고르기

Astro는 multi-framework를 지원합니다. 한 프로젝트 안에 React, Preact, Vue, Svelte, Solid 등을 섞어 쓸 수 있어요. 그래서 "island 안에 뭘 띄울까"가 실제 결정 사항이 됩니다.

제 기준은 세 가지였습니다. 정적 블로그의 정체성을 깨지 않도록 단일 island의 비용을 최소화할 것. silent failure 데모의 폼 코드를 다른 React 프로젝트에서 가져올 예정이라 useState/useMemo/useRef API 호환이 될 것. 그리고 글의 핵심이 zod issue path의 인덱스 표기라서 zod를 그대로 쓸 수 있을 것.

후보를 놓고 보면 이렇습니다. 런타임 사이즈는 [`bundlephobia`](https://bundlephobia.com/)와 각 프레임워크 공식 수치 기준이에요.

| 후보       | 런타임 (gzipped)               | API 호환       | 학습 비용 | 선택  |
| ---------- | ------------------------------ | -------------- | --------- | ----- |
| React 19   | ~45 KB                         | 그대로 ✓       | 0         | ✕     |
| **Preact** | **~3 KB**                      | **거의 동일**  | **수 분** | **✓** |
| Solid      | ~7 KB                          | 다름 (signals) | 중간      | ✕     |
| Svelte 5   | 수 KB (런타임 작고 컴포넌트별) | 다름           | 중간      | ✕     |
| Vue 3      | ~16 KB                         | 다름           | 중간      | ✕     |
| vanilla js | 0 KB                           | 직접 작성      | —         | ✕     |

각각을 떨어뜨린 이유는 분명했습니다. React는 익숙하지만 데모 island 하나를 위해 45KB는 과하고, "작게 hydrate한다"는 island 모델의 취지와도 어긋납니다. Solid는 fine-grained reactivity가 매력적이지만 폼 코드를 통째로 재작성하고 signals API를 배워야 해서 비효율적이에요. Svelte 5도 마찬가지로 재작성이 필요하고, `.svelte` 단일 파일 컴포넌트가 블로그의 `.tsx` 코드 톤과 달라지는 것도 걸렸습니다. Vue 3는 데모 한 페이지를 위해 새 프레임워크를 배우는 셈이라 과하고, vanilla js는 0KB로 가장 매력적이지만 zod의 issue path 형태가 글의 핵심인데 검증 로직을 직접 만들면 의미가 흐려집니다.

그래서 Preact를 선택했습니다. React API를 거의 그대로 쓰면서 런타임이 3KB 수준이라, 다른 프로젝트의 폼 코드를 거의 복사해 오고 zod도 동일하게 import해서 같은 검증 결과를 보여줄 수 있었어요.

## 실제로 짜면서 마주친 디테일

### tsconfig의 jsxImportSource, 글로벌 vs 파일별

기본 AstroPaper의 tsconfig는 이렇게 되어 있습니다.

```json title="tsconfig.json"
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

전체 프로젝트의 JSX를 React로 해석한다는 뜻인데, 정작 이 프로젝트에는 React가 깔려 있지도 않습니다. AstroPaper가 React 채택을 가정하고 만든 기본값인 듯해요.

여기서 두 가지 길이 있습니다. tsconfig의 `jsxImportSource`를 `"preact"`로 바꿔 전체를 Preact JSX로 만들거나, 글로벌은 그대로 두고 Preact가 필요한 파일에만 파일별 pragma로 override하거나.

저는 후자를 골랐습니다.

```ts
/** @jsxImportSource preact */
import { useState } from "preact/hooks";
```

이유는 단순합니다. 나중에 React 컴포넌트도 같이 띄울 여지를 남겨두고 싶었어요. Astro는 같은 프로젝트에 React와 Preact를 함께 쓰는 걸 허용하는데, 글로벌을 한쪽으로 못 박으면 그 옵션을 잃습니다. pragma는 한 줄이고, 파일이 어떤 JSX 런타임을 쓰는지 그 파일 안에 명시되니 가독성에도 나쁘지 않고요.

### Preact의 미세한 JSX 차이

API는 거의 동일하지만 JSX 단에서 이런 차이가 있습니다.

| React           | Preact                     | 메모                                   |
| --------------- | -------------------------- | -------------------------------------- |
| `className`     | `class`                    | 둘 다 작동하지만 Preact는 `class` 권장 |
| `onChange`      | `onInput`                  | Preact 는 native input 이벤트 그대로   |
| `htmlFor`       | `for`                      | 마찬가지                               |
| `useState` etc. | `preact/hooks` 에서 import | tree-shake 친화                        |

React에서 코드를 옮겨올 때 가장 자주 부딪히는 건 `onChange` ➜ `onInput`입니다. React의 `onChange`는 사실 native `input` 이벤트에 매핑된 별칭인데, Preact는 native 이름을 그대로 씁니다. React의 독특한 부분을 Preact가 웹 표준 쪽으로 되돌린 것에 가까워요.

```tsx
// React 코드
<input onChange={e => setValue(e.target.value)} />

// Preact 로 옮긴 코드
<input onInput={e => setValue((e.target as HTMLInputElement).value)} />
```

`e.target`의 타입도 React처럼 자동으로 좁혀지지 않아서 `as HTMLInputElement` 캐스팅이 필요합니다.

### preact/hooks가 별도 entry인 이유

```ts
import { useState, useMemo, useRef, useEffect } from "preact/hooks";
```

Preact의 hooks는 코어 패키지에 포함되어 있지 않고 별도 entry(`preact/hooks`)에서 import합니다. hooks를 안 쓰는 작은 컴포넌트는 그만큼 더 작게 번들될 수 있다는 뜻이에요. signal 기반으로 짜고 싶으면 `preact/signals`를 따로 import하는 것도 가능합니다.

### client:visible의 실제 동작

Astro가 빌드할 때 island마다 wrapper script를 만들고, 그 wrapper가 IntersectionObserver를 설치합니다. 그래서 첫 페이지 로드 시점에는 wrapper script만 1KB쯤 로드되고, island가 viewport에 들어오는 순간 프레임워크 런타임과 컴포넌트 chunk를 받아옵니다.

본문을 읽다가 island가 fold 영역에 닿는 순간 네트워크 탭에 새 `.js` 파일들이 잡혀요. 글을 다 안 읽고 떠나는 사용자에게는 island JS가 한 줄도 전달되지 않습니다.

## 측정한 비용

`astro build` 결과의 `dist/_astro/` 디렉토리에서 확인했습니다.

| 자원                   | 사이즈 (gzipped) | 비고                           |
| ---------------------- | ---------------- | ------------------------------ |
| Astro페이지 wrapper    | 약 1–2 KB        | client directive처리           |
| Preact런타임 + hooks   | 약 4 KB          | `preact` + `preact/hooks`      |
| zod(런타임)            | 약 14 KB         | enum 검증·errorMap 그대로 사용 |
| `SilentFailureLab.tsx` | 약 3 KB          | 컴포넌트 본체                  |
| **합계**               | **약 22 KB**     | viewport 진입 후               |

같은 컴포넌트를 React로 짰다면 런타임만 45KB쯤이라 합계가 거의 두 배가 됐을 겁니다.

그리고 중요한 한 가지. labs가 아닌 다른 페이지(이 글, 이전 글, /posts, /tags, /about)에서는 위 비용 중 어느 것도 로드되지 않습니다. island가 없으니까요. 정적 블로그의 Lighthouse 100점을 유지하면서 데모 페이지를 추가할 수 있는 이유가 이거예요.

## island 모델이 안 맞는 경우

오해를 막기 위해 적어둡니다. 모든 사이트가 island로 행복해지는 건 아닙니다.

대시보드나 에디터처럼 페이지 전체가 인터랙티브한 앱은 island가 사실상 페이지 전체를 덮게 되어 full hydration과 다를 게 없어집니다. 그냥 Next.js가 자연스러워요. 여러 island가 state를 깊게 공유해야 하는 경우도 외부 store를 거치느라 복잡도가 올라가는데, 그 영역을 하나의 큰 island로 묶으면 이번엔 island 모델의 장점이 줄어듭니다. SEO와 무관한 사내 admin이라면 정적 HTML의 가치 자체가 작아서 Vite + React가 더 단순한 선택이고요.

요약하면 Astro Islands는 콘텐츠 중심에 인터랙티브가 일부 얹히는 패턴에 가장 잘 맞습니다. 블로그, 문서 사이트, 그리고 이번처럼 글에 데모를 끼워 넣는 작업 같은 것들요.

## 다음에 만날 주제들

이번에 안 다뤘지만 labs가 늘어나면 만나게 될 것들입니다. `window`나 `localStorage`가 필요한 라이브러리를 띄울 때의 `client:only`와 SSR 호환성 문제. 같은 페이지에 React와 Preact를 섞으면 두 런타임이 다 로드되는 multi-framework 비용 문제. 그리고 두 lab이 상태를 공유해야 할 때의 `nanostores`. 그때 가서 같이 정리할 생각입니다.

## 마무리

이번 결정을 한 줄로 줄이면 이렇습니다. 정적 블로그에 데모 한 페이지를 띄우는 작업에서, 단일 island의 비용을 최소화하면서 React 코드 자산을 그대로 옮기고 싶었고, Preact + zod가 그 교집합이었다.

island 모델은 "HTML은 정적, JS는 부분만"으로 요약되기 쉽지만, 실제로 짜다 보면 hydration 시점(`client:*`), 프레임워크 런타임 비용, JSX pragma의 위치, props 직렬화 같은 결정이 줄지어 따라옵니다. 한 번 정리해두면 다음 island를 만들 때 같은 고민을 반복하지 않아도 돼요.

직접 확인해보고 싶다면 [/labs/silent-form-validation](/labs/silent-form-validation)에서 네트워크 탭을 열어두고 페이지를 천천히 스크롤해보세요. island가 fold에 닿는 순간 새 chunk들이 로드되는 게 보입니다. 그게 island가 깨어나는 순간이에요.
