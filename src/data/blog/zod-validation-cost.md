---
author: seulgi um
pubDatetime: 2026-10-07T22:30:00+09:00
title: "API 응답을 전부 Zod로 검증하면 느려질까?"
featured: true
draft: false
tags:
  - zod
  - performance
  - measurement
  - frontend
  - typescript
description: "모든 API 응답을 Zod 스키마로 검증하는 어드민에서, 목록 100행을 파싱하는 데 140ms가 걸렸습니다. 처음엔 런타임 검증의 비용이라고 생각했는데, 측정해 보니 그중 99%는 Zod가 아니라 스키마의 transform 안에서 도는 날짜 포맷 함수였어요. 실제 스키마 세 개로 검증 비용을 나눠 재고, 무엇을 고치고 무엇을 유지했는지의 기록."
---

서버 응답을 받자마자 전부 Zod 스키마로 검증하는 서비스가 있습니다. [팩토리 글](/posts/factory-in-react)에서 다룬 `validateResponse`가 모든 API 호출 마지막에 있고, 스키마와 다른 응답이 오면 어느 엔드포인트의 어느 필드가 어긋났는지 콘솔과 Sentry에 남기고 에러를 던집니다. `.parse`/`.safeParse`/`validateResponse` 호출을 세어 보면 코드베이스 전체에 141곳이에요.

이 방식을 정할 때 늘 따라오던 질문이 있었습니다. **모든 응답을 런타임에 한 번 더 훑으면, 그 비용은 얼마인가?** 타입스크립트 타입은 빌드가 끝나면 사라지지만 Zod 검증은 런타임으로 사용자의 브라우저에서 매번 실행됩니다. 목록 페이지는 한 번에 최대 100행을 받고, 필터를 바꿀 때마다 다시 받아요.

이 질문은 두 번 미뤄둔 숙제이기도 했습니다. [하네스 2편](/posts/agent-harness-refactor-measured)에서는 레거시의 `no-unsafe-*` 391건을 "엔드포인트별 Zod 스키마를 붙이는 별도 작업"으로 남겼고, [500KB 경고 글](/posts/entry-chunk-500kb)에서는 로그인 화면 하나에 zod 63.4KB(gzip)가 딸려 온다는 걸 발견하고 "따로 물어야 할 질문"으로 넘겼습니다. 레거시에 Zod를 확장하기 전에, 이미 전부 검증하고 있는 이 프로젝트에서 비용부터 재기로 했습니다.

## Table of contents

## 측정 설계

실제 코드베이스의 스키마 세 개를 그대로 가져왔습니다. 필드 수와 구조가 서로 다른 목록 응답들이에요.

| 스키마      | 행당 필드 | 특징                                                    |
| ----------- | --------- | ------------------------------------------------------- |
| 충전소 목록 | 11        | 가장 단순한 형태. 날짜 필드 2개                         |
| 충전 내역   | 34        | 필드가 가장 많음. 금액 필드가 `number \| string` 유니온 |
| 충전기 목록 | 23        | 충전기·충전소·요금제 정보가 중첩된 객체. 날짜 필드 8개  |

세 스키마 모두 행 단위로 `.transform()`이 붙어 있습니다. 서버가 주는 ISO 날짜 문자열을 화면에 보여줄 한국 시간 문자열로 바꾸는 변환이에요.

```ts title="stationType.ts (발췌)"
export const stationItemSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    // ...
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
  })
  .transform(({ created_at, updated_at, ...rest }) => ({
    created_at: created_at ? formatDateKST(created_at) : created_at,
    updated_at: updated_at ? formatDateKST(updated_at) : updated_at,
    ...rest,
  }));
```

측정 데이터는 스키마를 순회해서 자동으로 만들었습니다. nullish 필드도 전부 값을 채웠기 때문에, 날짜 필드가 비어 있는 실제 응답보다 변환이 조금 더 많이 일어나는 조건입니다. 행 수는 실제 페이지 크기 선택지(15/30/50/100)의 양 끝인 15와 100, 그리고 확장성을 보기 위한 500과 1000.

각 조건에서 세 가지를 쟀습니다.

- **전체**: 실제 스키마로 `safeParse` 한 번
- **검증만**: 같은 스키마에서 `.transform()`만 제거하고 `safeParse` 한 번
- **참고값**: 같은 데이터의 `JSON.parse(JSON.stringify())` 한 번 (데이터를 한 번 전부 읽고 새로 만드는 비용의 기준)

## 측정 1 — 100행에 140ms

| 스키마      | 행 수 | 전체    | 검증만 | transform 비중 | 참고값 |
| ----------- | ----- | ------- | ------ | -------------- | ------ |
| 충전소 목록 | 15    | 6.3ms   | 0.07ms | 99%            | 0.02ms |
| 충전소 목록 | 100   | 37.0ms  | 0.26ms | 99%            | 0.13ms |
| 충전 내역   | 15    | 11.6ms  | 0.22ms | 98%            | 0.06ms |
| 충전 내역   | 100   | 69.1ms  | 0.98ms | 99%            | 0.40ms |
| 충전기 목록 | 15    | 22.6ms  | 0.24ms | 99%            | 0.08ms |
| 충전기 목록 | 100   | 140.6ms | 1.36ms | 99%            | 0.47ms |

측정은 Node 22(zod 4.4.3)에서 조건별로 워밍업 후 15~20회 반복한 중앙값입니다.

충전기 목록 100행을 파싱하는 데 **140.6ms**. 브라우저가 50ms 넘게 메인 스레드를 잡고 있으면 긴 작업으로 분류되는데, 그 기준의 세 배 가까운 시간입니다. 사용자가 "100개씩 보기"를 누르면 응답이 도착한 뒤 화면이 그려지기까지 이만큼 멈춰 있는 셈이에요.

처음 이 숫자를 봤을 때는 "런타임 검증은 역시 비싸구나"라고 생각했습니다. 실제로는 **140ms 중 Zod가 쓴 시간은 1.36ms였습니다.** 나머지 99%는 전부 transform, 즉 스키마 안에 넣어둔 함수에서 걸린 시간이었어요.

## 비용은 Zod가 아니라 날짜 포맷에 있었다

transform 안에서 하는 일은 사실상 `formatDateKST` 호출뿐입니다. 이 함수만 따로 1,000번 호출해 보니 **219ms**, 한 번에 0.22ms였습니다. 충전기 목록은 행마다 날짜 필드가 8개라, 100행이면 약 800번 호출해서 170ms 안팎이 나옵니다. 측정값과 거의 맞아요.

함수를 열어 보면 이유가 보입니다.

```ts title="common/utils/date.ts (발췌, 수정 전)"
const kstYmd = (date: Date) => {
  const part = (options: Intl.DateTimeFormatOptions, suffix: string) =>
    date
      .toLocaleString("ko-KR", { timeZone: "Asia/Seoul", ...options })
      .replace(suffix, "")
      .trim();

  return {
    year: part({ year: "numeric" }, "년"),
    month: part({ month: "2-digit" }, "월").padStart(2, "0"),
    day: part({ day: "2-digit" }, "일").padStart(2, "0"),
  };
};

export const formatDateKST = (dateString: string, { detail = false } = {}) => {
  const date = new Date(dateString);
  const { year, month, day } = kstYmd(date);
  const hour = date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false })
    .replace("시", "").trim().padStart(2, "0");
  const minute = date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", minute: "2-digit" })
    .replace("분", "").trim().padStart(2, "0");
  // detail이면 초도 같은 방식으로 한 번 더
  // ...
};
```

날짜 하나를 포맷하는 데 `toLocaleString`을 연·월·일·시·분 다섯 번(초까지 쓰면 여섯 번) 부르고, 매번 "년", "월" 같은 한국어 단위를 문자열 치환으로 떼어냅니다. 문제는 옵션을 넘긴 `toLocaleString`이 호출될 때마다 내부에서 `Intl.DateTimeFormat`을 새로 만든다는 점이에요. 로케일 데이터와 시간대 규칙을 읽어서 포맷터를 준비하는 작업이 날짜 하나에 다섯 번, 100행이면 수백 번 반복되고 있었습니다.

프로젝트 초기에 만들어져서 지금은 타입 파일 14개의 transform 안에서 41번 호출됩니다. 목록 응답이 도착할 때마다 행 수 × 날짜 필드 수만큼 실행되는 코드 안에 들어가 있었던 거죠. 화면 하나에서 날짜 몇 개를 포맷할 때는 느낄 수 없는 비용이라, 스키마 안으로 들어가고 나서도 아무도 몰랐습니다.

참고로 이함수가 필요했던 이유는 충전기 제조사 마다 날짜 포멧 양식이 전부 달라서 생기는 문제가 있어서 프론트에서 KST를 보장하기 위함이였습니다.

## 고친 것 — 포맷터를 한 번만 만든다

포맷터를 모듈 스코프에서 한 번만 만들고, `formatToParts`로 연·월·일·시·분·초를 한 번에 꺼내게 바꿨습니다.

```ts title="common/utils/date.ts (수정 후)"
const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const kstParts = (date: Date) => {
  const parts: Record<string, string> = {};
  for (const p of KST_FORMATTER.formatToParts(date)) parts[p.type] = p.value;
  return parts;
};

export const formatDateKST = (dateString: string, { detail = false } = {}) => {
  const p = kstParts(new Date(dateString));
  const base = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  return detail ? `${base}:${p.second}` : base;
};
```

출력 형식이 한 글자라도 달라지면 목록 화면 전체의 표시가 바뀌니, 결과가 같은지부터 확인했습니다. 2026년 1년치를 7분 13초 간격으로 훑은 73,031개 시각에 대해 기존 함수와 새 함수의 출력(분 단위, 초 단위, 날짜만)을 비교했고, 다른 결과는 0건이었습니다. 자정과 정오, 연말연초도 이 범위에 들어갑니다.

결과는 이렇습니다.

| 스키마                  | 행 수 | 수정 전 | 수정 후 | 검증만 |
| ----------------------- | ----- | ------- | ------- | ------ |
| 충전소 목록             | 100   | 37.0ms  | 1.45ms  | 0.29ms |
| 충전 내역               | 100   | 69.1ms  | 2.91ms  | 0.99ms |
| 충전기 목록             | 100   | 140.6ms | 5.22ms  | 1.39ms |
| `formatDateKST` × 1,000 | -     | 219ms   | 4.4ms   | -      |

충전기 목록 100행이 140.6ms에서 5.2ms로, 약 27분의 1이 됐습니다. 함수 한 번은 0.22ms에서 0.0044ms로 50분의 1이고요.

브라우저에서도 같은지 충전소 목록 스키마와 두 함수로 다시 쟀습니다. 100행 파싱이 52.7ms에서 1.0ms로 줄었고, 두 함수의 출력 비교(2만 개 시각)도 불일치 0건이었습니다. 절대값은 Node보다 오히려 컸어요. 브라우저의 `toLocaleString`이 더 느리게 동작한 것인데, 어느 쪽이든 원인과 개선 비율은 같았습니다.

## 측정 2 — 그러면 Zod 검증 자체의 비용은

transform을 걷어낸 "검증만" 하는 것이 원래 궁금했던 수치였고, 행 수를 늘려 봤습니다.

| 스키마      | 15행   | 100행  | 500행  | 1000행 | 1000행 참고값 |
| ----------- | ------ | ------ | ------ | ------ | ------------- |
| 충전소 목록 | 0.08ms | 0.29ms | 1.12ms | 0.95ms | 1.49ms        |
| 충전 내역   | 0.21ms | 0.99ms | 1.96ms | 3.92ms | 4.00ms        |
| 충전기 목록 | 0.23ms | 1.39ms | 2.35ms | 4.81ms | 5.15ms        |

필드가 34개인 충전 내역이나 중첩이 많은 충전기 목록도, 실제 최대 페이지 크기인 100행에서 1ms 안팎입니다. 1000행까지 늘려도 5ms 아래고, 데이터를 한 번 복사하는 참고값과 비슷한 수준이에요. Zod 4는 객체 스키마를 처음 쓸 때 검증 함수를 미리 만들어 두고 이후 호출에서 재사용하기 때문에, 반복 호출에서는 필드를 한 번 훑는 비용에 가깝게 나옵니다.

준비 비용은 첫 호출에만 붙습니다. 새 프로세스에서 첫 파싱을 따로 재 보니 충전기 목록 100행이 7.8ms(수정 후 기준)로, 반복 호출의 5.2ms보다 2.6ms 더 걸렸습니다. 페이지에 처음 들어갈 때 한 번 내는 비용이고, 체감할 수 있는 수준은 아닙니다.

## 측정 3 — 번들에서의 비용

런타임 외에 남은 비용은 번들입니다. 500KB 경고 글에서 로그인 청크에 딸려 온다고 했던 그 63.4KB예요. 지금 버전으로 다시 재 봤습니다.

| import 방식                     | 압축 전(min) | gzip   |
| ------------------------------- | ------------ | ------ |
| `import { z } from "zod"`       | 327.2KB      | 64.6KB |
| `import * as z from "zod/mini"` | 9.1KB        | 3.6KB  |

`zod`의 기본 API는 메서드 체이닝(`z.string().nullish()`) 방식이라, 어떤 메서드를 쓰는지와 관계없이 라이브러리 대부분이 번들에 들어옵니다. `zod/mini`는 같은 기능을 함수 조합(`z.nullish(z.string())`)으로 제공해서 쓴 만큼만 들어오고요.

다만 이번에는 바꾸지 않았습니다. 스키마 파일 전체의 문법을 바꿔야 하는 교체인데, 얻는 건 첫 방문 한 번의 61KB입니다. B2B 어드민이라 사용자 대부분이 재방문자이고, 배포가 없는 동안에는 이 코드를 캐시에서 읽습니다. 그리고 [지난 글](/posts/codebase-is-harness)에서 다룬 것처럼 이 코드베이스는 스키마 문법 자체가 팀과 AI가 공유하는 표준이라, 모든 type 파일을 수정하는 비용이 번들 61KB보다 크다고 판단했습니다. 로그인 폼처럼 검증이 단순한 화면에서 zod를 늦게 불러오는 쪽은 별도로 검토할 필요가 있습니다.

## 검증이 실패할 때의 비용

측정하면서 한 가지를 더 확인했습니다. ms 단위의 비용보다 실제 운영에서 더 크게 느껴졌던 건, 검증이 실패할 때 무엇이 멈추느냐였어요.

지난 8월 커밋 중에 이런 게 있습니다.

```diff title="chargerType.ts — fix: 고객사 계정 충전기 목록 진입 오류"
 export const chargerInfoSchema = z.object({
   uuid: z.string(),
   csms_charger_id: z.string(),
-  charger_model_id: z.number(),
+  // 고객사 응답은 내부 식별자를 내려주지 않는다
+  charger_model_id: z.number().nullish(),
```

고객사 계정으로 로그인하면 서버가 이 필드를 비워서 보내는데, 스키마는 숫자를 요구했습니다. 행 하나의 필드 하나가 어긋났을 뿐인데 `validateResponse`가 에러를 던지니 **충전기 목록 페이지 전체가 열리지 않았어요.** 응답 검증은 응답 단위로 전부 통과하거나 전부 실패합니다.

이걸 느슨하게 만들 방법도 있습니다. 필드마다 `.catch()`를 달면 어긋난 값을 기본값으로 바꾸고 넘어가요. 실제로 이 코드베이스에서도 요청 파라미터 쪽에는 그렇게 한 곳이 있습니다.

```ts title="stationType.ts (발췌)"
export const stationOrderBySchema = z.enum([/* ... */]).nullish().catch(null);
```

목록의 정렬 조건은 세션 스토리지에 저장 <small>url로 관리하지 않는 이유는... 요청이 있어서 입니다...</small> 되는데, 목록에서 없어진 정렬 조건이 저장된 채로 남아 있으면 서버가 422를 돌려주고 목록 전체가 실패합니다. 그래서 스키마에 없는 값이면 `null`로 바꿔서 보냅니다.

그래도 응답 쪽은 크게 실패하는 방식을 유지하기로 했습니다. 기준은 **어긋난 값이 누구의 것인가**입니다. 세션 스토리지에 남은 정렬 기준은 우리가 저장해 둔 값이 낡은 것이라, 버려도 문제가 없습니다. 반면 응답 필드가 명세와 다르다는 건 서버와 프론트 중 한쪽의 명세가 틀렸다는 뜻이에요. 이걸 기본값으로 바꾸면 [다음 버튼이 죽어 있던 글](/posts/silent-form-validation)에서 겪은 것처럼, 화면은 멀쩡해 보이는데 값이 틀린 상태가 됩니다. 위 사례도 에러가 크게 났기 때문에 `validateResponse`의 로그에 경로(`items[n].charger.charger_model_id`)가 찍혔고, 수정은 스키마 한 곳을 고치는 것으로 끝났습니다.

## 그래서 정한 것

1. **Zod 응답 검증은 유지한다.** 실제 최대 페이지 크기(100행)에서 검증 자체의 비용은 1ms 안팎이고, 첫 호출의 준비 비용을 더해도 수 ms입니다. 이 비용으로 명세 어긋남을 위치까지 포함해 바로 알 수 있습니다.
2. **transform 안에서는 무거운 작업을 하지 않는다.** transform은 "행 수 × 필드 수"만큼 실행되는 곳입니다. 포맷터나 정규식처럼 준비 비용이 있는 객체는 모듈 스코프에서 한 번 만든다. 이번 140ms는 검증이 아니라 이 규칙이 없어서 생긴 비용이었습니다.
3. **응답은 크게 실패하고, 우리가 저장한 값은 조용히 복구한다.** 응답 스키마에는 `.catch()`를 쓰지 않고, 세션 스토리지처럼 우리가 저장했다가 낡을 수 있는 값에만 쓴다.
4. **`zod/mini` 교체는 보류한다.** 첫 방문 61KB보다 스키마 문법 전체를 바꾸는 비용이 크다고 판단했고, 첫 화면 경로에서 zod를 늦게 불러오는 쪽을 먼저 검토한다.

## 마무리

모든 API 응답을 Zod로 검증하는 어드민에서 목록 100행 파싱에 최대 140ms가 걸리고 있었습니다. 런타임 검증의 비용이라고 생각했지만, 검증과 변환을 나눠 재 보니 Zod가 쓴 시간은 1.4ms였고 나머지 99%는 transform 안의 날짜 포맷 함수가 날짜 하나마다 `Intl` 포맷터를 다섯 번씩 새로 만드는 데 쓰고 있었습니다. 포맷터를 한 번만 만들도록 바꾸자 같은 파싱이 5.2ms가 됐고, 출력은 7만여 개 시각에서 한 글자도 달라지지 않았습니다.

그래서 검증은 유지하고, transform에 들어가는 코드의 규칙을 하나 추가했습니다. 번들 61KB는 확인했지만 이번에는 교체하지 않았고요. 결국 이번에 배운 건 Zod에 대한 것보다 측정 방법에 대한 것에 가깝습니다. **"검증은 비싸다"는 가정은 검증과 그 안에서 실행되는 코드를 나눠 재기 전까지 확인할 수 없었습니다.**

---

> 같이 읽으면 좋은 글
>
> - [다음 버튼이 죽어 있던 이유](/posts/silent-form-validation) — 스키마와 UI가 어긋났을 때 조용히 실패하던 폼
> - [lint로 못 잡는 코딩 컨벤션, 코드 구조로 강제하기](/posts/factory-in-react) — 모든 응답이 지나가는 `validateResponse`
> - [Vite 빌드의 chunks are larger than 500 kB 경고, manualChunks로 쪼개면 빨라질까?](/posts/entry-chunk-500kb) — 로그인 청크의 zod 63.4KB
