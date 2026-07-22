---
author: seulgi um
pubDatetime: 2026-05-13T12:00:00+09:00
title: "다음 버튼이 죽어 있던 이유"
featured: true
draft: false
tags:
  - frontend
  - form
  - zod
  - ux
  - validation
  - SSoT
description: "에러 메시지도 없이 다음 버튼만 안 눌리는 폼 버그를 파다 보니, UI와 zod 스키마와 DB가 '기타'라는 값을 서로 다르게 취급하고 있었다. 이 어긋남이 왜 코드 리뷰에서 안 잡히는지, silent failure를 어떻게 막았는지 정리했다. 덤으로 zod 에러 메시지에 을/를 조사를 자동으로 붙이는 방법도."
---

폼 화면에서 "다음 단계" 버튼을 눌렀는데 아무 일도 안 일어나는 버그를 겪었습니다. 빨간 에러도 없고 콘솔도 조용했어요. 버튼이 그냥 죽어 있었습니다.

원인을 따라가 보니 버그 하나가 아니라 패턴 하나가 나왔습니다. 비슷한 폼을 만드는 사람이라면 (그리고 미래의 제가) 다시 마주칠 만한 함정이라 적어둡니다.

> 본문에서 다루는 폼은 [/labs/silent-form-validation](/labs/silent-form-validation#dev-panel)에서 직접 만져볼 수 있습니다. dev 패널을 켜고 "기타" 칩을 누르면 본문에서 말하는 `secondary.N` 인덱스 키가 실시간으로 나타나고, 패널을 끄면 사용자에게 어떻게 보이는지(버튼이 죽은 상태)도 확인할 수 있어요.

## Table of contents

## 재현

문제의 폼은 4단계짜리 신청서의 한 스텝입니다. 사용자가 옵션을 칩으로 골라 선택하는데, 마지막 칩이 "기타"였고 누르면 자유 입력란이 열립니다.

사용자가 한 행동은 이렇습니다. "기타" 칩을 누르고, 입력란에 텍스트를 적고, 다음 단계 버튼을 누른다. 그리고 아무 일도 일어나지 않는다.

콘솔에 에러도 없고 네트워크 요청도 안 나갑니다.

## 진단

`onClick={next}`를 따라가 보니 `validateCurrent()`에서 막히고 있었습니다.

```ts title="ApplyForm.tsx"
function validateCurrent(): boolean {
  const result = step3Schema.safeParse(data);
  if (!result.success) {
    setErrors(flattenZodErrors(result.error));
    return false;
  }
  setErrors({});
  return true;
}
```

`step3Schema.safeParse(data)`가 실패해서 진행이 막힌 것 자체는 의도된 동작입니다. 문제는 왜 실패하냐는 거였어요. `data.secondary`에 들어 있는 값은 이랬습니다.

```json
["기타"]
```

스키마는 이렇게 생겼고요.

```ts title="lib/schemas/application.ts (수정 전)"
const optionValues = SELECTIVE_OPTIONS.map(o => o.value) as [
  string,
  ...string[],
];

secondary: z.array(z.enum(optionValues)).default([]),
```

`SELECTIVE_OPTIONS`는 이렇습니다.

```ts title="lib/constants.ts"
export const SELECTIVE_OPTIONS = [
  { value: "옵션 1", label: "옵션 1" },
  { value: "옵션 2", label: "옵션 2" },
  { value: "옵션 3", label: "옵션 3" },
  { value: "옵션 4", label: "옵션 4" },
] as const;
```

스키마는 enum이고, enum에 "기타"는 없습니다. zod가 막는 게 당연하죠.

그런데 UI를 보면 얘기가 달라집니다.

```tsx title="Step3.tsx"
  const showSecondaryEtc = data.secondary.includes("기타");

  return (
    <div className="flex flex-wrap gap-2">
      {
        SELECTIVE_OPTIONS.map(o => (
          <Chip
            key={o.value}
            checked={data.secondary.includes(o.value)}
            onClick={() => onChange({ secondary: toggle(data.secondary, o.value) })}
          >
            {o.label}
          </Chip>
        ));
      }
      <Chip
        checked={data.secondary.includes("기타")}
        onClick={() => onChange({ secondary: toggle(data.secondary, "기타") })}
      >
        기타
      </Chip>
      {showSecondaryEtc && (
        <input
          type="text"
          className="input-base mt-2.5"
          placeholder="기타 옵션을 입력해주세요"
          value={data.secondary_etc}
          onChange={(e) => onChange({ secondary_etc: e.target.value })}
        />
      )}
    </div>
  )

```

상수 목록에서 매핑한 칩들 옆에 하드코딩된 "기타" 칩이 따로 있습니다. "기타"는 옵션 상수에 없는데 UI는 같은 배열에 넣어요.

DB 컬럼은 또 다릅니다.

```sql title="schema.sql"
secondary text[] not null default '{}',
```

그냥 `text[]`입니다. CHECK 제약도 enum 타입도 없어요. DB는 처음부터 "기타"를 받을 준비가 되어 있었습니다.

정리하면 이렇게 됩니다.

| 레이어            | "기타" 허용? | 이유                   |
| ----------------- | ------------ | ---------------------- |
| UI (`Step3.tsx`)  | O            | 하드코딩 칩            |
| Schema (zod)      | X            | `z.enum(optionValues)` |
| DB (`schema.sql`) | O            | `text[]`               |

세 레이어가 같은 데이터를 다루면서 각자 다른 시점에 각자의 사정으로 바뀌어 온 겁니다. UI를 만들 때는 사용자 편의를 위해 "기타"를 끼워 넣었고, DB는 애초에 느슨하게 설계됐는데, 가운데 있는 zod 스키마만 업데이트를 빠뜨린 거죠.

이런 어긋남은 코드 리뷰에서 잘 안 잡힙니다. 세 파일이 한 PR에 같이 올라오는 일이 드물고, 파일 하나만 놓고 보면 각자는 멀쩡해 보이거든요.

> [/labs/silent-form-validation](/labs/silent-form-validation#diagram)의 다이어그램 섹션이 이 어긋남을 시각화한 것입니다. UI / Schema / DB 박스 세 개에서 "기타"의 상태를 비교해뒀어요.

## 왜 사용자에게는 아무것도 안 보였나

여기서 한 단계 더 들어가야 합니다. 검증이 실패했는데 왜 에러 메시지조차 안 보였을까요? 사실 이쪽이 더 무서운 부분입니다.

`flattenZodErrors`는 zod의 issue path를 점으로 이어붙인 키로 평탄화합니다.

```ts
function flattenZodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
```

`secondary`는 배열이라 zod의 issue path에는 "기타"가 배열의 몇 번째에 들어갔는지가 그대로 적힙니다.

```
["secondary", N]
```

`N`은 사용자가 칩을 누른 순서에 따라 달라집니다. "기타"만 눌렀다면 배열이 `["기타"]`니까 0이고, 옵션 네 개를 먼저 누르고 "기타"를 눌렀다면 4예요. 같은 버그인데 사용자 행동에 따라 매번 다른 키로 기록되는 겁니다.

`join(".")`을 거치면 키는 `"secondary.N"` 형태가 됩니다. "기타"만 누른 경우 `errors` 객체는 이렇게 생겼어요.

```json
{
  "secondary.0": "Invalid enum value. Expected '옵션 1' | '옵션 2' | '옵션 3' | '옵션 4', received '기타'"
}
```

이제 Step3 컴포넌트가 이 에러를 어떻게 다루는지 봅시다.

```tsx
<FieldError msg={errors.primary} />
<FieldError msg={errors.acade} />
{/* secondary는 optional이라 에러 표시 컴포넌트를 안 만들어도 될 거라고 생각했다... */}
```

`errors.secondary`도, `errors["secondary.0"]` 같은 인덱스 키도 어디서도 렌더링하지 않습니다. 검증은 실패했는데 그 사실이 화면 어디에도 나타나지 않아요. 사용자 입장에서는 버튼이 죽은 겁니다.

이게 폼 검증에서 제일 위험한 실패 방식인 silent failure입니다. 차라리 영문 에러라도 빨갛게 떴다면 사용자는 뭔가 잘못됐다는 것 정도는 압니다. 아무것도 안 뜨면 자기가 뭘 잘못했는지조차 모릅니다.

## 두 가지 처방

### 근본 처방: 세 레이어의 의미 맞추기

수정 자체는 한 줄입니다.

```diff title="lib/schemas/application.ts"
- secondary: z.array(z.enum(optionValues)).default([]),
+ secondary: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
```

zod 스키마의 제약을 DB 컬럼 수준으로 풀어서 세 레이어가 같은 의미를 갖게 했습니다. UI가 "기타"를 자유 입력으로 다루기로 했고 DB가 그걸 받게 되어 있다면, 가운데의 zod도 같이 풀리는 게 맞아요.

다만 반대 방향(enum으로 잠그기)이 맞는 경우도 있어서, 판단 기준을 남겨둡니다. 옵션 목록이 운영 중에 자주 바뀌거나 UI에 "기타" 같은 자유 입력이 있다면 free-text가 맞고, DB 컬럼에 enum 타입이나 CHECK 제약이 걸려 있거나 운영자 분류 정확도가 중요한 컬럼이라면 zod도 같은 enum으로 잠그는 게 맞습니다.

제 경우 `SELECTIVE_OPTIONS`는 닫힌 분류가 아니라 입력을 돕는 칩 프리셋이었어요. 처음부터 그렇게 설계됐어야 하는 거였죠.

### 안전망: 표시 안 된 에러를 잡는 fallback

근본 처방을 해도 비슷한 함정은 또 생깁니다. 다른 필드에서, 다른 인덱스 path로요. 그래서 표시되지 않은 에러가 있으면 일반 안내라도 보여주는 fallback을 추가했습니다.

```tsx title="ApplyForm.tsx"
{submitError && (
  <p class="text-center text-[13px] text-danger mt-4">{submitError}</p>
)}

{!submitError && Object.keys(errors).length > 0 && (
  <p class="text-center text-[12.5px] text-danger mt-4">
    입력값에 문제가 있어요. 위 항목을 다시 확인해주세요.
  </p>
)}
```

이걸로 silent failure가 완전히 해결되는 건 아닙니다. 어떤 항목이 문제인지는 여전히 사용자가 찾아야 해요. 그래도 버튼이 죽은 것처럼 보이는 최악의 상태는 막습니다. 검증이 실패했다는 사실을 알리는 게 1차 목표고, 정확한 위치를 알려주는 건 그다음이라고 봤습니다.

더 손보고 싶다면 이런 방향이 있습니다. `flattenZodErrors`에서 `field.N` 같은 인덱스 키를 `field`로 합치거나, 단계별로 어떤 에러 키를 어떤 컴포넌트가 책임지는지 매핑을 만들거나, 표시되지 않은 에러가 있으면 개발 모드에서 콘솔 경고를 띄워 QA에서 잡히게 하거나. 개인적으로는 마지막 방법이 효율이 좋았습니다. 사용자에게는 일반 안내를, 개발자에게는 정확한 키를 알려주는 구조라서요.

```ts
if (import.meta.env.DEV) {
  const unrenderedKeys = Object.keys(errors).filter(
    k => !RENDERED_ERROR_KEYS.has(k),
  );
  if (unrenderedKeys.length) {
    console.warn("[apply] 표시되지 않은 검증 에러:", unrenderedKeys, errors);
  }
}
```

## 일반화

이 글에서 얻은 교훈을 요약하면, 같은 데이터의 제약을 UI와 스키마와 DB 세 곳에 따로 적어두면 셋은 반드시 따로 변한다는 것입니다. 막는 방법은 두 가지예요. 하나를 기준(SSoT)으로 못 박고 나머지를 거기서 파생시키거나(zod 스키마에서 옵션 목록을 export해서 UI가 import하는 식), 어긋났을 때 사용자가 조용히 막히지 않게 안전망을 깔거나. 둘 다 하는 게 제일 좋고요.

다음에 비슷한 폼을 만들 때 확인할 것들을 남겨둡니다.

- UI 옵션 목록과 zod enum이 같은 상수에서 파생되는가, 따로 적혀 있는가
- zod enum이 DB의 CHECK 제약이나 enum 타입과 일치하는가
- UI에 "기타" 같은 목록 밖의 값이 들어올 수 있는가, 스키마가 그걸 허용하는가
- zod issue path에 배열 인덱스가 들어갈 수 있는 필드가 있는가, 그 키를 UI가 렌더링하는가
- `errors` 객체에 키가 있는데 아무 컴포넌트도 안 보여주는 상황이 가능한가

마지막 두 개가 특히 빠뜨리기 쉽고, 빠뜨리면 이번 같은 답답한 버그가 됩니다.

## 보너스: zod 에러 메시지에 한국어 조사 붙이기

silent failure를 고치고 나니 하나가 더 거슬렸습니다. 정상적으로 에러가 표시되는 다른 enum 필드들은 메시지가 영문 그대로 노출되고 있었어요.

```
Invalid enum value. Expected '옵션 1' | '옵션 2' | '옵션 3' | '옵션 4', received '기타'
```

개발자야 바로 읽히지만 일반 사용자에게는 덜 만든 서비스로 보입니다. zod 기본 메시지를 사용자에게 그대로 내보내는 건 DX와 UX의 경계를 잘못 그은 거라고 생각해요.

### errorMap 패턴

zod v3는 enum 정의에서 `errorMap`을 받습니다. 헬퍼로 감싸면 깔끔합니다.

```ts
const enumOf = <T extends readonly [string, ...string[]]>(
  values: T,
  label?: string,
) =>
  label
    ? z.enum(values, {
        errorMap: () => ({
          message: `${withObjectParticle(label)} 선택해주세요`,
        }),
      })
    : z.enum(values);
```

사용은 이렇게 합니다.

```ts
question1: enumOf(question1Values, "질문 1"),
question2: enumOf(question2Values, "질문 2"),
question3: enumOf(question3Values, "질문 3"),
```

### 받침 유무를 유니코드로 판별하기

여기서 재미있는 문제가 하나 나옵니다. 목적격 조사(을/를)는 앞 단어의 받침 유무에 따라 갈립니다. "옵션을 선택해주세요"는 "션"에 받침이 있어서 "을"이고, "여부를 선택해주세요"는 "부"가 모음으로 끝나서 "를"이에요.

"을(를)"로 쓰고 넘어갈 수도 있지만, 받침을 직접 판별하는 게 훨씬 깔끔합니다. 유니코드 한글 음절 블록(가\~힣, `0xAC00`~`0xD7A3`)은 같은 초성·중성을 공유하는 글자 28개가 한 묶음으로 배열되어 있고, 묶음 안에서 종성(받침) 인덱스가 0(없음)부터 27까지 순서대로 매겨져 있습니다. 그래서 받침 유무는 한 줄로 판별됩니다.

```ts
(code - 0xac00) % 28 !== 0; // true면 받침 있음
```

헬퍼로 감싸면 이렇게 됩니다.

```ts
function withObjectParticle(noun: string): string {
  const last = noun.charAt(noun.length - 1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const hasJongseong = (code - 0xac00) % 28 !== 0;
    return `${noun}${hasJongseong ? "을" : "를"}`;
  }
  return `${noun}을(를)`; // 한글 외 문자로 끝나면 안전 폴백
}
```

| 입력 | 마지막 글자 | 받침 | 결과   |
| ---- | ----------- | ---- | ------ |
| 옵션 | 션          | 있음 | 옵션을 |
| 여부 | 부          | 없음 | 여부를 |
| 방식 | 식          | 있음 | 방식을 |
| 플랜 | 랜          | 있음 | 플랜을 |

같은 방법을 주격(이/가)이나 보조사(은/는)에도 쓸 수 있습니다. 종성 인덱스 자체가 필요하면 `(code - 0xAC00) % 28`이 그 값이라, 받침이 ㄴ인지 ㅁ인지 구분하는 더 정교한 처리도 가능하고요.

본격적인 i18n이 필요해지면 `i18next` 같은 걸 붙이는 게 맞지만, 이 규모에서는 헬퍼 두 개면 충분했습니다. 핵심은 zod 기본 에러 메시지가 사용자에게 그대로 노출되는 상태를 기본값으로 두지 않는 것입니다.

## 마무리

폼 검증의 silent failure는 대부분 UI / Schema / DB 세 레이어 중 하나가 따로 변한 결과였습니다. 그리고 진짜 문제는 검증 실패 자체가 아니라 그 실패가 사용자에게 보이지 않는 상태였고요. 표시되지 않는 에러를 잡아주는 fallback 하나만 깔아둬도 최악은 면합니다.

스키마 한 줄 고치는 데 1분, 안전망 까는 데 5분, 이 글 쓰는 데 그보다 훨씬 오래 걸렸네요. 다음에 비슷한 폼을 만들 때 이 패턴이 떠오른다면 남는 장사라고 생각합니다.
