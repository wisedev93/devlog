---
author: seulgi um
pubDatetime: 2026-05-28T12:00:00+09:00
title: "Vercel의 4.5MB 한도에 막힌 사진 업로드, Storage 직접 업로드로 우회하기"
featured: true
draft: false
tags:
  - frontend
  - nextjs
  - supabase
  - serverless
  - performance
description: "신청 폼의 사진 업로드가 Vercel 함수의 본문 한도(4.5MB)에 막혀 413을 뱉었다. 서명 업로드 URL로 브라우저가 Supabase Storage에 직접 올리도록 파이프라인을 다시 짜고, 그 과정에서 새로 생긴 보안 빈틈을 메우고, 병렬 업로드와 after()로 응답 시간을 줄인 기록."
---

신청 폼의 마지막 단계는 사진 업로드입니다. 기본 사진 1\~3장, 옵션 사진 0\~1장, 장당 최대 10MB까지 허용했어요. 로컬에서는 잘 됐습니다. 그런데 배포한 뒤 실제 기기에서 사진 몇 장을 골라 제출하니 요청이 그냥 실패했습니다. 응답 코드는 `413`.

이 글은 그 `413`에서 출발해서 사진 업로드 파이프라인을 어떻게 다시 그렸는지에 대한 이야기입니다. 처음엔 "한도를 늘리면 되겠지"라고 생각했는데, 실제로 한 일은 사진을 서버 함수에 아예 통과시키지 않는 것이었어요. 그 과정에서 보안 빈틈 하나를 새로 만들었고, 그걸 메우고, 마지막으로 응답 시간을 깎았습니다.

> 이 글의 '순차 vs 병렬' 비교는 [/labs/upload-timeline](/labs/upload-timeline)에서 직접 만져볼 수 있어요. 핸드셰이크와 전송을 슬라이더로 따로 조절하면 병렬화의 단축 배수가 1배에서 N배 사이를 오가는 게 보입니다.

## Table of contents

## Vercel 함수의 본문 한도

처음 구조는 평범했습니다. 신청 폼이 `FormData`에 텍스트 필드와 사진 `File`들을 한꺼번에 담아 `POST /api/apply`로 보내고, 서버 함수가 그걸 받아서 검증하고 Storage에 올리고 DB에 insert합니다.

```ts title="app/api/apply/route.ts (수정 전)"
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const payloadRaw = formData.get("payload");
  const photos = formData.getAll("photos").filter((f) => f instanceof File);
  const optionPhoto = formData.getAll("optionPhoto").filter((f) => f instanceof File);
  // ...검증 후 서버에서 Storage로 업로드
}
```

코드만 보면 문제가 없습니다. 문제는 코드 바깥의 실행 환경에 있었어요.

> Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한됩니다. 공식 문서에 명시된 한도이고, 코드로 늘릴 수 있는 값이 아닙니다.

우리 폼은 사진을 장당 10MB까지 허용하니까 기본 3장 + 옵션 1장이면 최대 40MB, 한도의 거의 아홉 배입니다. 요즘 스마트폰으로 찍은 사진 몇 장이면 한도를 가뿐히 넘어요. 본문이 한도를 넘는 순간 함수 코드는 실행되기도 전에 게이트웨이에서 잘리고, 클라이언트는 `413 Content Too Large`만 받습니다.

선택지를 정리해봤습니다.

| 선택지                          | 가능한가          | 평가                              |
| ------------------------------- | ----------------- | --------------------------------- |
| 함수 본문 한도를 늘린다         | ✕ (플랫폼 고정값) | 불가능                            |
| 클라이언트에서 사진을 압축한다  | △                 | 페이로드를 줄일 뿐, 한도는 그대로 |
| 사진을 함수에 통과시키지 않는다 | ✓                 | 한도와 무관해짐                   |

압축은 페이로드를 작게 만들 뿐 한도 자체를 없애지는 못합니다. 사용자가 10장을 고르거나 원본 화질을 고집하면 또 막혀요. 남는 답은 마지막 줄, 사진이라는 큰 페이로드를 서버 함수의 경로에서 빼는 것이었습니다.

## 브라우저가 Storage로 직접 올리도록

핵심 아이디어는 이렇습니다. 사진은 어차피 Supabase Storage로 갑니다. 그렇다면 굳이 Vercel 함수를 중간에 거칠 이유가 없어요. 브라우저가 Storage로 직접 올리면 4.5MB 한도는 우리 함수와 무관한 이야기가 됩니다.

문제는 인가입니다. Storage 버킷에는 RLS가 켜져 있고, 아무 브라우저나 마음대로 쓰게 둘 수는 없습니다. 여기서 쓰는 게 서명 업로드 URL(signed upload URL)입니다.

3단계로 흐름을 정리하면

1. 브라우저가 서버에 "사진 N장 올릴 건데 자리 좀 잡아줘"라고 요청하면 서버가 업로드용 티켓(경로 + 토큰)을 발급
2. 브라우저가 그 티켓으로 Storage에 직접 업로드 (Vercel 함수를 안 거침)
3. 브라우저가 서버에 "다 올렸어, 신청서 텍스트는 이거야"라고 JSON만 전송하면 서버가 DB insert

원본 사진이 지나는 길에서 Vercel 함수가 빠졌습니다. 함수는 이제 작은 JSON만 두 번 주고받아요.

### 1단계: 서명 업로드 URL 발급

티켓 발급만 담당하는 라우트를 따로 만들었습니다.

```ts title="app/api/apply/upload-urls/route.ts"
export async function POST(req: Request) {
  const { photos, optionPhoto } = await req.json(); // 확장자 배열만 받음

  // 검증: 장수 한도
  // ...

  const applicationId = randomUUID();
  const supabase = supabaseAdmin();

  async function ticketsFor(exts: Ext[], prefix: "photo" | "option") {
    const tickets: { path: string; token: string }[] = [];
    for (let i = 0; i < exts.length; i++) {
      const path = `${applicationId}/${prefix}-${i + 1}.${exts[i]}`;
      const { data, error } = await supabase.storage
        .from(APPLICANT_PHOTOS_BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("no data");
      tickets.push({ path: data.path, token: data.token });
    }
    return tickets;
  }

  const photoTickets = await ticketsFor(photoExts, "photo");
  const optionTickets = await ticketsFor(optionExts, "option");
  return NextResponse.json({ ok: true, applicationId, photos: photoTickets, optionPhoto: optionTickets });
}
```

이 요청의 본문은 `["jpg", "png"]` 같은 확장자 배열뿐입니다. 몇 바이트짜리 JSON이라 4.5MB와는 영원히 무관해요.

여기서 두 가지를 서버가 미리 못 박는다는 점이 중요합니다.

`applicationId`는 신청 한 건의 식별자를 업로드 전에 정한 것입니다. 사진 경로도, 나중에 들어갈 DB row의 PK도 모두 이 UUID를 씁니다. 그리고 경로(path)는 `<applicationId>/photo-1.jpg`처럼 서버가 정해서 발급합니다. 클라이언트가 파일 이름을 마음대로 정하지 못해요. 이게 뒤에서 보안 빈틈을 메울 때 결정적인 역할을 합니다.

`createSignedUploadUrl(path)`가 돌려주는 `token`은 그 경로 한 곳에만 업로드를 허용하는 일회용 토큰입니다.

### 2단계: 브라우저에서 Storage로 직접

브라우저에는 anon 키로 만든 Supabase 클라이언트를 둡니다.

```ts title="lib/supabase/browser.ts"
// 용도는 단 하나 — 서명 업로드 URL 로 사진을 Storage에 직접 올리는 것.
// 서명 업로드는 토큰으로 인가되므로 anon 키로도 동작하고,
// 버킷에 RLS가 켜져 있어 일반 조회/쓰기는 여전히 불가능하다.
export function supabaseBrowser(): SupabaseClient { /* ... */ }
```

anon 키가 노출되는 게 불안할 수 있는데, anon 키는 원래 RLS 정책과 함께라면 공개되어도 되는 값입니다. 실제 인가는 서명 토큰이 하고, 버킷 RLS 때문에 토큰 없는 조회나 쓰기는 막혀 있어요. 토큰은 우리 서버만 발급하고요.

업로드는 `uploadToSignedUrl`을 씁니다.

```ts title="components/apply/ApplyForm.tsx"
const supabase = supabaseBrowser();
const uploadOne = async (item: { path: string; token: string }, file: File, kind: "jpg" | "png") => {
  const { error } = await supabase.storage
    .from(APPLICANT_PHOTOS_BUCKET)
    .uploadToSignedUrl(item.path, item.token, file, {
      contentType: photoKindToContentType(kind),
    });
  if (error) throw error;
};
```

이 `PUT` 요청은 `vercel.app`이 아니라 `*.supabase.co`로 직접 갑니다. 우리 함수의 본문 한도와는 완전히 다른 경로예요.

### 3단계: 텍스트만 따로 제출

사진이 다 올라간 뒤, 신청서 텍스트 필드는 별도 JSON으로 보냅니다. 이때 사진은 파일이 아니라 경로 문자열로만 전달됩니다.

```ts title="components/apply/ApplyForm.tsx"
const res = await fetch("/api/apply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    payload: data,                          // 신청서 텍스트 필드
    applicationId: ticket.applicationId,
    photoPaths: photoTickets.map((t) => t.path),
    optionPhotoPaths: optionTickets.map((t) => t.path),
    agreed: data.agreed,
    turnstileToken,
    turnstileUnavailable,
  }),
});
```

`/api/apply`가 받는 본문은 이제 텍스트와 경로 몇 줄입니다. 사진이 아무리 커져도 이 JSON은 늘 작아요. 사진을 4.5MB 한도가 구조적으로 무관한 곳으로 옮긴 겁니다.

## 직접 업로드가 새로 만든 빈틈, 그리고 두 개의 자물쇠

여기서 멈추면 안 됩니다. 직접 업로드는 한도 문제를 풀었지만 동시에 빈틈 하나를 새로 만들었어요.

수정 전에는 서버 함수가 사진 `File`을 직접 손에 쥐고 있었습니다. 무엇을 어디에 올릴지 100% 서버가 알았어요. 수정 후에는 `/api/apply`가 사진의 경로 문자열을 클라이언트한테서 받습니다. 그리고 클라이언트가 보내는 값은 당연히 신뢰할 수 없습니다.

악의적인 클라이언트가 할 수 있는 일을 적어보면, 남의 `applicationId` 폴더를 가리키는 경로를 끼워 넣어 다른 사람 사진을 자기 신청서에 붙이거나, 사진을 실제로 안 올려놓고 경로만 그럴듯하게 지어내 사진 없는 신청서를 통과시키는 것.

그래서 자물쇠를 두 개 채웠습니다.

### 첫 번째 자물쇠: 경로 형태 검증

경로는 반드시 `<이번 요청의 applicationId>/<photo|option>-<숫자>.(jpg|png)` 형태여야 합니다. 한 글자라도 어긋나면 거부합니다.

```ts title="app/api/apply/route.ts"
function validatePaths(raw, prefix, min, max, appId): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < min || raw.length > max) return null;
  const fileRe = new RegExp(`^${prefix}-\\d+\\.(jpg|png)$`);
  const out: string[] = [];
  for (const p of raw) {
    if (typeof p !== "string") return null;
    if (!p.startsWith(`${appId}/`)) return null;       // ← 남의 폴더 차단
    const name = p.slice(appId.length + 1);
    if (!fileRe.test(name)) return null;               // ← 임의 파일명 차단
    out.push(p);
  }
  return out;
}
```

`p.startsWith(`${appId}/`)`가 "남의 폴더 가리키기"를 막습니다. 검증 기준이 되는 `appId`는 같은 요청에 들어온 값이라 클라이언트가 만질 수 있는 건 자기 자신의 폴더뿐이고, 그 폴더에 무언가를 올리려면 1단계에서 우리 서버가 발급한 서명 토큰이 있었어야 합니다.

### 두 번째 자물쇠: 실제로 존재하는지 확인

경로 형태가 맞다고 파일이 진짜로 존재하는 건 아닙니다. 그래서 insert 전에 Storage를 실제로 조회합니다.

```ts title="app/api/apply/route.ts"
const listed = await supabase.storage.from(APPLICANT_PHOTOS_BUCKET).list(applicationId);
const present = new Set((listed.data ?? []).map((o) => o.name));
for (const p of [...photos, ...optionPhoto]) {
  const name = p.slice(applicationId.length + 1);
  if (!present.has(name)) {
    return badRequest("사진 업로드가 완료되지 않았어요. 다시 시도해주세요.");
  }
}
```

이건 보안 장치이기도 하지만 사실 흔한 사고를 막는 보험에 더 가깝습니다. 2단계 업로드가 일부만 성공했는데 3단계가 그냥 진행되면, 사진 경로는 DB에 적혔는데 실제 파일은 없는 신청서가 만들어져요. 운영자가 그걸 열면 깨진 이미지를 보게 됩니다. 확인 한 번이 그 상태를 처음부터 거릅니다.

> 직접 업로드로 전환할 때 자주 빠뜨리는 게 이 부분입니다. "함수를 우회한다"는 성능·구조 이야기에 집중하다 보면 신뢰 경계(trust boundary)가 이동했다는 사실을 놓쳐요. 파일을 쥐고 있던 서버가 이제는 파일에 대한 "주장"을 전달받는 서버가 됐습니다. 주장은 검증해야 합니다.

## 순차 업로드를 Promise.all로

구조를 바꾼 직후, 2단계 업로드 코드는 이렇게 생겼었습니다.

```ts title="components/apply/ApplyForm.tsx (개선 전)"
for (let i = 0; i < photos.length; i++) {
  await uploadOne(photoTickets[i], photos[i], photoExts[i]);
}
for (let i = 0; i < optionPhoto.length; i++) {
  await uploadOne(optionTickets[i], optionPhoto[i], optionExts[i]);
}
```

사진을 한 장씩 올립니다. 1번이 끝나야 2번이 시작돼요. 사진들끼리는 서로 의존이 전혀 없는데도요.

```diff title="components/apply/ApplyForm.tsx"
- for (let i = 0; i < photos.length; i++) {
-   await uploadOne(photoTickets[i], photos[i], photoExts[i]);
- }
- for (let i = 0; i < optionPhoto.length; i++) {
-   await uploadOne(optionTickets[i], optionPhoto[i], optionExts[i]);
- }
+ // 모든 사진을 동시에 업로드한다.
+ await Promise.all([
+   ...photos.map((file, i) => uploadOne(photoTickets[i], file, photoExts[i])),
+   ...optionPhoto.map((file, i) => uploadOne(optionTickets[i], file, optionExts[i])),
+ ]);
```

여기서 미리 적어둘 게 있습니다. `Promise.all`을 통해 병렬화했다고 업로드가 장수만큼 빨라지지는 않습니다.

업로드 한 장에 드는 시간은 크게 두 덩어리입니다. 연결을 만드는 고정 비용(DNS, TLS 핸드셰이크, 요청 왕복 지연)과, 바이트를 실제로 밀어 올리는 전송 시간. 병렬화가 확실히 줄여주는 건 앞쪽입니다. 4장의 핸드셰이크가 차곡차곡 쌓이지 않고 겹쳐지니까요. 반면 전송 시간은 같은 회선의 업로드 대역폭을 4장이 나눠 쓰기 때문에 크게 줄지 않습니다.

그래서 효과는 상황에 따라 갈립니다. 지연이 큰 모바일 회선에 비교적 작은 사진이면 고정 비용 비중이 커서 체감이 크고, 빵빵한 와이파이에 무거운 원본 사진이면 전송 시간이 지배적이라 체감이 작아요.

> 이 비대칭은 글로 읽는 것보다 만져보는 게 빠릅니다. [/labs/upload-timeline](/labs/upload-timeline)에서 핸드셰이크 `H`와 전송 `T`를 슬라이더로 움직여보면, `H`를 키울수록 단축 배수가 `N`에 가까워지고 `T`를 키울수록 `1`에 붙는 게 보여요.

"몇 배 빨라졌다"를 말하고 싶다면 추측이 아니라 측정이 필요한 이유입니다. 측정 방법은 아래에 따로 정리했습니다.

## after()로 블러를 응답 밖으로

마지막 한 조각입니다. 기본 사진은 운영 정책상 업로드 직후 블러 처리가 돼야 합니다. 원본을 내려받아 가우시안 블러를 먹이고 블러본 전용 버킷에 다시 올리는 작업이에요.

처음엔 이 블러를 `/api/apply` 응답 안에서 돌렸습니다. 그러면 사용자의 "신청서 제출하기" 버튼은 이만큼을 다 기다립니다.

```
zod 검증 ➜ DB insert ➜ [원본 다운로드 ➜ sharp 블러 ➜ 블러본 업로드] ➜ 응답
                      └────────── 사용자가 이걸 다 기다림 ───────────┘
```

그런데 사용자 입장에서 블러는 기다릴 이유가 없는 작업입니다. 신청이 접수됐는지만 알면 되고, 블러본은 나중에 운영자가 볼 때나 필요하니까요. 그래서 Next.js 15의 `after()`로 블러를 응답 뒤로 뺐습니다.

```ts title="app/api/apply/route.ts"
import { after } from "next/server";

export const maxDuration = 60; // 원본 다운로드+블러까지 넉넉히

// ...DB insert 까지 끝낸 뒤

after(async () => {
  try {
    const blurredPaths: string[] = [];
    for (const path of photos) {
      const dl = await supabase.storage.from(APPLICANT_PHOTOS_BUCKET).download(path);
      const inputBytes = Buffer.from(await dl.data.arrayBuffer());
      // EXIF 회전 보정 후 가우시안 블러
      const pipeline = sharp(inputBytes).rotate().blur(PHOTO_BLUR_SIGMA);
      const blurredBuffer = await (kind === "png" ? pipeline.png() : pipeline.jpeg()).toBuffer();
      await supabase.storage.from(APPLICANT_PHOTOS_BLURRED_BUCKET)
        .upload(path, blurredBuffer, { contentType, upsert: true });
      blurredPaths.push(path);
    }
    await supabase.from("applications").update({ blurred_photo_paths: blurredPaths }).eq("id", applicationId);
  } catch (err) {
    // 블러 실패는 접수 자체를 실패시키지 않는다 — admin_note 로 남기고 운영자가 재처리
    await supabase.from("applications")
      .update({ admin_note: `[blur failed] ${err instanceof Error ? err.message : "unknown"}` })
      .eq("id", applicationId);
  }
});

return NextResponse.json({ ok: true });
```

`after()`에 넘긴 콜백은 응답이 사용자에게 전송된 뒤에 실행됩니다. 흐름이 이렇게 바뀝니다.

```
zod 검증 ➜ DB insert ➜ 응답 ✅ (사용자는 여기서 끝)
                        └➜ after(): 원본 다운로드 ➜ 블러 ➜ 업로드 (서버가 이어서)
```

알아둘 성질이 두 가지 있습니다. 사용자가 페이지를 떠나도 `after()` 작업은 끝까지 돕니다. 클라이언트 연결과 무관하게 서버에서 실행되기 때문에 "응답 후 `setTimeout`" 같은 것과는 다릅니다. 그리고 `after()`작업은 비용이 공짜가 아닙니다. 블러는 여전히 함수 실행 시간(=비용)을 쓰고 `maxDuration` 안에 끝나야 합니다. 위치만 응답 밖으로 옮긴 거예요.

그리고 이 이동에는 숨은 비용이 하나 있습니다. 블러가 응답 안에 있을 때는 실패하면 사용자에게 에러를 주면 됐습니다. 응답 밖으로 빼는 순간, 사용자는 이미 "접수 완료"를 받았는데 블러가 실패할 수 있어요. 그래서 `catch`에서 접수를 실패시키지 않고 `admin_note`에 실패를 기록합니다. 백그라운드로 옮긴 작업은 실패를 따로 감지하고 재처리할 방법을 반드시 같이 마련해야 합니다. 그게 `after()`의 진짜 설계 비용이에요.

## 측정

### 측정 1: 업로드 시간: 순차 vs 병렬

`submit()`의 2단계 업로드 블록을 `performance.now()`로 감쌉니다.

```ts
const t0 = performance.now();
await Promise.all([ /* ...uploadOne들 */ ]);
const elapsed = performance.now() - t0;
console.log(`[upload] ${elapsed.toFixed(0)}ms`);
```

비교를 위해 조건을 고정했습니다. 같은 사진 세트(기본 3장 + 옵션 1장, 장당 3.92MB), Chrome DevTools Network 스로틀로 회선 고정, 각 5회 측정 후 중앙값. 순차 버전은 비교를 위해 코드만 잠깐 되돌려서 같은 조건으로 쟀습니다.

| 구간 (기본 3 + 옵션 1, 3.92MB/장) | 순차 (median) | 병렬 (median) | 단축   |
| --------------------------------- | ------------- | ------------- | ------ |
| Fast 4G                           | 100372ms      | 98346ms       | 2026ms |
| no limit (Wi-Fi)                  | 2506ms        | 1980ms        | 526ms  |

### 측정 2: `/api/apply` 응답 시간: 블러 인라인 vs after()

라우트 안에서 직접 잽니다.

```ts
const t0 = Date.now();
// ...insert 까지
console.log(`[apply] respond in ${Date.now() - t0}ms`);
```

또는 DevTools Network 패널에서 `/api/apply` 요청의 TTFB를 봐도 됩니다. 비교를 위해 블러를 잠깐 응답 안으로 되돌려 같은 측정을 한 번 더 했습니다.

| `/api/apply` 응답 시간 | 블러 인라인 | 블러 after() |
| ---------------------- | ----------- | ------------ |
| TTFB (median)          | 5080ms      | 488ms        |

### 측정 3: sharp 블러 처리 시간 (이미지당)

두 가지 방법이 있습니다. 운영 중인 값은 `after()` 콜백 안의 `sharp` 파이프라인을 `console.time`으로 감싸 Vercel 함수 로그에서 확인하고, 배포 전에 미리 가늠하려면 저장소의 `scripts/bench-blur.mjs`를 돌립니다.

```bash
node scripts/bench-blur.mjs        # 12MP 합성 이미지로 blur(25) 를 10회 측정
```

이 스크립트는 가우시안 노이즈로 12MP짜리 입력을 만들어 `sharp(buf).rotate().blur(25)`를 반복 실행하고 중앙값을 출력합니다. `maxDuration = 60`이 충분한지, 사진이 N장일 때 총 소요가 얼마일지 가늠하는 근거가 돼요. 로컬 머신과 Vercel 함수의 CPU가 다르니 두 줄을 따로 둡니다.

| sharp blur (장당, 12MP · sigma 25) | JPG 출력 | PNG 출력 |
| ---------------------------------- | -------- | -------- |
| 로컬 (`bench-blur.mjs`)            | 156ms    | 284ms    |
| Vercel (`after()` 로그)            | 3407ms   | 5135ms   |

도구를 정리하면 `performance.now()` / `Date.now()` 로깅, DevTools Network 스로틀 + TTFB, Vercel 함수 로그입니다. 더 깔끔하게 보고 싶으면 응답에 `Server-Timing` 헤더를 실어 Network 패널에서 바로 읽는 방법도 있습니다.

### 숫자가 말해준 것

세 측정이 사실 같은 말을 하고 있습니다. 코드 한 줄로 시간이 크게 줄지는 않는다는 것.

병렬 업로드(측정 1)의 절대 단축은 작았습니다. Fast 4G에서 100초 중 2초, Wi-Fi에서 2.5초 중 0.5초. 앞에서 모델로 짐작했던 대로 전송이 지배적인 환경에서는 병렬의 이득이 거의 사라진다는 게 숫자로 찍혔어요. 같은 4장인데 Wi-Fi 쪽 상대 단축이 더 큰 것도 같은 이유입니다. Fast 4G는 좁은 업로드 대역폭이 시간을 다 가져가서 핸드셰이크를 겹쳐도 줄일 여지가 거의 없거든요. 4G 사용자의 100초를 진짜로 줄이려면 사진 자체를 줄여야 합니다. 클라이언트 압축이 자연스러운 다음 단계예요.

`after()`로 블러를 빼낸 효과(측정 2)는 정반대로 결정적이었습니다. 5.08초에서 0.49초로, 약 10배. 사용자가 "제출 중..."을 응시하는 시간이 확 줄었어요. 응답에서 일을 덜어내는 변화는 거의 항상 가장 값싼 성능 개선입니다. 일 자체는 그대로 도는데 사용자의 체감 시간만 사라지니까요. 참고로 0.5초가 0이 아닌 건 zod 검증, DB insert, Storage 존재 확인이 여전히 응답 안에 있기 때문입니다. 더 줄이려면 셋 중 하나를 들어내야 하는데 다 트레이드오프가 따라옵니다.

블러 비용(측정 3)에서 가장 눈에 띄는 건 로컬 대 Vercel의 20~30배 격차입니다. 로컬 노트북에서 156ms짜리 작업이 Vercel Hobby에서는 3.4초가 됩니다. CPU 집약 작업을 서버리스에 그대로 올리면 어떤 일이 생기는지 보여주는 숫자고, `maxDuration = 60`이 과한 게 아니라는 근거이기도 합니다(PNG 3장 약 15초, JPG 3장 약 10초 + Storage 라운드트립). 부수적으로 PNG 인코딩이 JPG보다 50%쯤 느린데, 블러본이 화면 표시용일 뿐이라면 입력이 PNG여도 출력을 JPG로 고정해 시간을 깎는 선택지가 있습니다.

한 줄로 정리하면, 시간을 없애려면 일을 없애야 합니다. `Promise.all`과 `after()`는 둘 다 일을 옮길 뿐이고, 효과는 옮긴 곳의 특성(대역폭, 사용자 체감)이 정합니다. 그래서 다음 작업은 사진 크기 자체를 줄이는 클라이언트 압축이 됩니다.

## 다음에 또 마주칠 함정

이번 작업을 요약하면, 큰 페이로드를 서버 함수의 경로에서 빼되 따라오는 두 가지를 같이 챙기라는 것입니다.

하나, 신뢰 경계가 이동합니다. 파일을 직접 쥐던 서버가 파일에 대한 주장을 받는 서버가 됩니다. 경로와 존재 여부를 서버가 다시 검증해야 해요. 둘, 백그라운드로 옮긴 작업은 실패가 조용해집니다. 사용자는 이미 성공 응답을 받았으니, 실패를 감지하고 재처리할 방법(`admin_note`, 잡 큐, 재시도 등)을 반드시 같이 마련해야 합니다.

비슷한 업로드를 만들 때 훑어볼 체크리스트로 남겨둡니다.

- 업로드 페이로드가 플랫폼의 함수 본문 한도(Vercel 4.5MB 등)를 넘을 수 있는가?
- 넘는다면 큰 파일이 서버 함수를 통과하지 않고 스토리지로 직접 갈 수 있는가? (서명 업로드 URL)
- 직접 업로드로 바꿨다면 서버가 클라이언트한테서 경로 문자열을 받는가? 그 경로를 형태·소유·존재까지 검증하는가?
- 응답 안에서 도는 작업 중 사용자가 기다릴 이유가 없는 것이 있는가? 있다면 `after()` 같은 곳으로 뺄 수 있는가?
- 백그라운드로 뺀 작업이 실패하면 그 사실을 누가 어떻게 알게 되는가?

마지막 줄이 특히 빠지기 쉽고, 빠지면 "DB엔 멀쩡한데 실물이 없는" 종류의 버그가 됩니다.

## 마무리

사진 업로드가 막힌 건 코드 버그가 아니라 플랫폼 제약(Vercel 함수 4.5MB)이었고, 한도를 늘리는 대신 사진을 함수 경로에서 빼서 한도와 무관한 곳으로 옮겼습니다. 직접 업로드는 신뢰 경계를 이동시켰고, 경로 검증과 존재 확인 두 자물쇠로 그 빈틈을 메웠습니다. 병렬 업로드와 `after()`는 둘 다 시간을 없애지 않고 옮기는 기술이라 효과는 측정해야 하고, 옮긴 곳에서 생기는 비용(대역폭 공유, 조용한 실패)을 같이 책임져야 했습니다.

`4G의 100초`는 일을 옮기는 것으로는 해결할 수 없는 문제입니다. 문제를 해결하려면 업로드 바이트 자체를 줄여서 일을 없애야 하고, 거기서부터는 [다른 이야기](/posts/client-image-compression)입니다.

구조를 바꾸는 데 든 시간보다 바꾸면서 새로 생긴 빈틈을 찾아 메우는 데 더 오래 걸렸어요. 다음에 직접 업로드를 또 설계할 때 이 글의 체크리스트를 떠올릴 수 있다면 그 시간은 회수된 셈이라고 생각합니다.
