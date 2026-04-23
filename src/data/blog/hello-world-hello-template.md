---
author: Your Name
pubDatetime: 2026-04-20T09:00:00+09:00
title: "Hello world!, Hello template!"
featured: true
draft: false
tags:
  - intro
  - astro
  - template
description: "template입니다. 앞으로 작성할 때 어떻게 쓰시면 되는지 예시를 적어두었습니다."
---

안녕하세요. 블로그를 만들면서 예쁘게 잘 만들어진 것 같아 사용하고 싶은 분들을 위해 남깁니다.

template이고요 작성 예시입니다. **마크다운 문법**에 대한 설명이 있어요.
**온전히 글 쓰는 것**에만 집중할 수 있도록 간단한 예시만 몇 가지 설명하려고 해요.\
**색상 테마는 제가 좋아하는 색이어서요**, **바꾸고 싶으시면** *src/styles/global.css*를 참고하시면 돼요!

## Table of contents

## Table of contents는

<b>astro.config.ts</b>에 있는 remarkToc 플러그인 덕분이에요

```ts title="remarkToc"
markdown: {
  remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
  ...
}
```

markdown 용 remark 플러그인이에요. 포스트 본문에 ## Table of contents 헤딩을 넣어두면 그 아래에 자동으로 목차를 생성해줘요.

## 제목 예시에요

`<h1>`, `<h2>`, `<h3>`, ... 태그로 변환되는 제목을 그려줘요.

마크다운 파일에서는 **하나의 `<h1>` 대제목만 사용**하는 게 좋아요. `<h1>` 태그는 검색엔진 최적화(SEO)의 핵심 요소로 검색 결과 노출에 큰 영향을 주고 여러 개를 사용해도 문제는 없지만 한 개만 사용하는 것을 권장해요.

## 문단 예시에요

강제개행을 인식하지 않아서 이런식으로

줄바꿈을 두 번 해야 하는데, 그러면 가독성이 좋지 못하잖아요?\
그럴 땐 문장 끝에 \\(역슬래시)를 넣으면 돼요.

## 강조 예시에요

- **두껍게**: \*(Asterisks) 혹은 \_(Underscore)를 2번 사용해요. `**이렇게 쓰면 돼요.**` 그러면 **이렇게 나와요.**
- **이탤릭체**: \*(Asterisks) 혹은 \_(Underscore)를 1번 사용해요. `*이렇게 쓰면 돼요.*` 그러면 _이렇게 나와요._
- **취소선**: ~(Tilde)를 2번 사용해요. `~~이렇게 쓰면 돼요.~~` 그러면 ~~이렇게 나와요.~~
- **밑줄**: 마크다운에서 지원하지 않아서 html 태그를 써야 해요. `<u>이렇게 쓰면 돼요.</u>` 그러면 <u>이렇게 나와요.</u>

## 목록 예시에요

`<ol>`, `<ul>`, `<li>`, 태그로 변환되는 목록을 그려줘요.

`1.`을 붙이면 순서가 있는 목록으로 변환하고 `-`을 붙이면 순서가 없는 목록으로 변환해줘요.

1. 순서가 있는 목록
1. 계속 `1.`으로 시작해도
1. 알아서 순서를 맞춰줘요.
   1. 들여쓰기가 2칸이 아니라 3칸 이상일 수도 있어요.

- 순서가 없는 목록
- 이렇게 작성하면 되는데
- `1.`도 마찬가지지만 바로 붙여서 쓰면 안 돼요. -그러면 이렇게 나와요.

## 링크 예시에요

`[표시할 텍스트](URL)` 형식으로 링크를 넣어요.\
`[표시할 텍스트](URL "설명")` 처럼 마우스를 올렸을 때 보이는 설명도 추가할 수 있어요.

```md title="링크 예시"
[Astro 공식 문서](https://docs.astro.build)
[Astro 공식 문서](https://docs.astro.build "Astro Docs")
```

[Astro 공식 문서](https://docs.astro.build)\
[Astro 공식 문서](https://docs.astro.build "Astro Docs")

새 탭에서 열리게 하려면 마크다운 문법만으로는 안 되고 HTML 태그를 써야 해요.

```html title="새 탭에서 열기"
<a href="https://docs.astro.build" target="_blank" rel="noopener noreferrer">
  Astro 공식 문서 (새 탭)
</a>
```

<a href="https://docs.astro.build" target="_blank" rel="noopener noreferrer">Astro 공식 문서 (새 탭)</a>

## 이미지 예시에요

`![대체 텍스트](이미지 경로)` 형식으로 이미지를 삽입해요.\
링크 문법 앞에 `!`만 붙이면 돼요.

```md title="이미지 예시"
![Astro 로고](/images/astro-logo.png)
![Astro 로고](/images/astro-logo.png "Astro Logo")
```

이미지 파일은 `public/` 폴더 안에 넣으면 `/이미지경로` 형식으로 접근할 수 있어요.\
`public/images/photo.png` 파일이라면 `/images/photo.png`로 쓰면 돼요.

이미지 크기 조절은 마크다운에서 지원하지 않아서 HTML 태그를 써야 해요.

```html title="이미지 크기 조절"
<img src="/images/photo.png" alt="사진 설명" width="400" />
```

가운데 정렬도 마찬가지로 HTML을 써야 해요.

```html title="이미지 가운데 정렬"
<div style="text-align: center;">
  <img src="/images/photo.png" alt="사진 설명" width="400" />
</div>
```

## 인용문 예시에요

`>`(꺾쇠) 기호를 사용해요. `> 이렇게 쓰면 돼요.` 그러면 아래처럼 나와요.

> 인용문은 이렇게 생겼어요.

중첩 인용문도 만들 수 있어요. `>`를 여러 개 붙이면 돼요.

> 첫 번째 인용문이에요.
>
> > 두 번째로 들여쓴 인용문이에요.
> >
> > > 세 번째까지도 가능해요.

인용문 안에서도 마크다운 문법을 그대로 쓸 수 있어요.

> **이렇게 굵게** 하거나 _이탤릭체_ 도 쓸 수 있고\
> 목록도 넣을 수 있어요.
>
> - 항목 하나
> - 항목 둘

## 표 예시에요

`|`(파이프) 기호와 `-`(하이픈)을 조합해서 표를 만들어요.\
헤더 행과 구분선 행은 필수이고, 각 열의 너비는 자동으로 맞춰줘요.

```md title="표 예시"
| 이름   | 역할       | 비고       |
| ------ | ---------- | ---------- |
| 홍길동 | 프론트엔드 | React 담당 |
| 김철수 | 백엔드     | Node 담당  |
```

그러면 이렇게 나와요.

| 이름   | 역할       | 비고       |
| ------ | ---------- | ---------- |
| 홍길동 | 프론트엔드 | React 담당 |
| 김철수 | 백엔드     | Node 담당  |

`:` 콜론으로 열 정렬도 설정할 수 있어요.

| 왼쪽 정렬 | 가운데 정렬 | 오른쪽 정렬 |
| :-------- | :---------: | ----------: |
| left      |   center    |       right |

## 코드 예시에요

\` 백틱 기호를 사용해요. `` `이렇게 사용하면 돼요.` ``\
코드블록은 \`\`\` 3개를 연속해서 사용하고 시작과 끝에 각각 사용해줘요.

```ts title="예시"
function sayHi() {
  console.log("hello world!")
}
```

## HTML 태그 직접 사용 예시에요

마크다운이 지원하지 않는 스타일은 HTML 태그를 직접 써도 돼요.\
위에서 밑줄 예시로 `<u>` 태그를 사용한 것처럼요.

자주 쓰는 것들을 몇 가지 소개할게요.

**글자 색상 바꾸기** — `style` 속성으로 색을 지정해요.

```html title="글자 색상"
<span style="color: #f87171;">빨간색 글자</span>
<span style="color: #60a5fa;">파란색 글자</span>
```

<span style="color: #f87171;">빨간색 글자</span>\
<span style="color: #60a5fa;">파란색 글자</span>

**줄바꿈** — `<br>` 태그로 강제 줄바꿈을 넣을 수 있어요. 역슬래시 `\`와 같은 역할이에요.

**가로줄** — `<hr>` 태그나 `---`(하이픈 3개)로 구분선을 넣을 수 있어요.

---

**글자 크기** — `<small>` 태그로 작은 글씨를 표현할 수 있어요.

<small>이렇게 작은 글씨로 보충 설명을 달 수 있어요.</small>
