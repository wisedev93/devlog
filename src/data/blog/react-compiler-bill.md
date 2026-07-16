---
author: seulgi um
pubDatetime: 2026-07-16T13:00:00+09:00
title: "React Compiler를 켜면 useMemo가 필요없을까?"
featured: true
draft: false
tags:
  - react
  - react-compiler
  - performance
  - measurement
  - frontend
description: "React Compiler가 켜진 프로젝트에 수동 메모이즈가 111번 남아있습니다. compiler가 무엇을 잡아주고 무엇은 못 잡는지, 빌드 시간/번들 크기는 얼마인지, 결국 어떤 원칙을 정했는지의 기록."
---

회사 프로젝트에 `babel-plugin-react-compiler`가 켜져있습니다. 그런데 어느 날, useCallback이 남아있는 것을 보고 ide에서 검색해 봤어요.

**useMemo 25개 파일에서 49개**

**useCallback 27개 파일에서 62개**

**React.memo 검색 결과 없음**

**111번.** Compiler를 켰는데 수동 메모이즈가 111번 남아있었습니다. 다 지웠어야 하는 것 아닌가? 단순히 안 지운 것인가? 아니면 의도된 것인가?

이 글은 그 질문을 따라가며 (a) Compiler가 실제로 무엇을 잡아주는지, (b) 무엇은 못 잡는지, (c) 빌드 시간과 번들 크기가 얼마나 왔는지, (d) 그래서 우리 코드베이스에 어떤 원칙을 새로 추가했는지에 대한 기록입니다.

> 본문에서 다루는 on/off 비교는 [/labs/react-compiler-toggle](/labs/react-compiler-toggle) 에서 같은 컴포넌트를 두 모드로 직접 토글해볼 수 있습니다.

## Table of contents

## 프로젝트 환경

먼저 결과를 비교하기 위해 기록해 둡니다.

```ts title="vite.config.ts"
plugins: [
  react({
    babel: {
      plugins: [
        ["babel-plugin-react-compiler"],
        ...(process.env.NODE_ENV === "production"
          ? ["transform-remove-console"]
          : []),
      ],
    },
  }),
  tailwindcss(),
],
```

```json title="package.json (관련 부분)"
{
  "dependencies": {
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "babel-plugin-react-compiler": "^1.0.0",
    "eslint-plugin-react-hooks": "^7.0.1"
  }
}
```

React 19, Compiler v1, hooks 플러그인 v7. v7부터는 hooks 플러그인 안에 compiler 룰 일부가 통합돼 있어서, 별도로 `eslint-plugin-react-compiler`를 추가하지 않아도 컴파일이 안 되는 컴포넌트에 대해서는 ESLint 경고가 나옵니다.

`React.memo`는 코드 전체에 0번. 즉 우리는 컴포넌트 자체를 메모이즈한 적은 없고, 값/콜백만 수동 메모이즈했다는 뜻이에요.

측정 환경도 적어둡니다. Node 22, pnpm 8, 리눅스 arm64 컨테이너. 빌드 시간은 3회 반복의 중앙값이고, 절대값보다는 compiler on/off 사이의 상대 비교가 목적입니다.

## 첫 질문 — React Compiler가 무엇을 잡아주고 있는가

React Compiler가 정확히 어떤 일을 하는지부터 짚고 갑니다. 단순히 말하면 "함수 컴포넌트의 본문을 분석해서, 같은 입력이면 같은 값을 돌려주도록 자동으로 메모이즈한다"인데, 중요한 건 **무엇을** 메모이즈하느냐예요. Compiler는 컴포넌트 본문 안의 모든 식(expression)을 살펴보고, 변하지 않는 값은 캐시합니다. 즉 손으로 `useMemo`를 붙이지 않아도, 같은 효과가 나게 코드를 다시 짜요.

그렇다면 우리 111번의 메모이즈는?

가능성은 셋입니다.

1. **불필요했던 것** — Compiler가 자동으로 잡아주는데 손으로 한 번 더 붙였던 경우.
2. **React Compiler가 분석에 실패한 것** — 코드가 compiler로 안전하게 분석할 수 없는 형태라서 컴파일에서 빠진 컴포넌트. ESLint가 알려줍니다.
3. **용도가 다른 것** — 메모이즈가 참조 안정성 같이 다른 목적인 경우.

이 셋을 구분하려면 측정이 필요합니다.

## 측정 방법론

세 가지를 봅니다.

| 측정                 | 도구                           | 답하는 질문                                      |
| -------------------- | ------------------------------ | ------------------------------------------------ |
| 컴파일 커버리지      | `eslint-plugin-react-hooks` v7 | 어떤 컴포넌트가 compiler에서 빠졌나?             |
| 인터랙션 렌더 카운트 | React DevTools Profiler        | useMemo/useCallback을 지워도 렌더 횟수가 같은가? |
| 빌드 비용            | `vite build` (compiler on/off) | 빌드 시간과 번들 크기는 얼마나 변했나?           |

각 측정에 대해 "compiler On/Off 코드"의 숫자를 비교합니다.

### 컴파일러를 끄는 법

`vite.config.ts`에서 `babel-plugin-react-compiler` 한 줄만 빼면 됩니다.

```diff title="vite.config.ts"
  plugins: [
    react({
      babel: {
        plugins: [
-         ["babel-plugin-react-compiler"],
          ...(process.env.NODE_ENV === "production"
            ? ["transform-remove-console"]
            : []),
        ],
      },
    }),
  ],
```

## 측정 1 — 컴파일 커버리지

가장 먼저 본 건 "React Compiler가 우리 컴포넌트의 몇 %를 실제로 컴파일하고 있는가"입니다. 컴파일 못 한 컴포넌트는 v7 hooks 플러그인이 ESLint 경고로 알려줘요.

```bash
$ pnpm lint 2>&1 | grep -c "react-hooks/"
32
```

전체 lint 결과를 룰별로 집계하면 이렇습니다.

| 항목                      | 값                                                             |
| ------------------------- | -------------------------------------------------------------- |
| 전체 파일 수              | 266 `.ts`/`.tsx` 합산, `.tsx`(컴포넌트)는 184                  |
| Compiler 진단이 나온 파일 | 10개 전체의 3.8%                                               |
| 진단 총 건수              | 32건                                                           |
| 룰별 분포                 | `refs` 24 / `set-state-in-effect` 7 / `incompatible-library` 1 |

96%의 파일은 진단 없이 통과했습니다. 생각보다 커버리지가 높아요. 그리고 진단이 나온 10개 파일의 결과가 흥미롭습니다. `CustomForm`, `FormDrawer`, `DatePicker`, `DateRangePicker`, `AdditionalFilters` — 전부 디자인 시스템 폴더의 공용 컴포넌트예요. 도메인 페이지가 아니라, 모든 페이지가 사용하는 공통 컴포넌트에 진단이 몰려 있습니다.

패턴별로 보면 다음과 같습니다.

1. **렌더 중 ref 접근** (`react-hooks/refs`, 24건) — 렌더 본문에서 `ref.current`를 읽는 코드. Compiler는 렌더 결과에 영향을 주는 값만 안전하게 캐시할 수 있는데, ref는 렌더 밖에서 변하는 값이라 이 컴포넌트들의 메모이즈를 포기합니다.
2. **effect 내부의 setState** (`react-hooks/set-state-in-effect`, 7건) — cascading render를 만드는 패턴이라 경고 대상.
3. **비호환 라이브러리** (`react-hooks/incompatible-library`, 1건) — `data-table.tsx`, TanStack Table. "이 API가 반환하는 함수는 메모이즈하면 stale UI가 된다"며 compiler가 스스로 컴파일을 건너뜁니다.

## 측정 2 — 인터랙션 렌더 카운트

다음 질문은 "수동 메모이즈를 지워도 렌더가 똑같이 일어나는가"입니다. React DevTools에서 커밋을 하나하나 세는 대신, 측정 대상을 `<Profiler>`로 감싸고 `onRender` 콜백에서 커밋 수와 `actualDuration`을 누적하게 했어요. 인터랙션 직전에 콘솔에서 리셋하고, 끝나면 누적값을 읽는 방식으로 측정했습니다.

```tsx
const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  commits += 1;
  totalMs += actualDuration;
  console.log(`[${id}] ${phase} | 커밋 ${commits}회 | 누적 ${totalMs.toFixed(1)}ms`);
};
```

대상 시나리오는 우리 코드베이스에서 가장 무거운 두 화면:

1. **목록 관리 페이지** — 로드 완료 후 리셋 ➜ 필터 한 번 변경 ➜ 정렬 한 번 변경
2. **등록 모달** — 리셋 ➜ 모달 열기 ➜ 상위 옵션 선택 ➜ 하위 옵션 선택 (2단 연쇄 select)

각각을 (a) compiler on + useMemo/useCallback 유지, 현재 상태, (b) compiler on + 해당 페이지 폴더의 useMemo/useCallback 15곳 제거, (c) compiler off + useMemo/useCallback 유지 — 세 가지로 비교했습니다. 목적은 세 모드의 상대 비교이고 각각 3회 측정 후 중앙값을 사용했습니다.

| 시나리오                     | 측정           | (a) 현재 | (b) 메모이즈 제거 | (c) compiler off |
| ---------------------------- | -------------- | -------- | ----------------- | ---------------- |
| 목록 페이지 (필터+정렬 변경) | 커밋 수        | 19       | 19                | 22               |
| 목록 페이지 (필터+정렬 변경) | 누적 렌더 시간 | 543.8 ms | 507.1 ms          | 630.5 ms         |
| 등록 모달 (열기➜선택➜선택)   | 커밋 수        | 52       | 52                | 66               |
| 등록 모달 (열기➜선택➜선택)   | 누적 렌더 시간 | 208.3 ms | 230.4 ms          | 478.6 ms         |

여기서 보고 싶었던 건 **(a)와 (b)의 차이**입니다. 차이가 없다면 ➜ useMemo/useCallback이 불필요했다는 뜻이고 차이가 있다면 ➜ compiler가 잡아주지 못했다는 뜻이니까요.

결과는 명확했습니다.

**(a)와 (b)는 사실상 같았습니다.** 커밋 수는 두 시나리오 모두 완전히 동일하고(19/52), 시간 차이는 반복 측정 편차 이내입니다. 해당 폴더의 수동 메모이즈 15곳을 전부 지웠는데 아무 일도 일어나지 않은 거죠. compiler가 같은 곳을 이미 자동으로 잡아주고 있었다는 뜻입니다.

**(c)는 달랐습니다.** compiler를 끄자 수동 메모이즈가 다 살아있는데도 커밋이 늘고(19➜22, 52➜66), 시간은 페이지 +16%, 모달은 **2.3배**가 됐어요. 직접 메모이즈한 건 15곳이지만, compiler는 그 화면을 구성하는 나머지 전부를 메모이즈하고 있었던 겁니다. 모달 쪽 격차가 큰 건 열기➜선택➜선택으로 이어지는 연쇄 리렌더가 많은 화면이라 자동 메모이즈의 수혜가 그만큼 컸다는 뜻이고요.

추가로 로드 구간을 따로 계측해보면 33커밋 중 `nested-update`(커밋이 끝나기 전에 effect 안에서 다시 setState가 일어난 커밋)가 14번이었습니다. 측정 1에서 ESLint가 경고한 `set-state-in-effect`가 정적 분석에만 있는 얘기가 아니라 런타임에서 실제로 관측된다는 교차 검증도 할 수 있었습니다.

## 측정 3 — 빌드 청구서

마지막은 빌드 시간과 번들 크기. Compiler는 런타임이 아닌 빌드 타임에 적용되는 도구입니다. 그래서 얼마나 영향을 주는지 확인해보고 싶었어요.

```bash
# compiler on (3회 중앙값)
$ time npx vite build
real  0m11.1s   # "✓ built in 10.67s"

# compiler off (vite.config.ts에서 한 줄 제거 후, 3회 중앙값)
$ time npx vite build
real  0m7.3s    # "✓ built in 6.86s"
```

`du -sh dist`는 둘 다 15M로 나와서 처음엔 차이가 없는 줄 알았는데, 이건 sourcemap이 대부분을 차지해서 그렇습니다. 실제로 사용자에게 가는 JS만 gzip 기준으로 합산하는게 맞아요.

| 항목                           | compiler on | compiler off | 차이               |
| ------------------------------ | ----------- | ------------ | ------------------ |
| `vite build` 시간 (3회 중앙값) | 11.1 s      | 7.3 s        | **+52%**           |
| 전체 JS 합계 (gzip)            | 669 KB      | 616 KB       | **+53 KB (+8.7%)** |
| 가장 큰 chunk `index` (gzip)   | 228 KB      | 223 KB       | +5 KB (+2.3%)      |
| dev 서버 cold start            | 0.21 s      | 0.19 s       | 사실상 동일        |

결과를 보면 — **빌드 시간 +52%, 번들 +8.7%**. 예상보다 둘 다 유의미하게 나왔습니다.

침고로 번들 증가분 53KB는 compiler가 각 컴포넌트에 심는 메모이즈 코드(캐시 슬롯과 비교 분기)가 청크 전반에 흩어진 결과입니다. 가장 큰 chunk 하나만 보면 +2.3%라 착시가 생기는데, 전체를 합산하면 +8.7%예요. 빌드 시간 +52%는 `vite build` 단독 기준이고, 우리 빌드 스크립트는 `tsc -b`(약 4.6초, compiler와 무관)가 앞에 붙어 있어서 `pnpm build` 전체 기준으로 했을 때 실제로는 +30% 정도가 맞습니다.

그리고 dev cold start에 차이가 없는 건 측정 전 제 예상과 달랐습니다. Vite는 시작 시점에 변환을 하지 않고 요청이 올 때 파일 단위로 변환하니까, babel 플러그인의 비용은 cold start가 아니라 **첫 페이지 로드의 파일별 변환**에 추가됩니다.

## 메모이즈 111번을 분석해보면..

측정결과를 통해 셋으로 구분할 수 있습니다.

### 분류 A. 지워도 되는 것

- Compiler가 같은 곳을 자동으로 잡아주고 있고,
- (a)와 (b)의 렌더 횟수/시간이 같음.

측정 2에서 확인된 대상 페이지 폴더의 15곳이 전부 여기 해당합니다. `ItemTable`의 `filterColumns`, `StatusLogModal`의 콜백 8개, `ItemCreateModal`의 `subOptions` 같은 것들은 지워도 커밋 수가 1도 안 변했어요. 전체 111곳 중 나머지도 상당수가 여기 속할 것으로 보이지만, 그건 파일 단위로 측정하면서 지울 일이지 짐작으로 일괄 삭제할 일은 아니기에 점진적으로 개선해야 합니다.

그렇다고 남겨두는 게 아무 문제가 없는 것도 아닙니다. Compiler는 기존 수동 메모이즈를 지우지 않고 보존하는데, dependency 배열이 부정확한 `useMemo`/`useCallback`은 compiler가 그 컴포넌트의 데이터 흐름을 분석하는 걸 방해해서 추가 최적화가 막힐 수 있습니다. 분류 A가 "있어도 무해한 코드"가 아니라 "천천히라도 걷어내야 할 코드"인 이유가 하나 더 생기는 셈이에요.

### 분류 B. 남겨야 하는 것

- Compiler가 그 컴포넌트 자체를 컴파일하지 못했거나, 컴파일했어도 그 식을 잡지 못함.
- (a)와 (b) 사이에 측정 가능한 차이가 있음.

여기는 측정 1에서 진단이 나온 10개 파일입니다. 특히 `data-table.tsx`는 compiler가 명시적으로 컴파일을 건너뛴다고 선언한 파일이라, 여기 있는 `useMemo`/`useCallback`은 지우면 안 됩니다. 그리고 이 파일들이 전부 공용 컴포넌트라는 게 뼈아픈 지점이에요. 모든 페이지가 이 컴포넌트들을 거치니까, compiler의 빈틈이 코드베이스에서 가장 자주 렌더되는 곳에 있는 셈입니다. 측정 2의 (c)에서 compiler를 끄자 시간이 페이지 +16%, 모달 2.3배로 뛴 것은 직접 붙여준 15곳 밖에서 compiler가 하던 일이 그만큼 컸다는 뜻이니까요. 다만 이번 실측은 한 페이지 폴더 범위였고, 이 10개 파일의 메모이즈를 하나씩 지워보는 (b)형 실측은 하지 않았습니다. 컴파일이 안 되는 게 확인된 파일의 메모이즈를 굳이 지워볼 이유가 없어서요.

### 분류 C. 용도가 다른 것

메모이즈 자체는 불필요한데, **참조 안정성**을 외부(예: useEffect dependency)에 보내야 해서 남겨두는 경우. 이건 성능이 아니라 정확성 문제예요. Compiler가 어떻게 잡든 상관없이 남깁니다.

우리 코드의 실례는 `ItemUpdateDrawer`의 `getDefaultValues`입니다. `useCallback`으로 감싸서 `FormDrawer`에 prop으로 넘기는데, FormDrawer 안에서 이게 `useEffect`의 dependency로 들어가요(`[open, reset, getDefaultValues]`). 그런데 FormDrawer는 분류 B에서 본, compiler가 컴파일하지 못하는 파일입니다. 넘기는 쪽에서 `useCallback`을 지우면 매 렌더마다 새 참조가 내려가고, effect가 렌더마다 다시 돌면서 폼이 계속 리셋될 수 있어요. FormDrawer의 주석에도 "useCallback으로 감싸서 넘겨라"라고 적혀 있는데, 이건 메모이즈가 곧 최적화, 성능만을 뜻하는게 아니라는 뜻입니다.

### 분석결과에 따라서 판단 기준을 잡으면..

**성능, 최적화를 위한 용도**라면 compiler로 처리하고(A), **동작, 의도를 표현하는 용도**라면 남깁니다(C). 그리고 compiler가 잡지못하는 것(B)은 예전 방식 그대로 손으로 붙이고요.

## 그래서 다음과 같은 원칙을 정했습니다.

1. **새 코드에서는 `useMemo`/`useCallback`을 기본적으로 쓰지 않는다.** Compiler에게 맡깁니다. 직접 붙이는 건 위 분류 B 또는 C에 해당한다는 명시적 근거가 있을 때만.
2. **컴파일에서 빠진 컴포넌트는 ESLint 경고를 못 본 척하지 않는다.** v7 hooks 플러그인이 경고로 알려주면, 그 컴포넌트는 compiler가 분석 못 한 거라 직접 메모이즈하지 않으면 매 렌더마다 모든 식이 재계산됩니다.
3. **외부의 콜백/객체는 `useCallback`/`useMemo`를 명시적으로 남긴다.** 분류 C. 이건 성능 최적화가 아니라 참조 안정성 등 다른 용도라는 걸 주석으로 남깁니다.
4. **분류 A 메모이즈는 새 PR에서 발견되면 지우는 쪽으로 코드리뷰한다.** 한 번에 111개를 일괄 제거하지 않고 측정을 기반으로 제거하기 위해서입니다.

이 원칙은 사람만 보라고 만든 게 아닙니다. 우리 팀은 AI 보조 개발 파이프라인으로 페이지를 찍어내고 있어서, AI가 습관적으로 `useCallback`을 사용하면 분류 A가 계속 늘어나요. 그래서 `CLAUDE.md`에 그대로 추가했습니다.

```md title="CLAUDE.md (발췌)"
### 메모이제이션 (React Compiler 켜져 있음)

- 새 코드에서 `useMemo`/`useCallback`을 기본적으로 쓰지 않는다. Compiler에 맡긴다.
- Compiler가 컴파일 못 한 컴포넌트(ESLint `react-hooks/*` 진단)는 수동 메모이즈를 유지한다.
  경고를 못 본 척하지 않는다.
- 참조 안정성이 계약인 콜백/객체(useEffect deps로 새는 경우, 예: `FormDrawer`의
  `getDefaultValues`)는 `useCallback`을 유지하고 이유를 코멘트로 남긴다.
- 불필요한 기존 메모이즈는 PR에서 발견될 때 지운다. 측정 없는 일괄 제거는 금지.
```

추가로 Compiler는 빌드 타임 도구라 버전이 바뀌면 같은 코드에서 다른 출력이 나올 수 있습니다. 이 글을 쓰면서 확인해 보니 `package.json`에 `^1.0.0`으로 열려 있더라고요. 컴파일러류 의존성은 시맨틱 버저닝을 믿고 자동으로 올리기보다, 버전을 고정해두고 올릴 때 직접 검증하는 쪽이 맞다고 판단해서 `1.0.0`으로 고정했습니다.

## 진짜 비용

마지막으로, React Compiler는 마법이 아닙니다... 비용이 들어요.

**빌드 시간.** 측정 3에서 본 +52%(`vite build` 기준 +3.8초). CI에서 하루 PR 5개 × push 5회면 25빌드, 더해봐야 2분이 안 됩니다. 솔직히 이건 부담이라고 부르기 어려워요. 진짜 비용은 시간이 아니라 번들 +8.7% 쪽입니다. 사용자 전원이 매 방문마다 내는 비용이니까요.

**ESLint 경고를 끝까지 무시하면 매 렌더마다 재계산.** v7 hooks 플러그인이 알려주는 경고는 "이 컴포넌트는 compiler가 분석 못 해서 메모이즈 못 하고 있어요"라는 뜻인데 무시하면 compiler도 못쓰고, 수동 메모이즈도 적용을 안하는 둘 다 잃은 상태가 됩니다.

**디버깅의 모호성.** Compiler가 자동으로 만든 메모이즈는 React DevTools에서 보면 "왜 이 렌더가 일어났는지/안 일어났는지"를 추적하기가 손으로 짠 것보다 한 단계 더 어렵습니다. 의심스러울 때 임시로 compiler를 끄고 비교해볼 필요가 있습니다.

## 마무리

Compiler가 켜진 코드베이스에 수동 메모이즈가 111번 남아 있다는 발견에서 출발해, 측정을 통해 셋으로 구분했습니다. 지워도 되는 것 — 한 페이지 폴더의 15곳을 지워도 커밋 수가 19/52 그대로였습니다. 남겨야 하는 것 — compiler가 컴파일하지 못하는 10개 파일, 하필 전부 공용 컴포넌트였고요. 용도가 다른 것 — useEffect deps로 새는 참조 안정성. 그리고 반대로 compiler를 끄자, 수동 메모이즈가 다 살아있는데도 모달 렌더 시간이 2.3배가 됐습니다. 직접 처리하던 15곳보다 compiler가 처리하는 나머지가 훨씬 컸던 거예요.

비용도 계산해봤습니다. 빌드 시간 +52%, 번들 gzip +53KB(+8.7%), dev cold start는 차이 없음. 이 비용보다 자동 메모이즈를 통한 이득이 크다고 판단해서 compiler를 유지하기로 했고, 대신 4가지 원칙을 CLAUDE.md에 넣어 사람과 AI가 같은 기준으로 쓰게 했습니다. 기본은 compiler에 맡기고, 직접 추가하는 건 근거를 설명할 수 있을 때만.

진짜진짜 정리해보면.. **React Compiler를 켜놓고 수동 메모이즈를 할 때는 명확한 기준과 근거가 필요하다.**

---

> 같이 읽으면 좋은 글
>
> - [/labs/react-compiler-toggle](/labs/react-compiler-toggle) — 본문 측정 2의 차이를 직접 만져보는 데모
