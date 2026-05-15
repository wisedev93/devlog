---
author: seulgi um
pubDatetime: 2026-05-15T10:30:00+09:00
title: "Astro Island, Preact로 하나 띄워보기 — 도구를 고른 이유와 그 비용"
featured: true
draft: false
tags:
  - astro
  - preact
  - frontend
  - architecture
  - performance
  - islands architecture
description: "정적 블로그에 인터랙티브 시연 페이지 하나를 띄우면서 마주친 결정들. Islands Architecture가 실제로 어떤 모델인지, 왜 Preact였는지(React/Solid/Svelte가 아닌 이유), 그리고 측정 가능한 비용."
---

이전 글([폼 검증이 조용히 막힐 때](/posts/silent-form-validation))을 쓰면서 한 가지 욕심이 생겼습니다. **"글에서 다루는 폼을 독자가 직접 만져보게 하면 어떨까?"** zod의 검증 결과 객체에 `secondary.N`같은 인덱스 path가 박혀있다는 사실을, 글로 설명하는 것보다 라이브로 보여주는 게 강력하다고 봤어요.

그래서 [/labs](/labs) 페이지를 만들기로 했습니다. 이 블로그는 Astro 5 기반의 정적 사이트인데, **단 한 페이지만 인터랙티브** 하게 만들고 싶은 상황. 답은 island 였고, 그 안에 어떤 UI framework를 띄울지를 고민하면서 정리한 글입니다.

이미 익숙한 SPA / SSR / SSG의 다음 단계로서 Islands Architecture를 어떻게 평가할지에 대한 기록이에요. 그리고 그 안에 Preact를 끼워 넣은 trade-off에 대한 기록이기도 합니다.

## Table of contents

## Islands Architecture가 뭔가요

용어는 2019년 [Jason Miller](https://jasonformat.com/islands-architecture/)가 처음 붙였고, Astro가 이걸 framework 핵심 가치로 채택하면서 대중화됐습니다.

**페이지 전체를 hydrate 하지 말고, 인터랙티브가 필요한 부분만 hydrate 하자.**
기존 모델과 비교해 보면 차이가 명확해집니다.

| 모델                    | HTML 전달   | JS 전달                   | hydration 범위        |
| ----------------------- | ----------- | ------------------------- | --------------------- |
| **CSR / SPA**           | 빈 shell    | 전체 앱 번들              | 전체                  |
| **SSR / SSG** (Next.js) | 완성된 HTML | 전체 페이지 컴포넌트 트리 | 전체 (full hydration) |
| **Islands** (Astro)     | 완성된 HTML | island단위로 쪼개진 chunk | island만 (partial)    |

차이의 본질은 **hydration비용이 어디까지 따라오는가**예요. SSR/SSG가 "HTML을 빠르게 보여주지만 JS로 다시 한 번 그려야 하는" 모델이라면, Islands는 "정적 HTML은 그대로 두고 필요한 곳만 JS 로 살린다"는 모델입니다.

이게 진짜로 중요한 이유는, **블로그/문서/마케팅 페이지 같은 콘텐츠 사이트의 95% 는 정적**이라는 사실이에요. 그 5%의 인터랙티브를 위해 95%도 같이 hydrate 비용을 지불하는 게 SSR/SSG의 기본 모델입니다. Islands는 그 비대칭을 그대로 인정한 모델이고요.

비유는 단순합니다. 정적 HTML이라는 바다 위에, 작은 인터랙티브 섬(island)들이 떠 있는 그림.

## Astro의 island 모델 — 디테일

Astro의 island는 다음 한 줄로 시작합니다.

```astro
---
import SilentFailureLab from "@/islands/SilentFailureLab";
---

<SilentFailureLab client:visible />
```

`client:*` directive 가 핵심이고, 종류와 사용처는 이렇게 정리됩니다.

| Directive        | hydrate 시점                        | 적절한 사용처                                                              |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `client:load`    | `DOMContentLoaded`직후              | 페이지 진입 즉시 인터랙션 필요한 컴포넌트                                  |
| `client:idle`    | `requestIdleCallback`               | 진입에 영향 X, 메인 스레드 한가할 때                                       |
| `client:visible` | `IntersectionObserver`viewport 진입 | fold(첫 화면의 하단 경계선) 아래 위치, 사용자가 도달했을 때만 충분         |
| `client:media`   | media query 매칭 시                 | 모바일에서만 또는 데스크탑에서만 필요한 UI                                 |
| `client:only`    | SSR 안 하고 클라이언트에서만 mount  | localStorage 필요, 또는 SSR 호환 안 되는 라이브러리 (e.g. Stripe Elements) |

저는 `client:visible`을 골랐어요. labs 페이지의 fold 아래에 시연이 있어서, 사용자가 스크롤로 도달해야 의미가 있는 컴포넌트입니다. **사용자가 안 본 island에는 JS를 단 한 줄도 안 보내는 게 가능**하다는 게 island모델의 백미예요.

### 알아둘 만한 제약

직접 짜면서 마주친 부분만 추렸습니다.

1. **props는 직렬화 가능해야 합니다.** Astro가 island를 띄울 때 props를 JSON으로 직렬화해서 HTML에 내장하고, 클라이언트에서 그걸 다시 파싱해 hydrate 해요. 그래서 함수나 클래스 인스턴스를 props로 넘길 수 없습니다.
2. **island끼리는 직접 통신할 수 없습니다.** 같은 페이지 안의 두 island가 state를 공유하려면 외부 store(`nanostores`)나 `window` 이벤트를 거쳐야 해요.
3. **island 내부에서는 Astro컴포넌트를 못 씁니다.** 반대(Astro안에 island)는 자유롭게 가능.
4. **각 island는 별도 JS chunk** 가 됩니다. 같은 framework의 다른 island끼리는 framework 런타임을 공유하지만, framework 자체는 한 페이지 안에서 단 한 번만 로드돼요.

## UI framework 선택한 기준

Astro는 multi-framework를 지원입니다. 한 프로젝트 안에 React, Preact, Vue, Svelte, Solid, Lit, Alpine, vanilla js, TS 등을 자유롭게 섞어 쓸 수 있어요.

이 시점에서 저는 다음을 평가했습니다.

### 평가 기준

1. **단일 island의 비용을 최소화** — 정적 블로그의 정체성을 깨고 싶지 않음.
2. **silent failure 시연 폼 코드를 다른 React 프로젝트에서 가져옴** — useState/useMemo/useRef API 호환이 필요.
3. **zod를 그대로 쓰고 싶음** — 글의 핵심이 zod issue path의 인덱스 표기임.

### 후보 비교

framework 런타임 사이즈는 [`bundlephobia`](https://bundlephobia.com/)와 각 framework의 공식 수치 기준입니다.

| 후보       | 런타임 (gzipped)               | API 호환       | 학습 비용 | 선택  |
| ---------- | ------------------------------ | -------------- | --------- | ----- |
| React 19   | ~45 KB                         | 그대로 ✓       | 0         | ✕     |
| **Preact** | **~3 KB**                      | **거의 동일**  | **수 분** | **✓** |
| Solid      | ~7 KB                          | 다름 (signals) | 중간      | ✕     |
| Svelte 5   | 수 KB (런타임 작고 컴포넌트별) | 다름           | 중간      | ✕     |
| Vue 3      | ~16 KB                         | 다름           | 중간      | ✕     |
| vanilla js | 0 KB                           | 직접 작성      | —         | ✕     |

각각을 떨어뜨린 이유는 분명했어요.

- **React** — 익숙하지만 단일 시연 island를 위해 45KB 는 비대칭. 그리고 island모델의 본질("작게 hydrate")에 어긋남.
- **Solid** — fine-grained reactivity가 매력적이지만, 폼 코드 통째로 재작성 + signals API 학습. ROI가 낮음.
- **Svelte 5** — 컴파일러 기반이라 작고 빠르지만 마찬가지로 재작성. 또 .svelte 단일 파일 컴포넌트 문법이 .tsx와 톤이 달라 블로그 코드 톤 통일성이 떨어짐.
- **Vue 3** — 익숙하지 않은 API. 시연 한 페이지를 위해 새 framework 학습은 과함.
- **vanilla js** — 0KB 로 가장 매력적이지만, zod의 issue path 형태가 글의 핵심이라 검증 로직을 직접 만들면 의미가 흐려짐. state관리도 손으로 짜야 함.

➡️ **Preact**. React API를 거의 그대로 + 런타임 ~3KB. 다른 프로젝트의 폼 코드를 거의 복사–붙여넣기로 가져올 수 있고, zod를 동일하게 import해서 동일한 검증 결과를 보여줄 수 있어요.

## 실제로 짜면서 마주친 디테일

### 1. tsconfig의 `jsxImportSource` 글로벌 vs 파일별

기본 AstroPaper 의 tsconfig는 이렇게 설정돼 있습니다.

```json title="tsconfig.json"
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

전체 프로젝트의 JSX를 React로 해석한다는 뜻이에요. 그런데 이 프로젝트에는 React가 깔려있지도 않습니다. AstroPaper가 React 채택을 가정하고 만든 디폴트인 듯해요.

여기서 두 가지 길이 있습니다.

- (A) tsconfig의 `jsxImportSource`를 `"preact"`로 변경. 전 프로젝트가 Preact JSX가 됨.
- (B) 글로벌은 그대로 두고, Preact가 필요한 파일에 **파일별 pragma**로 override.

저는 (B)를 골랐어요.

```ts
/** @jsxImportSource preact */
import { useState } from "preact/hooks";
```

이유는 단순합니다. **나중에 React컴포넌트도 같이 띄울 수 있는 여지를 남겨두고 싶었어요.** Astro의 multi-framework 지원은 같은 프로젝트에 React + Preact를 같이 쓰는 걸 허용합니다. 글로벌을 한쪽으로 못 박으면 그 옵션을 잃어요. pragma는 한 줄이고, 파일이 어떤 JSX런타임을 쓰는지 명시되니 가독성에도 도움이 됩니다.

### 2. Preact의 미세한 JSX 차이

API 는 거의 동일하지만, JSX단에서 다음 차이가 있어요.

| React           | Preact                     | 메모                                   |
| --------------- | -------------------------- | -------------------------------------- |
| `className`     | `class`                    | 둘 다 작동하지만 Preact는 `class` 권장 |
| `onChange`      | `onInput`                  | Preact 는 native input 이벤트 그대로   |
| `htmlFor`       | `for`                      | 마찬가지                               |
| `useState` etc. | `preact/hooks` 에서 import | tree-shake 친화                        |

특히 `onChange` ➡️ `onInput`은 React에서 옮겨오면 가장 자주 부딪히는 지점이에요. React의 `onChange`가 사실은 native `input` 이벤트에 매핑돼 있는데, Preact는 native 이름을 그대로 씁니다. **React의 "이상한 점"을 Preact가 native 표준으로 되돌린 것** 에 가깝습니다.

```tsx
// React 코드
<input onChange={e => setValue(e.target.value)} />

// Preact 로 옮긴 코드
<input onInput={e => setValue((e.target as HTMLInputElement).value)} />
```

`e.target`의 타입도 React처럼 자동으로 `HTMLInputElement`로 변환되지 않습니다. TS처럼 as 캐스팅이 필요해요.

### 3. preact/hooks의 의미

```ts
import { useState, useMemo, useRef, useEffect } from "preact/hooks";
```

Preact의 hooks는 코어 패키지에 안 포함되어 있고 별도 entry(`preact/hooks`)에서 import 합니다. **hooks안 쓰는 작은 컴포넌트는 더 작게 번들될 수 있다는 의미**예요. signal 기반으로 짜고 싶으면 `preact/signals`를 따로 import 할 수도 있습니다.

### 4. `client:visible`의 실제 동작

Astro가 build 할 때 island 마다 wrapper script를 만들고, 해당 wrapper가 IntersectionObserver를 설치합니다. 그래서 처음 페이지 로드 시점에는 **wrapper script만 약간(~1KB) 로드**되고, island가 viewport에 진입하는 순간에 framework 런타임 + 컴포넌트 chunk를 받아와요.

문서 본문을 읽다가 flod 영역에 도달하는 그 순간 네트워크 탭에 새로운 .js 파일들이 잡힙니다. 글을 다 안 읽고 페이지를 떠나는 사용자에게는 island JS가 한 줄도 전달되지 않아요.

## 측정한 비용

번들 분석은 `astro build` 결과의 `dist/_astro/` 디렉토리를 보면 됩니다.

| 자원                   | 사이즈 (gzipped) | 비고                           |
| ---------------------- | ---------------- | ------------------------------ |
| Astro페이지 wrapper    | 약 1–2 KB        | client directive처리           |
| Preact런타임 + hooks   | 약 4 KB          | `preact` + `preact/hooks`      |
| zod(런타임)            | 약 14 KB         | enum 검증·errorMap 그대로 사용 |
| `SilentFailureLab.tsx` | 약 3 KB          | 컴포넌트 본체                  |
| **합계**               | **약 22 KB**     | viewport 진입 후               |

같은 컴포넌트를 React로 짰다면 런타임만 ~45KB. 거의 두 배가 됩니다.

그리고 중요한 한 가지 — **labs 페이지가 아닌 다른 글 페이지**(이 글, 이전 글, /posts, /tags, /about)에서는 위 비용 중 어느 것도 로드되지 않아요. island가 없으니까요. 이게 island 모델의 가장 큰 정체성이고, "정적 블로그의 LCP 100점" 을 유지하면서 시연 페이지를 추가할 수 있는 이유입니다.

## 한계 — 언제 island 모델이 안 맞을까

오해를 막기 위해 솔직히 적어둡니다. 모든 사이트가 island로 행복하지는 않아요.

- **페이지 전체가 인터랙티브한 SPA-like 앱** (대시보드, 에디터, 그리기 도구) — 이 경우 island가 사실상 페이지 전체를 덮어서 SSR의 full hydration과 다를 게 없어집니다. 그냥 Next.js가 더 자연스러워요.
- **여러 island가 state를 공유해야 하는 경우** — 가능하지만 `nanostores` 같은 외부 store를 거쳐야 해서 복잡도가 올라갑니다. 한 페이지 안에서 깊은 상호작용이 필요하면 그 영역 자체를 하나의 큰 island로 묶는 게 낫고, 그러면 island 모델의 장점이 줄어듭니다.
- **SEO 무관한 사내 admin** — 정적 HTML의 가치가 작아서 굳이 Astro가 아니어도 됩니다. Vite + React가 더 단순한 선택이에요.

요약하면 — Astro Islands는 **콘텐츠 중심 + 일부 인터랙티브**라는 패턴에 가장 잘 맞습니다. 블로그, 문서 사이트, 마케팅 페이지, 그리고 이번 사례처럼 **글 안에 인터랙티브 시연을 끼워 넣는 작업**에 자연스럽고요.

## 다음에 만나고 싶은 것들

이번에 안 다뤘지만 islands 모델을 본격적으로 쓸 때 만나게 될 주제들입니다.

- **`client:only`와 SSR 호환성** — `window`, `localStorage`, `IntersectionObserver`가 필요한 라이브러리를 island에 띄울 때.
- **Astro의 multi-framework한 페이지 혼용** — 같은 페이지에 React + Preact를 같이 쓰면 둘 다의 런타임이 로드돼 비용이 더해집니다. 보통 하나로 통일하는 게 낫지만, 외부 라이브러리(예: 특정 React-only UI 라이브러리) 때문에 어쩔 수 없을 때.
- **nanostores로 island간 state공유** — 두 lab이 같은 상태를 공유해야 할 때.

이 블로그의 labs가 늘어나면 위 주제들도 같이 다루게 될 것 같아요.

## 마무리

이 글의 결정을 한 줄로 줄이면 이렇습니다.

**정적 블로그에 시연 한 페이지를 띄우는 작업에서, 단일 island의 비용을 최소화하면서 React 코드 자산을 그대로 옮기고 싶었고 — Preact + zod가 합리적인 선택이었다.**

Astro의 island 모델은 단순히 "HTML 정적, JS 부분만"으로 요약되기 쉽지만, 실제로 도구를 골라 짜다 보면 hydration시점(`client:*`)과 framework 런타임 비용, JSX pragma의 위치, props 직렬화 같은 결정들이 줄지어 따라옵니다. 이 결정들을 한 번 정리해두면 다음에 island를 만들 때 "왜 이렇게 짰는지" 를 다시 설명하지 않아도 돼요.

직접 만져보고 싶다면 **[/labs/silent-form-validation](/labs/silent-form-validation)**에서 island가 어떻게 떠 있는지 볼 수 있어요. 네트워크 탭을 열어두고 페이지를 천천히 스크롤해보면, viewport 영역이 fold에 닿는 순간 새로운 chunk들이 로드되는 게 보입니다. 그게 island가 깨어나는 순간이에요.
