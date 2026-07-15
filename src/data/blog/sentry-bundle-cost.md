---
author: seulgi um
pubDatetime: 2026-06-15T12:00:00+09:00
title: "Sentry를 붙였더니 번들이 20% 늘었다"
featured: true
draft: false
tags:
  - sentry
  - monitoring
  - error-tracking
  - performance
  - bundle-size
  - frontend
  - measurement
description: "프로덕션 에러 모니터링이 없던 어드민에 Sentry를 붙였다. 어떻게 붙였고 왜 그렇게 결정했는지, 그리고 470KB이던 번들이 모니터링만으로 97KB(약 20%) 불어난 청구서를 뜯어본 기록. 가장 무거운 Replay(rrweb)를 lazy-load로 분리해 초기 로드에서 40KB를 다시 들어냈다."
---

우리 서비스에는 프로덕션 에러를 보는 눈이 없었습니다. 운영자가 "이거 안 돼요"라고 메신저로 말해줘야 그제서야 "어떤 화면이요?", "어떤 브라우저요?", "한 번 더 해보실 수 있어요?"를 되묻기 시작하는 구조였어요. 재현이 안 되면 그걸로 끝이었고요.

이 글은 거기에 Sentry를 붙인 기록입니다. 무엇을 어떻게 붙였는지, 왜 그렇게 결정했는지, 그리고 그 대가로 받은 번들 사이즈 청구서가 얼마였는지. 500KB도 안 되던 번들이 모니터링 한 번에 20% 넘게 불어난 게 맞는 거래였는지까지 따라갑니다.

## Table of contents

## 무엇이 없었나

문제를 한 줄로 적으면, 에러가 사용자의 입을 통해서만 우리에게 도착했다는 것입니다.

| 기존                                        | 에러 모니터링 도입 후                        |
| ------------------------------------------- | -------------------------------------------- |
| 사용자가 "안 돼요"라고 보고해야 인지        | 에러 발생 즉시 대시보드에 도착               |
| `console.log` 와 함께 재현 시도 → 재현 실패 | 스택 트레이스 + 브레드크럼 자동 수집         |
| "어떤 브라우저/OS인가요?" 매번 질문         | 브라우저·OS·디바이스 자동 기록               |
| API 실패의 원인 추적이 어려움               | 실패한 요청의 url·method·status·payload 캡처 |

이 서비스는 B2B 어드민입니다. 동시 사용자가 많지는 않지만 운영자 한 명이 막히면 그게 곧 운영이 막힙니다. 보고를 기다리는 모니터링은 사실 모니터링이 아니었어요.

## 왜 프론트엔드에 에러 모니터링이 필요한가

서버에는 이미 로그가 있는데 프론트엔드에 굳이 이런 게 왜 필요하냐는 질문을 받을 수 있어서 적어둡니다. 프론트엔드 에러는 우리가 통제할 수 없는 곳에서 납니다. 백엔드 에러는 우리 서버 로그에 남지만, 프론트엔드 에러는 사용자의 브라우저, 우리 손이 닿지 않는 남의 기기에서 터져요. 어떤 브라우저였는지, 네트워크가 어땠는지, 무슨 순서로 눌렀는지 같은 맥락이 전부 사용자 쪽에 있고 서버 로그는 그걸 못 봅니다. "본 적 없는 에러는 고칠 수 없다"는 문제가 프론트엔드에서 유난히 날카로운 이유입니다.

도구로는 Sentry 외에도 Datadog, Bugsnag, Rollbar, LogRocket 같은 대안이 있습니다. 무료 플랜으로 시작할 수 있고 프론트엔드 셋업이 비교적 간단해서 Sentry를 골랐어요. Sentry는 에러 추적에 더해 성능 측정(페이지 로드, API 응답 시간)과 세션 리플레이(에러 난 순간의 화면 재생)를 한 SDK로 제공하는데, 이 글 뒤에서 이 셋을 다 켜는 선택이 번들 청구서로 돌아옵니다.

## 무엇을 붙였나

네 군데입니다. 초기화, 진입점, 라우터 에러 바운더리, axios 인터셉터.

### 초기화: `src/sentry.ts`

```ts title="src/sentry.ts"
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,

  // 현재 환경 — 대시보드에서 환경별 필터링
  environment: import.meta.env.MODE,

  // 프로덕션 빌드에서만 활성화 (로컬 개발 중엔 에러를 쏘지 않음)
  enabled: import.meta.env.PROD,

  integrations: [
    // 페이지 로드, API 요청 등 성능 데이터 자동 수집
    Sentry.browserTracingIntegration(),
    // 에러 발생 시 사용자 화면을 영상처럼 재생
    Sentry.replayIntegration(),
  ],

  // 성능 트랜잭션 샘플링 (프로덕션 20%, 개발 100%)
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

  // 일반 세션 리플레이 10%만 녹화 (비용 절감)
  replaysSessionSampleRate: 0.1,
  // 에러 난 세션은 100% 녹화 (가장 보고 싶은 세션)
  replaysOnErrorSampleRate: 1.0,
});
```

> 위 `replayIntegration()`은 처음 붙였을 때의 모습입니다. 글 뒷부분에서 `init`에서 빼내 lazy-load로 바꿉니다.

의도적으로 정한 게 세 가지 있습니다. `enabled: import.meta.env.PROD`는 로컬 개발 중의 온갖 에러까지 Sentry로 보내면 너무 시끄러워서 프로덕션에서만 켠 것이고, `tracesSampleRate: 0.2`와 `replaysSessionSampleRate: 0.1`은 전부 수집하면 정확하지만 비싸기 때문에 B2B 어드민 규모에서 패턴을 보기에 충분한 수준으로 잡은 것입니다. 반대로 `replaysOnErrorSampleRate: 1.0`은 에러가 난 세션만큼은 전부 녹화하겠다는 뜻이고, 애초에 모니터링을 붙인 이유가 이거예요.

### 진입점: import 순서가 곧 캡처 범위

```ts title="src/main.tsx"
// Sentry 초기화는 다른 모듈보다 "먼저" 로드해야
// 앱 전체의 에러를 빠짐없이 캡처할 수 있음
import "./sentry";
import "./global.css";
import React from "react";
// ...
```

`import "./sentry"`가 맨 위에 있는 건 취향이 아니라 필수입니다. `Sentry.init()`이 실행되기 전에 던져진 에러는 잡히지 않으니까요.

### 라우트 에러 바운더리

React Router의 에러 바운더리에서 잡힌 에러를 Sentry로도 흘려보냅니다.

```ts title="src/components/layouts/PageErrorBoundary.tsx"
export function PageErrorBoundary() {
  const error = useRouteError();
  const errorInfo = getErrorInfo(error);

  // 라우트 에러를 Sentry로 전송
  Sentry.captureException(error);

  // ... 사용자에게는 "오류가 발생했습니다" 화면을 보여줌
}
```

사용자에게는 친절한 폴백 화면을, 우리에게는 스택 트레이스를. 같은 에러를 두 채널에 다르게 전달합니다.

### axios 인터셉터: 무엇을 보내지 않을지

```ts title="src/api/client.ts"
// 401(토큰 만료)은 정상 플로우이므로 Sentry에 보내지 않음
if (error.response?.status !== 401) {
  Sentry.captureException(error, {
    contexts: {
      api: {
        url: originalRequest.url,
        method: originalRequest.method,
        status: error.response?.status,
        data: error.response?.data,
      },
    },
  });
}
```

여기서 가장 중요한 줄은 캡처하는 줄이 아니라 `!== 401` 조건입니다. 우리 서비스에서 401은 "토큰이 만료됐으니 갱신해서 재요청"이라는 정상 흐름이에요. 이걸 에러로 쏘면 대시보드가 401로 도배되고 정작 봐야 할 에러가 묻힙니다. 모니터링은 무엇을 볼지만큼 무엇을 안 볼지가 중요하다고 생각합니다. 대신 보낼 땐 실패한 요청의 url, method, status, payload를 context로 같이 실어서 대시보드에서 바로 "어느 API가 왜 깨졌는지"가 보이게 했어요.

### 소스맵: 난독화를 되돌리는 빌드 설정

프로덕션 JS는 난독화돼 있어서 스택 트레이스가 `a.b.c is not a function` 같은 암호문입니다. 소스맵을 Sentry에 올려두면 원본 TypeScript 위치로 되돌려줍니다.

```ts title="vite.config.ts"
build: {
  // 소스맵 생성 — Sentry에서 원본 코드 위치를 보여주기 위해 필요
  sourcemap: true,
},
plugins: [
  // ...
  // 빌드 시 소스맵을 Sentry로 자동 업로드
  sentryVitePlugin({
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
  }),
],
```

소스맵은 번들에 실려 나가는 게 아니라 Sentry 서버로만 업로드됩니다. 사용자는 받지 않아요.

## 왜 번들 사이즈만 쟀나

도입을 검토하면서 쓴 리포트에 이런 줄을 적었습니다.

> 성능(LCP, INP 등) 측정은 Sentry 수준의 오버헤드에서는 측정 노이즈에 묻히므로 생략하고 객관적으로 비교 가능한 번들 사이즈만 확인한다.

런타임 오버헤드는 이벤트 기반이라 거의 0에 수렴하고, 재봤자 네트워크 지터에 묻힙니다. 반면 번들 사이즈는 같은 코드를 Sentry 있는 채로 한 번, 뺀 채로 한 번 빌드하면 정확하게 비교됩니다. 그래서 `pnpm build` 출력의 gzip 크기를 Before/After로 비교했어요.

참고로 소스맵은 `.map` 파일로 따로 나가고 사용자에게 전송되지 않으므로, 사용자가 실제로 받는 JS의 gzip 크기만 합산했습니다. 소스맵 생성이 출력 JS에 미치는 영향은 `//# sourceMappingURL=` 주석 한 줄뿐이라 비교를 왜곡하지 않습니다.

## 청구서

```
# Before (Sentry 제거)
✓ 2272 modules transformed
✓ built in 6.06s

# After (Sentry 포함)
✓ 2609 modules transformed
✓ built in 10.68s
```

| 항목                      | Before    | After     | 차이                   |
| ------------------------- | --------- | --------- | ---------------------- |
| Total (gzip, JS+CSS 합산) | 469.71 KB | 566.80 KB | **+97.09 KB (+20.7%)** |
| 메인 엔트리 청크 (gzip)   | 176.82 KB | 266.28 KB | **+89.46 KB**          |
| 변환된 모듈 수            | 2,272     | 2,609     | +337                   |
| 빌드 시간                 | 6.06s     | 10.68s    | +4.62s                 |

여기서 멈칫했습니다. 도입 전 우리 번들은 gzip 기준 469KB로, 500KB도 안 되는 서비스였어요. 그런데 모니터링 도구 하나에 97KB, 약 20%가 한 번에 불었습니다.

화면이 늘어난 것도, 사용자에게 보이는 기능이 추가된 것도 아닙니다. 순수하게 에러를 보기 위한 비용으로 사용자가 받는 JS의 5분의 1가량이 늘어난 거예요. 그러자 질문이 바뀌었습니다. "얼마나 늘 거라 예상했나"가 아니라, 에러를 보려고 사용자에게 이만큼을 더 받게 하는 게 맞나?

## 97KB가 어디서 왔나

청구서를 뜯어보니 두 가지가 보였습니다.

하나, Session Replay가 가장 무겁습니다. Replay는 화면을 영상처럼 재생하려고 DOM 변화를 통째로 기록하는 `rrweb`를 끌고 옵니다. 뒤에서 떼어내며 재보니 이 한 조각만 gzip 41KB로, 97KB 중 가장 큰 덩어리였어요. 늘어난 모듈 337개도 대부분 이쪽입니다.

둘, 이게 더 중요한데, 늘어난 97KB 중 89KB가 메인 엔트리 청크에 들어갔습니다. 우리 서비스는 라우트별로 청크가 쪼개져 있는데도, Sentry가 `main.tsx`에서 정적으로 import되는 진입점에 붙다 보니 쪼개지지 않고 첫 페이지 로드 청크에 거의 전부 실렸어요. 사용자가 서비스를 처음 열 때 받는 그 덩어리가 89KB 커진 겁니다.

이게 단순히 "번들이 좀 커졌네"보다 뼈아픈 건, 모니터링 도구가 모니터링 대상의 성능(초기 로드)을 직접 악화시켰기 때문입니다. 성능을 보려고 붙인 도구가 성능 지표를 끌어내리는 아이러니한 구조였어요.

## 그래서 Replay를 유지할 것인가

선택지를 늘어놓으면 이렇습니다.

| 구성                 | 초기 로드 비용 | 얻는 것                         |
| -------------------- | -------------- | ------------------------------- |
| 에러 트래킹만        | ~+20 KB        | 스택 트레이스, 브레드크럼, 알림 |
| + Performance        | ~+35 KB        | Web Vitals, API 응답 시간       |
| + Replay (도입 직후) | ~+97 KB        | 위 전부 + 에러 세션 화면 재생   |

판단을 가른 건 이 서비스가 B2B 어드민이라는 점입니다. 우리 사용자는 매일 같은 어드민을 쓰는 운영자라 초기 로드가 한 번 캐시되면 그 뒤로는 다시 받지 않습니다. 매번 새 방문자가 들어오는 마케팅 페이지였다면 +89KB 초기 로드는 받아들이기 어려웠겠지만, 어드민에서는 첫 진입 1회의 비용이에요. 그리고 Replay가 주는 "재현 없이 에러 화면을 본다"는 가치는 운영자에게 "한 번만 더 해보실 수 있어요?"를 묻지 않아도 된다는 뜻이라 우리에게는 컸습니다.

그래서 Replay는 유지하되, "lazy-load로 분리한다"를 다음 작업으로 남겼습니다. Sentry는 replay 통합을 나중에 동적으로 붙이는 길을 열어두고 있어서, 초기 엔트리 청크에서 rrweb를 빼고 앱이 뜬 뒤 로드하면 초기 로드 비용의 상당 부분을 밀어낼 수 있거든요.

## Replay를 lazy-load로 떼어내다

TODO로 남겨두고 미루면 TODO 무덤이 되니까 바로 했습니다.

기존 구조에서는 replay가 `Sentry.init()`의 `integrations`에 들어가 있어서 rrweb가 엔트리 청크에 같이 번들됩니다. 첫 화면이 뜨는 임계 경로가 그만큼 무거워지고, 그 비용을 운영자가 서비스를 처음 열 때 치릅니다. 그래서 replay를 `init`에서 빼고 서비스가 뜬 뒤 동적으로 붙이기로 했어요. 기대효과는 rrweb를 엔트리에서 들어내 첫 다운로드를 가볍게 하는 것. 다만 "89KB 전부"가 아니라 "뺄 수 있는 만큼"입니다.

### 함정: 같은 모듈을 static + dynamic으로 부르면 안 쪼개진다

처음엔 단순하게 생각했습니다. `init`에서 replay만 빼고, 같은 파일에서 동적으로 다시 붙이면 되지 않나?

```ts
// 이렇게 하면 안 쪼개진다
Sentry.init({ integrations: [Sentry.browserTracingIntegration()] });
import("@sentry/react").then((S) =>
  Sentry.addIntegration(S.replayIntegration()),
);
```

안 됩니다. `@sentry/react`를 이미 위에서 `import * as Sentry`로 정적 import하고 있어서, 같은 모듈을 동적으로 또 부르면 Rollup은 "어차피 둘 다 의존하니 메인 청크에 두자"고 판단합니다. rrweb는 메인에 그대로 남아요.

그래서 replay만 쓰는 별도 모듈을 만들고, 그 모듈을 동적으로만 부르는 구조로 바꿨습니다.

```ts title="src/sentry-replay.ts"
// 이 파일은 동적 import로만 불린다 → rrweb가 이 파일의 별도 청크에 담긴다
import { addIntegration, replayIntegration } from "@sentry/react";
addIntegration(replayIntegration());
```

```ts title="src/sentry.ts"
Sentry.init({
  integrations: [Sentry.browserTracingIntegration()], // replay 없음
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// 앱이 뜬 뒤 Replay를 별도 청크로 붙인다
if (import.meta.env.PROD) {
  const loadReplay = () => void import("./sentry-replay");
  if (document.readyState === "complete") loadReplay();
  else window.addEventListener("load", loadReplay, { once: true });
}
```

`@sentry/react`의 core와 tracing은 두 파일이 함께 정적으로 쓰니 메인에 남고, replay 구현체(rrweb)만 동적 청크로 분리됩니다. 샘플링 비율은 `init` 옵션에 그대로 두면 나중에 붙는 Replay 통합이 클라이언트 옵션에서 읽어갑니다.

### 결과

같은 환경에서 before(replay를 `init`에 둠)와 after(lazy-load)를 빌드해 비교했습니다. 앞 "청구서" 표의 엔트리 청크 숫자와 미세하게 다른 건 before/after를 한 환경에서 새로 빌드해 맞췄기 때문입니다.

| 항목                      | Before (init에 포함) | After (lazy-load) | 차이                   |
| ------------------------- | -------------------- | ----------------- | ---------------------- |
| 메인 엔트리 청크 (gzip)   | 267.21 KB            | 227.05 KB         | **-40.16 KB (-15.0%)** |
| 분리된 replay 청크 (gzip) | —                    | 41.11 KB          | 초기 로드 밖으로       |
| 번들 총합 (gzip)          | 568.81 KB            | 569.88 KB         | +1.07 KB               |

초기 로드가 40KB 가벼워졌습니다. 엔트리 청크에서 rrweb 41KB가 빠졌고, 그건 `load` 이벤트 이후에 별도 청크로 받습니다. 첫 화면이 뜨는 임계 경로에서 빠진 거예요.

총 용량은 거의 그대로입니다(+1KB). lazy-load는 바이트를 없애는 게 아니라 옮기는 기술이라, 같은 rrweb를 여전히 받긴 받습니다. 다만 첫 페인트 이후에요. 총합이 1KB 는 건 청크가 하나 더 생기며 붙은 부수 비용입니다.

그리고 떼어낼 수 있던 건 replay뿐이었습니다. 도입 때 89KB가 엔트리에 실렸지만 lazy-load로 뺄 수 있는 건 replay의 약 40KB까지였어요. browserTracing과 Sentry core는 `init` 시점에 있어야 해서 남습니다. "89KB를 다 뺐다"가 아니라 "뺄 수 있는 만큼 뺐다"가 정확한 표현입니다.

> 트레이드오프가 하나있습니다. replay를 `load` 이후에 붙이므로 그 직전까지의 짧은 구간은 녹화에 안 잡힙니다. 우리 어드민에서 에러 대부분은 사용자가 무언가를 조작한 뒤에 나기 때문에 이 손실은 받아들일 만하다고 봤어요.

직접 재보려면 replay를 `init`에 둔 상태로 한 번, 분리한 상태로 한 번 빌드해서 엔트리 청크의 gzip 크기를 비교하면 됩니다.

```bash
pnpm build 2>&1 | tee build-after.txt
# 출력에서 가장 큰 index-*.js 청크의 gzip 값을 before와 비교
# 분리가 됐다면 sentry-replay-*.js 라는 새 청크가 따로 보인다
```

브라우저에서도 확인할 수 있습니다. DevTools Network 탭에서 첫 로드 직후 `sentry-replay-*.js`가 메인 청크보다 늦게(load 이후) 따로 요청되면 성공입니다.

## 마무리

에러가 사용자의 입을 통해서만 도착하던 서비스에 Sentry를 붙였습니다. 붙인 곳은 초기화, 진입점(import 순서), 라우트 에러 바운더리, axios 인터셉터 네 군데였고, 가장 의미 있던 결정은 무엇을 보낼지가 아니라 무엇을 보내지 않을지(401 제외)였습니다. 모니터링의 절반은 노이즈를 거르는 일이더라고요.

번들 청구서는 gzip +97KB(+20.7%), 그중 +89KB가 메인 엔트리 청크였습니다. 범인은 Replay(rrweb, 단독 41KB)와 그걸 진입점에서 정적으로 import한 구조였어요. B2B 어드민 특성상 감수할 만한 트레이드오프라고 판단해 Replay를 유지하되, 별도 모듈로 만들어 lazy-load했습니다. 엔트리 청크는 267에서 227KB로 40KB 줄었고, 총 바이트는 그대로입니다. 없애는 게 아니라 옮기는 것이니까요.

모니터링 도구는 공짜로 시야를 밝혀 주지 않습니다. 무엇을 보게 됐는지만큼, 그걸 보려고 사용자에게 무엇을 더 받게 했는지를 같이 재고, 옮길 수 있는 비용은 임계 경로 밖으로 옮기는 것. 그게 이번 작업에서 남긴 원칙입니다.

---

> 같이 읽으면 좋은 글
>
> - [98초 걸리던 사진 업로드, 클라이언트 압축으로 17초까지](/posts/client-image-compression)
