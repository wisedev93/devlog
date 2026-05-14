---
author: seulgi um
pubDatetime: 2026-05-13T12:00:00+09:00
title: "폼 검증이 조용히 막힐 때 — 스키마와 UI 사이의 어긋남"
featured: true
draft: false
tags:
  - frontend
  - form
  - zod
  - ux
  - validation
description: "다음 버튼이 그냥 죽은 것처럼 보이는 폼 버그를 따라가다 만난 세 레이어(UI/Schema/DB) 어긋남 패턴과, 그 silent failure를 막기 위한 안전망 두 가지. 끝에는 한국어 사용자를 위한 zod에러 메시지 헬퍼."
---

한 폼 화면에서 "다음 단계 ➡️" 버튼을 눌렀는데 **아무 일도 안 일어나는** 버그를 겪었습니다. 빨간 에러도 없고, 콘솔에도 별다른 게 없습니다. 그저, 버튼이 죽어 있었어요.

이 글은 그 미세한 어긋남을 어떻게 찾고, 어떻게 일반화 가능한 패턴으로 정리했는지에 대한 기록입니다. 누구나(그리고 미래의 내가) 한 번씩은(다시) 마주칠 함정이라 생각해서 적어둡니다.

> 본문에서 다루는 폼은 **[/labs/silent-form-validation](/labs/silent-form-validation)** 에서 직접 시연할 수 있습니다. dev 패널을 켜둔 채로 "기타" 칩을 누르면, 본문에서 말한 `secondary.N` 인덱스 키가 라이브로 등장하는 걸 볼 수 있어요. 토글을 OFF로 두면 같은 상태가 사용자에게 어떻게 보이는지(= 버튼이 죽은 상태)도 확인할 수 있습니다.

## Table of contents

## 재현

문제의 폼은 4단계짜리 신청서의 한 스텝이고, 사용자는 "옵션"을 칩으로 골라 선택합니다. 마지막 칩이 `⁉️ 기타` 였고, 누르면 텍스트 입력란이 열리는 구조였어요.

사용자가 한 행동:

1. "기타" 칩을 누른다
2. 자유 입력란에 임의의 텍스트를 적는다
3. `다음 단계 ➡️` 버튼을 누른다
4. **아무 일도 일어나지 않는다**

브라우저 콘솔에도 별다른 에러가 없고, 네트워크 요청도 가지 않습니다. 그저 버튼이 죽어 있는 상태.

## 진단 — 세 곳이 따로 관리되고 있었다

`onClick={next}`를 따라가 보니 `validateCurrent()`가 핵심이었습니다.

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

`step3Schema.safeParse(data)`가 실패해서 `next()`가 진행을 막고 있었습니다. 여기까지는 의도된 동작이에요.

문제는 **왜 실패하는가** 였습니다. `data.secondary`에 들어가 있는 값을 보면:

```json
["기타"]
```

스키마는 이렇게 생겼어요.

```ts title="lib/schemas/application.ts (수정 전)"
const optionValues = SELECTIVE_OPTIONS.map(o => o.value) as [
  string,
  ...string[],
];

secondary: z.array(z.enum(optionValues)).default([]),
```

그리고 `SELECTIVE_OPTIONS`는:

```ts title="lib/constants.ts"
export const SELECTIVE_OPTIONS = [
  { value: "옵션 1", label: "옵션 1" },
  { value: "옵션 2", label: "옵션 2" },
  { value: "옵션 3", label: "옵션 3" },
  { value: "옵션 4", label: "옵션 4" },
] as const;
```

스키마는 enum 이고, enum 에는 `"기타"`가 없습니다. 그래서 zod가 막아요. 너무나 당연한 결과죠.

그런데 UI는 이렇게 생겼습니다.

```tsx title="Step3.tsx"
  const showSecondaryEtc = data.secondary.includes("기타");

  return (
    <div className="flex flex-wrap gap-2">
      {
        SELECTIVE_OPTIONS.map(o => (
          <Chip
            key={o.value}
            checked={secondary.includes(o.value)}
            onClick={() => onChange({ secondary: toggle(secondary, o.value) })}
          >
            {o.label}
          </Chip>
        ));
      }
      <Chip
        checked={secondary.includes("기타")}
        onClick={() => onChange({ secondary: toggle(secondary, "기타") })}
      >
        ⁉️ 기타
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

상수 목록에서 매핑한 칩 옆에, **하드코딩된 "기타"칩이 따로 있습니다.** "기타"는 옵션 셋에 없는데 UI에서는 같은 배열에 푸시해요.

마지막으로 DB 컬럼은:

```sql title="schema.sql"
secondary text[] not null default '{}',
```

그냥 `text[]`. CHECK 제약도 없고, enum 타입도 안 씁니다. **DB는 처음부터 "기타"를 받을 준비가 되어 있었어요.**

정리하면 이렇습니다.

| 레이어                 | "기타" 허용? | 이유                  |
| ---------------------- | ------------ | --------------------- |
| UI (`Step3.tsx`)       | O            | 하드코딩 칩           |
| Schema (zod)           | X            | `z.enum(optionValues)` |
| DB (`schema.sql`)      | O            | `text[]`              |

세 레이어가 같은 데이터를 다루고 있는데, 각자 다른 시점에 각자의 룰로 진화해 왔어요. UI를 개발할 때는 사용자 편의를 위해 "기타"를 끼워 넣었고, DB는 그걸 수용하게 설계했지만, 개발하다가 실수로 중간에 있는 zod 스키마만 빠뜨린 거죠.

이런 식의 어긋남(휴먼에러)은 프로젝트를 혼자 진행 할 때는 괜찮을지 몰라도 협업하는 과정에서는 코드 리뷰에서 거의 잡히지 않습니다. 세 파일이 동시에 한 PR에 올라오는 일이 드물고, 각자는 자기 영역만 보면 멀쩡해 보이거든요.

> [/labs/silent-form-validation](/labs/silent-form-validation)의 다이어그램 섹션이 정확히 이 어긋남을 시각화합니다. UI / Schema / DB 박스 세 개에서 "기타"의 상태(✓ / ✕ / *)를 점 아이콘으로 비교했어요.

## 왜 사용자에게 "조용히" 막혔나

여기서 한 단계 더 들어갑니다. **검증 실패가 일어났음에도 왜 사용자에게 아무 메시지도 안 보였는가?** 이게 진짜 무서운 부분이에요.

`flattenZodErrors`는 zod의 issue path를 점(`.`)으로 join한 키로 평탄화합니다.

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

`secondary`는 배열이라, zod의 issue path 는 **"기타"가 배열의 몇 번째 인덱스에 들어갔는지**를 그대로 적습니다.

```
["secondary", N]
```

여기서 `N` 은 사용자가 칩을 누른 순서에 따라 달라져요.

- "기타"만 눌렀다면 ➡️ 배열은 `["기타"]` ➡️ `N === 0`
- "옵션 1, 2, 3, 4"를 차례대로 누르고 마지막에 "기타"를 눌렀다면 ➡️ `["옵션 1", "옵션 2", "옵션 3", "옵션 4", "기타"]` ➡️ `N === 4`

즉 같은 버그가 사용자 동작에 따라 매번 다른 키로 박힙니다. [/labs/silent-form-validation](/labs/silent-form-validation)에서 dev 패널을 켜둔 채로 "기타"만 한 번 눌러보면 가장 단순한 케이스인 `secondary.0`이 즉시 나타나요.

`.join(".")` 을 거치면 키는 이렇게 평탄화됩니다.

```
"secondary.N"
```

`errors` 객체의 실제 모양을 "기타"만 누른 경우로 보면:

```json
{
  "secondary.0": "Invalid enum value. Expected '옵션 1' | '옵션 2' | '옵션 3' | '옵션 4', received '기타'"
}
```

이제 Step3 컴포넌트가 이 에러를 어떻게 다루는지 봅시다.

```tsx
<FieldError msg={errors.primary} />
<FieldError msg={errors.acade} />
{/* optional하기 때문에 secondary 에러를 표시하는 컴포넌트가 없어도 괜찮을 거라고 생각했다... */}
```

`errors.secondary`도, `errors["secondary.N"]` (=`secondary.0`, `secondary.1`...)도, 어디서도 렌더링하지 않습니다. 인덱스가 박힌 동적 키를 매칭하려고 만든 코드도 없어요. 결국 검증은 실패했지만, **그 사실이 화면 어디에도 나타나지 않습니다.**

사용자 입장에서는 "버튼이 죽었다."

이게 폼 검증의 가장 위험한 실패 패턴 — **silent failure** 입니다. 차라리 빨간 글씨로 영문 에러가 떴다면, 사용자는 적어도 뭔가 잘못된 걸 알아요. 아무것도 안 뜨면 자기가 뭘 잘못한 건지조차 모릅니다.

> [/labs/silent-form-validation](/labs/silent-form-validation)의 폼에서 dev 패널을 켜두고 "기타" 칩을 눌러보면, 라이브로 errors 객체에 `secondary.N` 키가 박혀있는 게 보입니다. 그런데 폼 UI 영역에는 빨간 글씨가 어디에도 없어요.

## 두 가지 처방

### A. 근본 처방 — SSoT (단일 진실 공급원 정렬)

가장 빠른 fix는 한 줄입니다.

```diff title="lib/schemas/application.ts"
- secondary: z.array(z.enum(secondaryValues)).default([]),
+ secondary: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
```

zod 스키마의 제약을 DB 컬럼 수준으로 맞춰서, 세 레이어가 같은 의미를 갖게 합니다. UI 가 "기타"를 자유 입력으로 다루기로 했고 DB 가 그걸 받을 준비가 되어 있다면, 가운데에 있는 zod도 같이 풀어야 해요.

여기서 잠깐 멈춰서 결정 트리를 정리해두면 도움이 됩니다. **언제 enum으로 잠가야 하고, 언제 free-text로 풀어야 하는가?**

| 상황                                          | 의미                      | 추천                  |
| --------------------------------------------- | ------------------------- | --------------------- |
| UI 옵션 셋이 운영자에 의해 자주 추가/변경된다 | 옵션이 코드 외부에 가깝다 | free-text또는 동적 enum |
| DB 컬럼이 enum 타입이거나 CHECK 제약이 있다   | DB가 SSoT 역할을 한다    | zod도 동일 enum      |
| UI가 "기타"같은 자유 입력 옵션을 가진다     | 옵션 셋이 closed가 아니다 | free-text             |
| 운영자 분류 정확도가 중요한 컬럼이다          | data hygiene 우선         | enum + validation     |

제 경우는 두 번째·네 번째 상황은 아니고 첫 번째·세 번째 상황에 해당됐어요. free-text가 맞았습니다.

`SELECTIVE_OPTIONS`는 결국 **UI를 위한 빠른 칩 프리셋**이지, Closed Domain(닫힌 분류)이 아니었어요. 처음부터 입력의 보조 도구로 설계되었어야 했습니다.

### B. 안전망 — silent failure를 막는 fallback

근본 처방을 했어도, 비슷한 유형의 함정은 또 생깁니다. 다른 필드에서, 다른 인덱스 path로. 그래서 **표시되지 않은 에러가 있을 때 사용자에게 일반 안내라도 보여주는 fallback**을 한 줄 추가했어요.

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

이게 silent failure를 완전히 해결하진 않습니다. 어떤 항목이 문제인지는 여전히 사용자가 추측해야 해요. 그래도 "버튼이 죽은 것처럼 보이는" 최악의 상태는 막습니다. **검증이 실패했음을 사용자가 알게 하는 것**이 1차 목표고, **어디가 문제인지 정확히 보여주는 것**은 그다음입니다.

더 잘 만들고 싶다면 다음 옵션이 있어요.

- `flattenZodErrors`를 개선해 `field.N`같은 인덱스 path를 `field`키로 합치기 (배열 필드 전체의 에러는 하나로 표시)
- 단계별로 어떤 에러 키를 어떤 컴포넌트가 책임지는지 명시적 매핑 만들기
- 폼 제출 시 "표시되지 않은 에러가 있으면 개발용 콘솔 로그"를 띄워서 QA 에서 잡히게 하기

세 번째가 특히 효과적입니다. 사용자에게는 일반 안내를 보여주고, 개발자에게는 콘솔로 정확한 키를 알려주는 구조예요.

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

## 일반화 — 다음에 또 마주칠 함정

이 글의 핵심을 한 줄로 요약하면 이렇습니다. **같은 데이터의 제약을 세 곳(UI / Schema / DB)에 따로 적어두면, 셋은 반드시 따로 변화한다.** 막을 방법은 두 가지예요.

1. **하나를 SSoT로 못 박는다.** 보통 DB나 schema한 곳을 기준으로 두고, 나머지는 거기서 파생합니다. zod 스키마에서 옵션 셋을 export해서 UI가 그걸 import 하는 식.
2. **사이가 어긋났을 때 사용자가 막히지 않게 한다.** 검증 실패를 사용자에게 "보이게" 만드는 안전망을 깔아둡니다.

체크리스트로 정리해두면 다음 비슷한 폼을 만들 때 한 번 훑어볼 수 있어요.

- UI 옵션 셋과 zod enum이 같은 상수에서 파생되는가? 아니면 따로 적혀 있는가?
- zod enum이 DB의 CHECK 제약 / enum 타입과 일치하는가?
- UI에 "기타"같은 옵션 셋 밖의 값이 들어갈 수 있는가? 있다면 schema가 그걸 허용하는가?
- **zod issue path에 배열 인덱스가 들어갈 수 있는 필드가 있는가? 그 키를 UI가 렌더링하는가?**
- **`errors` 객체에 키가 있는데 어떤 컴포넌트도 그걸 안 보여주는 상황이 가능한가? 그때 사용자에게 무엇이 보이는가?**

마지막 두 줄이 특히 누락되기 쉽고, 누락되면 가장 답답한 종류의 버그가 됩니다.

## 보너스 — 한국어 사용자를 위한 zod 에러 메시지

위의 silent failure를 고치고 나니 한 가지가 더 거슬렸어요. 다른 enum 필드(옵션 1, 옵션 2 등)는 정상적으로 에러를 표시하는데, **메시지가 영문 그대로 노출되고 있었습니다.**

```
Invalid enum value. Expected '옵션 1' | '옵션 2' | '옵션 3' | '옵션 4', received '기타'
```

개발자에게는 즉시 의미가 읽히는 메시지지만, 일반 사용자에게는 "유효하지 않은 값" 이라는 뜻조차 흐릿합니다. 아니 애초에 **덜 만든 서비스**로 보입니다 zod 기본 메시지를 그대로 사용자에게 보여주는 건 **DX 와 UX 의 경계를 잘못 그은 것** 이라고 봐요.

### errorMap 패턴

zod v3는 enum 정의에서 `errorMap`을 받습니다. 이걸 헬퍼로 감싸면 깔끔해요.

```ts
const enumOf = <T extends readonly [string, ...string[]]>(
  values: T,
  label?: string,
) =>
  label
    ? z.enum(values, {
        errorMap: () => ({
          message: `${withObjectParticle(label)}을(를) 선택해주세요`,
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

### 한국어 받침을 자동으로 처리하기

여기서 유니코드로 재밌는걸 할 수 있습니다. **목적격 조사(을/를)는 앞 단어의 받침 유무에 따라 갈립니다.**

- "어떤 옵션을 선택해주세요" — "션"에 받침이 있어서 "을"
- "어떤 여부를 선택해주세요" — "부"가 모음 끝이라 "를"

폴백으로 "을(를)" 이라고 쓸 수도 있지만, 모음 끝 단어 뒤에 "을(를)" 이 붙으면 명백한 비문입니다 (`여부을(를)`). 차라리 받침을 직접 판별하는 게 깔끔해요.

유니코드 한글 음절 블록(가~힣, `0xAC00`–`0xD7A3`)은 28의 배수 단위로 묶입니다. 같은 초성·중성을 공유하는 28개의 글자가 한 묶음이고, 그 안에서 종성(받침) 인덱스가 0(없음)부터 27까지 순서대로 매겨져요. 즉 받침 유무는 다음 한 줄로 판별됩니다.

```ts
(code - 0xac00) % 28 !== 0; // true 면 받침 있음
```

이걸 헬퍼로 감싸면:
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

| 입력     | 마지막 글자| 받침  | 결과     |
| ------- | ------- | ---- | ------  |
| 옵션     | 션      | 있음   | 옵션을   |
| 여부     | 부      | 없음   | 여부를   |
| 방식     | 식      | 있음   | 방식을   |
| 플랜     | 랜      | 있음   | 플랜을   |

같은 트릭을 주격(이/가), 보조사(은/는) 에도 그대로 쓸 수 있어요. 종성 인덱스 자체가 필요하면 `(code - 0xAC00) % 28`이 그 값입니다 — 받침이 ㄴ 인지 ㅁ 인지까지 구분해 더 정교한 처리도 가능해요.

### 어디까지 자동화할까

작은 프로젝트에서는 이 정도 헬퍼 두 개로 충분합니다. 본격적인 i18n이 필요하면 `i18next` + 한국어 같은 플러그인을 붙이는 게 맞고, 그 사이 어딘가에 있다면 위 헬퍼를 한 파일로 떼어 두면 다른 곳에서도 재활용돼요.

핵심은 — **zod의 기본 에러 메시지가 사용자에게 그대로 노출되는 상태를 디폴트로 두지 않는 것** 입니다. 영문 메시지 한 줄이 직접 노출되는 순간, 그 폼의 UX, 나아가서 서비스의 신뢰도는 한 단계 깎입니다.

## 마무리

오늘 한 일을 다시 짚으면 두 줄입니다.

- 폼 검증의 silent failure는 대부분 **세 레이어(UI / Schema / DB) 중 하나가 따로 변화한 결과**다.
- 진짜 무서운 건 검증 실패 자체가 아니라, 그 실패가 사용자에게 보이지 않는 상태다. **표시되지 않는 에러를 잡아주는 fallback**을 깔아두는 것만으로도 한 단계 개선된다.

스키마 한 줄을 푸는 데 1분, 안전망을 까는 데 5분, 그리고 이 글을 쓰는 데 더 오래 걸렸어요. 다음에 비슷한 폼을 만들 때 이 패턴을 떠올릴 수 있다면 그 시간은 다 회수된 셈이라 생각합니다.