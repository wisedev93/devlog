---
author: seulgi um
pubDatetime: 2026-05-27T12:00:00+09:00
title: "카카오톡으로 열면 깨지는 신청 폼, 인앱 브라우저 대응 3단계"
featured: true
draft: false
tags:
  - frontend
  - ux
  - mobile
  - browser
  - graceful degradation
  - SSoT
description: "카카오톡·인스타 인앱 브라우저에서 사진 업로드와 봇 방지가 조용히 깨졌다. File.type이 비는 문제는 확장자 폴백으로, Turnstile 차단은 접수 후 표시 방식으로 받아내고, 마지막으로 사용자를 기본 브라우저로 빼주는 오버레이까지 깔았다. 한국에서 모바일 폼을 만들면 피할 수 없는 문제라 정리해둔다."
---

신청 폼을 다 만들고 실제 폰에서 테스트하다가 이상한 걸 발견했습니다. 카카오톡으로 링크를 받아 열면 사진 업로드가 안 됩니다. 정확히는 사진을 골랐는데 "지원하지 않는 형식입니다"라는 에러가 떠요. 같은 사진을 Chrome에서 고르면 멀쩡하고요.

범인은 사진이 아니라 인앱 브라우저였습니다. 이 글은 카카오톡이나 인스타그램 같은 인앱 브라우저에서 신청 폼이 어떻게 깨지는지, 그걸 세 겹으로 어떻게 막았는지에 대한 기록입니다. 한국에서 모바일 웹을 만들면 거의 반드시 만나는 문제라, 비슷한 폼을 만들 누군가를 위해 적어둡니다.

## Table of contents

## 인앱 브라우저가 뭐가 다른가

인앱 브라우저는 카카오톡, 인스타그램, 네이버 앱 등이 앱 안에 내장한 웹뷰입니다. 채팅방의 링크를 누르면 Chrome이나 Safari가 아니라 그 앱 안에서 페이지가 열려요.

겉보기엔 일반 브라우저 같지만 실제로는 다릅니다. WebView 기반이라 OS 기본 브라우저와 엔진이나 설정이 다를 수 있고, 파일 선택·클립보드·외부 스크립트 같은 일부 Web API가 제한되거나 다르게 동작합니다. 광고차단이나 트래킹 방지 정책도 앱마다 제각각이고, 앱이 업데이트되면 웹뷰도 같이 바뀌기 때문에 개발자가 버전을 특정할 수도 없어요.

문제는 한국 트래픽의 상당 부분이 인앱 브라우저를 거친다는 점입니다. 카카오톡 링크 공유가 가장 흔한 유입 경로니까요. "Chrome에서 잘 되니까 됐다"가 통하지 않습니다.

우리 신청 폼에서 인앱 브라우저가 깨뜨린 지점은 두 곳이었습니다. 사진 업로드와 봇 방지(Turnstile).

## 증상 1: File.type이 비어서 사진이 막힌다

사진 업로드 검증은 평범하게 짜여 있었습니다. `<input type="file">`이 준 `File` 객체의 `type`(MIME)을 보고 JPG/PNG인지 판별합니다.

```ts
if (file.type === "image/png") return "png";
if (file.type === "image/jpeg") return "jpg";
return null; // 지원하지 않는 형식
```

데스크탑 Chrome에서는 잘 동작합니다. 그런데 일부 인앱 브라우저(특히 카카오톡, 네이버)는 파일을 선택했을 때 `File.type`을 빈 문자열이나 `application/octet-stream`으로 넘깁니다. 멀쩡한 JPG인데도요.

그러면 위 코드는 `return null`로 떨어지고, 사용자는 자기 사진이 멀쩡한데도 "지원하지 않는 형식입니다"를 봅니다. 본인이 뭘 잘못했는지 알 방법이 없어요.

`File.type`이 비는 건 인앱 웹뷰가 파일의 MIME을 추론하지 못했기 때문입니다. 다행히 다른 단서가 있습니다. 파일 이름이요. `photo.jpg`의 확장자는 인앱 브라우저든 아니든 그대로 넘어옵니다.

그래서 판별 함수를 고쳤습니다. MIME이 멀쩡하면 MIME을 믿고, MIME이 비었을 때만 확장자로 폴백합니다.

```ts title="lib/constants.ts"
export function resolvePhotoKind(
  type: string | undefined | null,
  name: string | undefined | null,
): "jpg" | "png" | null {
  const t = (type ?? "").toLowerCase().trim();
  if (t === "image/png") return "png";
  if (t === "image/jpeg" || t === "image/jpg") return "jpg";

  // MIME 누락(인앱 브라우저) → 확장자로 판별
  if (t === "" || t === "application/octet-stream") {
    const ext = (name ?? "").toLowerCase().split(".").pop() ?? "";
    if (ext === "png") return "png";
    if (ext === "jpg" || ext === "jpeg") return "jpg";
  }
  return null;
}
```

판별 우선순위를 정리하면 이렇습니다.

| `File.type`                | 판별 근거     | 결과            |
| -------------------------- | ------------- | --------------- |
| `image/png` / `image/jpeg` | MIME          | 그대로 신뢰     |
| `""` (빈 문자열)           | 파일명 확장자 | 폴백 판별       |
| `application/octet-stream` | 파일명 확장자 | 폴백 판별       |
| 그 외 (`image/gif` 등)     | MIME          | `null` — 미지원 |

확장자 폴백이 MIME만큼 엄밀하지 않은 건 사실입니다. `.txt`를 `.jpg`로 바꿔치기하면 통과해요. 하지만 그건 서버에서 한 번 더 잡으면 되는 문제입니다. 클라이언트 검증의 목적은 악의적 우회를 100% 막는 게 아니라 선의의 사용자가 멀쩡한 사진으로 막히지 않게 하는 것이고, 인앱 브라우저 사용자는 명백히 후자니까요.

여기서 얻은 교훈은 `File.type`을 유일한 판단 근거로 두지 말라는 것입니다. 데스크탑에서만 테스트하면 절대 알 수 없는 유형의 문제였어요.

## 증상 2: Turnstile 스크립트가 차단된다

두 번째 증상은 더 까다로웠습니다. 봇 방지로 Cloudflare Turnstile을 폼 마지막 단계에 붙였는데, 일부 인앱 브라우저나 광고차단 환경에서는 Turnstile 스크립트 자체가 로드되지 않습니다.

```ts title="components/apply/TurnstileWidget.tsx"
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
```

이 외부 스크립트가 막히면 위젯이 안 뜨고, 위젯이 없으니 토큰도 못 받습니다. 토큰이 없으면 원래 설계대로라면 서버가 신청을 거부해요.

여기서 멈춰서 생각해봤습니다. Turnstile이 안 떴다는 게 이 사용자가 봇이라는 뜻인가? 아닙니다. 대부분은 카카오톡으로 링크를 받아 들어온 평범한 사용자예요. 봇을 막으려고 깐 장치가 봇이 아닌 진짜 신청자를 막고 있었던 겁니다. 그것도 사용자는 영문도 모른 채로요.

보안과 UX가 충돌하는 전형적인 지점이고, 저는 graceful degradation으로 풀기로 했습니다. Turnstile을 못 쓰는 환경이면 신청을 막는 대신 통과시키되 표시를 남기는 거예요.

### 클라이언트는 "사용 불가"를 감지한다

`TurnstileWidget`은 스크립트 로드 실패와 시간 초과를 모두 "사용 불가"로 잡습니다.

```ts title="components/apply/TurnstileWidget.tsx"
/** 토큰을 한 번도 못 받으면 "사용 불가"로 간주하기까지의 대기 시간 */
const UNAVAILABLE_TIMEOUT_MS = 12000;

// 일정 시간 안에 토큰을 못 받으면 사용 불가로 간주
const timer = window.setTimeout(markUnavailable, UNAVAILABLE_TIMEOUT_MS);

ensureScript()
  .then(() => { /* ...turnstile.render() */ })
  .catch(() => {
    // 스크립트 로드 실패 (인앱 브라우저/광고차단 등) → 사용 불가 처리
    markUnavailable();
  });
```

스크립트 로드가 실패하면 즉시, 로드는 됐지만 12초 안에 토큰을 못 받으면 타임아웃으로, 어느 쪽이든 부모 컴포넌트에 `onUnavailable`을 알립니다. 부모는 그걸 받아 사용자에게 안내해요.

```tsx title="components/apply/ApplyForm.tsx"
{turnstileUnavailable && (
  <p className="text-center text-[12px] ...">
    봇 방지 확인을 불러오지 못했어요.
    <br />
    그대로 제출하셔도 정상적으로 접수됩니다.
  </p>
)}
```

확인을 불러오지 못했다는 사실을 숨기지 않으면서, 그대로 제출해도 된다는 안심을 같이 줍니다. 사용자가 막힌 게 아니라는 걸 알리는 게 목적이에요.

### 서버는 거부하지 않고 표시한다

클라이언트는 제출할 때 `turnstileUnavailable: true` 플래그를 같이 보내고, 서버는 토큰이 없을 때 이 플래그를 보고 분기합니다.

```ts title="app/api/apply/route.ts"
let turnstileVerified = false;
if (!turnstileToken && turnstileUnavailable) {
  // 인앱 브라우저·광고차단 등으로 Turnstile 을 아예 못 불러온 경우.
  // 접수를 막지 않고 turnstile_verified=false 로 표기 → 운영자가 더 꼼꼼히 검토.
  turnstileVerified = false;
} else {
  const tsResult = await verifyTurnstileToken(turnstileToken);
  if (!tsResult.ok) {
    return badRequest(`봇 방지 확인에 실패했어요. (${tsResult.reason ?? "unknown"})`);
  }
  turnstileVerified = !tsResult.skipped;
}
```

| 상황                           | 서버 처리            | `turnstile_verified` |
| ------------------------------ | -------------------- | -------------------- |
| 토큰 있음 · 검증 성공          | 접수                 | `true`               |
| 토큰 있음 · 검증 실패          | **거부**             | —                    |
| 토큰 없음 · `unavailable=true` | 접수 (단, 표시 남김) | `false`              |

검증에 실패한 토큰은 여전히 거부합니다. 진짜 봇이 가짜 토큰을 보낸 경우니까요. 하지만 토큰이 아예 없고 클라이언트가 "못 불러왔다"고 말하면, 그건 거부 대상이 아니라 검토 강도를 높일 신호로 다룹니다. `turnstile_verified` 컬럼이 `false`로 남고, 운영자는 그 신청서를 좀 더 꼼꼼히 봅니다.

이 절충이 성립하는 건 이 서비스가 운영자가 모든 신청을 직접 검토하는 구조이기 때문입니다. 자동 가입처럼 사람이 안 보는 흐름이라면 rate limit이나 서버측 행동 분석 같은 다른 방어선이 더 필요해요. graceful degradation은 검증을 포기하는 게 아니라, 느슨해진 검증의 책임을 받아낼 다음 단계가 있을 때 성립하는 방식입니다.

## 가장 확실한 처방, 외부 브라우저로 빼기

증상 1과 2를 각각 막긴 했지만, 인앱 브라우저가 다음에 또 어디서 무엇을 깨뜨릴지는 알 수 없습니다. 웹뷰는 앱 업데이트마다 바뀌니까요. 그래서 가장 확실한 처방을 하나 더 깔았습니다. 사용자를 아예 기본 브라우저(Chrome, Safari)로 빼주는 것.

인앱 브라우저로 들어온 게 감지되면 오버레이를 띄워서, 탭 한 번으로 같은 페이지를 기본 브라우저에서 다시 열도록 유도합니다.

### 어떤 인앱 브라우저인지 감지

`navigator.userAgent`로 판별합니다. UA 스니핑은 일반적으로 권장되지 않지만, 인앱 브라우저 식별만큼은 UA 말고는 답이 없는 영역이라고 판단했습니다.

```ts title="components/apply/InAppBrowserNotice.tsx"
function detect(): Detected {
  const s = navigator.userAgent.toLowerCase();

  const os = /iphone|ipad|ipod/.test(s) ? "ios"
    : /android/.test(s) ? "android" : "other";

  let app = "", isKakao = false;
  if (s.includes("kakaotalk"))            { app = "카카오톡"; isKakao = true; }
  else if (s.includes("naver(inapp"))     { app = "네이버 앱"; }
  else if (s.includes("daumapps"))        { app = "다음 앱"; }
  else if (s.includes("instagram"))       { app = "인스타그램"; }
  else if (s.includes("fban") || s.includes("fbav") || s.includes("fb_iab")) { app = "페이스북"; }
  else if (/\bline\//.test(s))            { app = "라인"; }

  return { app, isKakao, os };
}
```

`app`이 빈 문자열이면 인앱 브라우저가 아니라고 보고 오버레이를 안 띄웁니다. 일반 Chrome, Safari 사용자는 이 컴포넌트의 존재조차 모르고 지나가요.

### 외부 브라우저로 여는 방법은 OS와 앱마다 다르다

여기가 까다로운 부분입니다. "기본 브라우저로 열기"를 실행하는 방법이 환경마다 전부 달라요.

| 환경                    | 방법                                                     |
| ----------------------- | -------------------------------------------------------- |
| 카카오톡 (iOS/Android)  | `kakaotalk://web/openExternal?url=...` 스킴              |
| 안드로이드 (그 외 인앱) | `intent://...#Intent;...;package=com.android.chrome;end` |
| iOS (그 외 인앱)        | 강제 탈출 스킴 없음 → 메뉴 안내 + 주소 복사              |

```ts title="components/apply/InAppBrowserNotice.tsx"
function openExternal() {
  if (info.isKakao) {
    // 카카오톡은 전용 스킴을 제공한다 — 가장 확실
    window.location.href =
      "kakaotalk://web/openExternal?url=" + encodeURIComponent(currentUrl);
    return;
  }
  if (info.os === "android") {
    // 안드로이드는 intent 스킴으로 Chrome 을 지정해 연다
    const u = new URL(currentUrl);
    window.location.href =
      `intent://${u.host}${u.pathname}${u.search}` +
      `#Intent;scheme=https;package=com.android.chrome;end`;
  }
}
```

카카오톡은 `openExternal`이라는 전용 스킴이 있어서 제일 깔끔합니다. 안드로이드는 `intent://` 스킴으로 패키지를 지정해 열 수 있고요.

문제는 카카오톡이 아닌 iOS 인앱 브라우저입니다. iOS에는 "이 URL을 다른 앱에서 열어라"를 강제하는 표준 스킴이 없어요. 자동화가 불가능한 지점이라, 사람이 직접 하도록 안내합니다.

```ts title="components/apply/InAppBrowserNotice.tsx"
const menuGuide = info.os === "ios"
  ? "화면 메뉴 버튼(··· 또는 공유 아이콘) → 'Safari로 열기'를 눌러주세요."
  : "화면 메뉴 버튼(··· 또는 ⋮) → '다른 브라우저로 열기'를 눌러주세요.";
```

### 최후의 수단: 주소 복사

스킴이 동작하지 않거나(앱이나 OS 버전에 따라 막히기도 합니다) 메뉴 안내도 안 통할 때를 위해, 현재 URL을 복사하는 버튼을 마지막에 둡니다.

```ts title="components/apply/InAppBrowserNotice.tsx"
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  } catch {
    setCopied(false);
  }
}
```

주소를 복사해서 브라우저 주소창에 직접 붙여넣으면 어떤 인앱 브라우저에서든 탈출할 수 있습니다. 가장 투박하지만 가장 확실한 길이에요.

정리하면 외부 브라우저 유도는 확실한 순서대로 쌓은 폴백 사다리입니다.

```
전용 스킴 (카카오톡)
   └─ 실패 시 → intent 스킴 (안드로이드)
        └─ 불가능 시 → 메뉴 안내 (iOS)
             └─ 그래도 안 되면 → 주소 복사 (모든 환경)
```

위로 갈수록 매끄럽고 아래로 갈수록 확실합니다. 한 단계가 막혀도 다음 단계가 받아요.

## "이대로 진행"을 남겨두는 이유

오버레이에는 버튼이 하나 더 있습니다. "이대로 이 화면에서 진행할게요."

```tsx title="components/apply/InAppBrowserNotice.tsx"
<button onClick={() => setDismissed(true)}>
  이대로 이 화면에서 진행할게요
</button>
```

기껏 외부 브라우저로 빼주려 해놓고 그대로 진행하는 길을 열어두는 게 모순처럼 보일 수 있는데, 의도된 설계입니다. 이유는 두 가지예요.

첫 번째. 오버레이를 닫을 수 없게 만들면, 모든 폴백이 실패한 사용자는 완전히 갇힙니다. iOS 인앱 브라우저에서 스킴도 안 먹고 메뉴도 못 찾고 복사도 실패한 사용자가 있다면 그 사람은 신청 자체를 못 해요. 강제 오버레이는 최악의 경우에 이탈을 만듭니다.

두 번째가 더 중요한데, 폼 자체가 이미 인앱 브라우저에서 동작하도록 보강되어 있다는 점입니다. 확장자 폴백(증상 1)과 Turnstile degradation(증상 2)을 앞에서 막아뒀으니, 인앱 브라우저에서 "이대로 진행"을 눌러도 신청은 대체로 정상 완료됩니다.

외부 브라우저 유도는 최선의 경로고, 폼 보강은 최악을 위한 보험입니다. 오버레이만 믿으면 유도가 실패한 순간 끝이고, 폼 보강만 믿으면 인앱 브라우저의 다음 변경에 또 당합니다. 두 겹이라서 "이대로 진행"을 안심하고 열어둘 수 있는 거예요.

## 성능이 아니라 퍼널을 측정한다

이 작업은 앞선 업로드 최적화와 달리 성능 측정의 대상이 아닙니다. 빨라지고 말고 할 게 없으니까요. 대신 봐야 할 건 퍼널입니다. 인앱 브라우저 사용자가 실제로 신청까지 도달하는가?

이벤트를 몇 개 심어두면 데이터가 쌓입니다.

| 이벤트                | 찍는 시점                      | 알 수 있는 것               |
| --------------------- | ------------------------------ | --------------------------- |
| `inapp_detected`      | `detect()` 가 인앱을 잡았을 때 | 전체 중 인앱 유입 비율      |
| `inapp_open_external` | "기본 브라우저로 열기" 탭      | 유도 버튼이 실제로 먹히는가 |
| `inapp_dismissed`     | "이대로 진행" 탭               | 폼 보강에 의존하는 비율     |
| `apply_submitted`     | 신청 제출 성공                 | 최종 전환                   |

`inapp_detected`에서 `apply_submitted`까지의 비율을 비인앱 사용자의 전환율과 비교하면 인앱 대응이 충분한지 보입니다. 격차가 크면 어느 단계에서 새는지도 위 이벤트로 좁혀 들어갈 수 있고요.

그리고 무엇보다 실기기 테스트가 중요합니다. 카카오톡으로 자기 폰에 링크를 보내 직접 열어보는 것, iOS와 안드로이드 양쪽에서 해보는 것. DevTools의 커스텀 User-Agent로 `detect()` 로직 자체는 확인할 수 있지만, 스킴이 실제로 먹히는지는 진짜 앱에서만 알 수 있습니다.

## 모바일 폼을 만들 때 확인할 것들

- `File.type`(MIME)에만 의존해 파일 형식을 검증하고 있지 않은가? 비었을 때 확장자 폴백이 있는가?
- 외부 스크립트(봇 방지, 결제, 분석 등)가 차단됐을 때 폼이 거부되는가, degrade되는가?
- degrade시킨다면 그 느슨해진 검증의 책임을 받아낼 다음 단계(운영자 검토 등)가 있는가?
- 인앱 브라우저를 감지하는가? 감지 후 기본 브라우저로 빼주는 길이 있는가?
- 그 유도가 실패해도(특히 iOS) 폼 자체가 인앱 환경에서 동작하는가?
- 강제 오버레이로 사용자를 가둘 위험은 없는가?
- 실기기에서 카카오톡, iOS, 안드로이드를 직접 테스트했는가?

## 마무리

인앱 브라우저는 한국 모바일 웹에서 피할 수 없는 환경이고, 데스크탑 테스트로는 알 수 없는 방식으로 폼을 깨뜨립니다. 이번에 만난 두 증상(`File.type` 누락, 외부 스크립트 차단)을 막은 방법은 결국 같은 원리였어요. 하나의 신호를 유일한 판단 근거로 믿지 말 것. MIME이 안 되면 확장자로, Turnstile이 안 되면 운영자 검토로 폴백합니다. 그리고 유도(최선의 경로)와 폼 보강(최악의 바닥)을 둘 다 깔아야 안심할 수 있습니다.

인앱 브라우저 대응은 화려한 작업이 아닙니다. 보여줄 그래프도 없고, 대부분의 사용자는 이 코드가 돌았다는 것조차 모릅니다. 하지만 카카오톡으로 링크를 받은 누군가가 막힘 없이 신청을 끝냈다면, 그 보이지 않는 성공이 이 글의 전부입니다.
