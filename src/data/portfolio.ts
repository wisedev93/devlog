/**
 * Portfolio 데이터.
 *
 * /portfolio 는 "링크 공유 전용" 페이지입니다.
 * - 헤더 메뉴에 노출하지 않고, 홈의 HeroTerminal 안에서만 링크합니다.
 * - <meta name="robots" content="noindex"> + sitemap 제외 + pagefind 미색인.
 *
 * 프로젝트를 추가하려면 이 배열에 항목 하나를 더하고,
 * 스크린샷은 public/portfolio/<slug>/ 아래에 webp 로 둡니다.
 * (고객사 내부 화면이므로 실명·연락처·사업자번호 등은 반드시 마스킹 후 추가)
 */

export type Shot = {
  src: string;
  caption: string;
  /** 모바일 세로 화면이면 true — 갤러리에서 좁은 카드로 렌더 */
  mobile?: boolean;
};

export type ShotGroup = {
  title: string;
  description?: string;
  shots: Shot[];
};

export type Metric = { label: string; before?: string; after: string };

export type Section = { title: string; body: string[] };

export type Project = {
  slug: string;
  title: string;
  subtitle: string;
  client: string;
  period: string;
  role: string;
  team?: string;
  status: "ongoing" | "terminated" | "operation";
  stack: string[];
  summary: string;
  cover?: string;
  metrics: Metric[];
  sections: Section[];
  groups: ShotGroup[];
  /** 시연 영상. title 을 비우면 "시연 영상" 으로 표시 */
  video?: { title?: string; src: string; poster: string; caption: string };
  /** 관련 블로그 글의 id (src/data/blog/<id>.md). 제목·설명은 컬렉션에서 읽어옴 */
  posts?: string[];
};

const p = (slug: string, name: string) => `/portfolio/${slug}/${name}.webp`;

export const projects: Project[] = [
  {
    slug: "evdw",
    title: "현대자동차 × 오믈렛 — AI Agent 충전 인프라 플랫폼",
    subtitle:
      "현대자동차 · 오믈렛 협업 / 아론은 충전 인프라 도메인 파트너로 참여",
    client: "현대자동차",
    period: "2026.08 ~ 현재",
    role: "웹 프론트엔드 (디자인 시스템 · 채팅 · 지도 · 인증/BFF)",
    status: "ongoing",
    stack: [
      "Next.js 15",
      "React 19",
      "Tailwind v4",
      "Base UI",
      "Storybook",
      "Auth.js (OIDC)",
      "SSE",
      "Naver Maps",
      "H3",
      "Recharts",
      "Mermaid",
    ],
    summary:
      "충전 실패 이력 분석부터 신규 입지 분석까지, 운영자가 자연어로 묻고 AI Agent가 차트·지도·표로 답하는 충전 인프라 CMS입니다. 답변 화면, 관제 지도, 디자인 시스템, 인증 구조를 맡았습니다.",
    cover: p("evdw", "overview"),
    metrics: [
      { label: "전역 CSS", before: "1,342줄", after: "733줄" },
      {
        label: "ChatApp 분할",
        before: "1,468줄 단일 파일",
        after: "화면 틀 + 컴포넌트·훅",
      },
      { label: "브라우저 직접 fetch", before: "14곳", after: "0곳" },
    ],
    sections: [
      {
        title: "서버 주도 UI",
        body: [
          "모델이 답변 안에 chart · map · mermaid · choices 같은 블록을 '이름 + 데이터'로 내려주면, 브라우저에서 화이트리스트로 디스패치해 미리 만들어 둔 컴포넌트로 렌더합니다.",
          "HTML 주입이나 rehype-raw를 쓰지 않아 LLM 출력이 DOM이 되지 않고(XSS 차단), 스트리밍 중 덜 닫힌 블록은 자리표시자로 그려 깜빡임을 없앴습니다.",
          "같은 렌더러를 대시보드에서도 쓰기 때문에, 답변 속 차트·표를 드래그하면 그대로 커스텀 대시보드 카드가 됩니다.",
          "표준 프로토콜(AG-UI)도 일부 기능에 먼저 붙여 봤지만 BE 일정 문제로 철회했습니다. 처음부터 어댑터 경계를 나눠 둬서 되돌리는 비용은 거의 없었습니다.",
        ],
      },
      {
        title: "OIDC + BFF — 브라우저에 토큰을 두지 않는다",
        body: [
          "Auth.js(Casdoor OIDC)로 로그인하고, access/refresh 토큰은 httpOnly 쿠키에만 둡니다. 만료 30초 전 서버가 갱신합니다.",
          "모든 API 호출은 같은 origin의 /api/backend/** 로 보내고 Next.js 서버가 Bearer를 붙여 중계합니다. SSE는 버퍼링 없이, multipart는 바이트 그대로 넘기고, 요청 헤더 17종 차단 / 응답 헤더 10종 허용 목록으로 경계를 좁혔습니다.",
        ],
      },
      {
        title: "Figma ➜ 토큰 ➜ Storybook 디자인 시스템",
        body: [
          "Figma 변수를 3계층 토큰으로 옮기고 Tailwind v4 + Base UI 위에 컴포넌트를 올렸습니다. 나눠져 있던 color token을 하나로 합치는 과정에서 타입체크·컴파일을 통과하던 UI 버그 9건을 찾아 고쳤습니다.",
          "컴포넌트 갤러리는 Storybook으로 이관해 단위별로 확인합니다.",
        ],
      },
      {
        title: "네이버 지도 + H3 집계 관제",
        body: [
          "deck.gl·MapLibre 기반 관제 지도를 네이버 지도로 옮기면서 H3 육각형(면)이 마커(점)로 바뀌었습니다. 셀 중심 좌표가 그대로 마커 위치가 되자 바다 한복판에 마커가 찍히는 문제가 생겼고(res4 기준 최대 22km 오차), 실측 근거를 정리해 BE와 좌표 계약을 '셀 중심 ➜ 셀 내 충전기 centroid'로 바꿨습니다.",
        ],
      },
    ],
    groups: [
      {
        title: "구조",
        description:
          "진행 중인 고객사 프로젝트라 실제 화면은 흐리게 처리했습니다. 대신 직접 설계한 구조를 그림으로 정리했습니다.",
        shots: [
          {
            src: p("evdw", "arch-sdui"),
            caption: "서버 주도 UI — LLM 답변이 화면이 되는 경로",
          },
          {
            src: p("evdw", "arch-bff"),
            caption: "OIDC + BFF — 브라우저에 토큰을 두지 않는 구조",
          },
        ],
      },
      {
        title: "AI 답변 화면",
        description:
          "자연어 질문 ➜ 도구 실행 ➜ 차트·표·지도·다이어그램으로 응답",
        shots: [
          { src: p("evdw", "overview"), caption: "채팅 + 전국 관제 지도" },
          {
            src: p("evdw", "streaming"),
            caption: "스트리밍 중 — 블록 자리표시자와 중지 버튼",
          },
          { src: p("evdw", "answer-chart"), caption: "답변 속 막대 차트 + 표" },
          { src: p("evdw", "answer-pie"), caption: "답변 속 파이 차트" },
          {
            src: p("evdw", "answer-map"),
            caption: "신규 입지 후보 — 답변 속 네이버 지도",
          },
          {
            src: p("evdw", "answer-mermaid"),
            caption: "충전 실패 처리 흐름 — Mermaid 시퀀스",
          },
          {
            src: p("evdw", "answer-choices"),
            caption: "선택지 버튼으로 되묻기",
          },
          { src: p("evdw", "thinking"), caption: "응답 대기 상태" },
        ],
      },
      {
        title: "대시보드 · 관제 지도",
        shots: [
          {
            src: p("evdw", "dashboard"),
            caption: "답변에서 고정한 카드로 만든 커스텀 대시보드",
          },
          {
            src: p("evdw", "dashboard-dark"),
            caption: "커스텀 대시보드 — 다크",
          },
          {
            src: p("evdw", "map-nationwide"),
            caption: "전국 — H3 집계 클러스터",
          },
          {
            src: p("evdw", "map-seoul"),
            caption: "수도권 — 줌에 따라 해상도 전환",
          },
          {
            src: p("evdw", "map-street"),
            caption: "거리 단위 — 충전소별 마커",
          },
        ],
      },
      {
        title: "디자인 시스템 · 설정",
        shots: [
          {
            src: p("evdw", "sb-tokens"),
            caption: "Storybook — 시맨틱 컬러 토큰",
          },
          {
            src: p("evdw", "sb-button"),
            caption: "Storybook — Button variant × state",
          },
          { src: p("evdw", "sb-charts"), caption: "Storybook — 차트 갤러리" },
          {
            src: p("evdw", "sb-fields"),
            caption: "Storybook — 입력 필드 상태",
          },
          { src: p("evdw", "sb-errors"), caption: "Storybook — 에러 카드" },
          { src: p("evdw", "overview-dark"), caption: "다크 테마" },
          { src: p("evdw", "settings"), caption: "설정 모달 — 테마" },
          { src: p("evdw", "session-search"), caption: "세션 검색 (⌘K)" },
        ],
      },
    ],
  },
  {
    slug: "chargemate-csms",
    title: "ChargeMate 2.0 — CSMS 전면 고도화",
    subtitle:
      "코드베이스가 AI 하네스다 — BE·기획·디자이너가 AI로 화면을 만드는 구조",
    client: "아론",
    period: "2026.01 ~ 현재",
    role: "FE 리드 · 2026.03~ AI 산출물 기능/디자인 QA 겸임",
    status: "operation",
    stack: [
      "React 19",
      "Vite",
      "TypeScript",
      "TanStack Query",
      "Zod",
      "shadcn/ui",
      "Tailwind v4",
      "Figma MCP",
      "Claude Code",
      "OCPP 1.6",
    ],
    summary:
      "FE 리소스가 부족해 API가 끝나도 화면을 기다리는 병목이 반복됐습니다. 모델을 바꾸는 대신 '결정할 것'을 줄이는 쪽으로 코드베이스를 표준화해, FE 경험이 거의 없는 BE 개발자도 타입 파일만 쓰면 페이지가 나오는 구조를 만들었습니다.",
    cover: p("chargemate-csms", "station-drawer"),
    metrics: [
      { label: "운영 규모", after: "충전소 24곳 · 충전기 94기" },
      { label: "월 평균 충전", after: "1,200건+" },
      {
        label: "화면 개발 리드타임",
        before: "BE 2일 + FE 2일",
        after: "BE 혼자 1일 (팀 회고 기준)",
      },
      {
        label: "페이지 제작",
        before: "첫 참조 페이지 3주",
        after: "최근 페이지 2일",
      },
      {
        label: "페이지당 데이터 계층 (CRUD 팩토리)",
        before: "144줄",
        after: "59줄",
      },
      { label: "공용 컴포넌트", before: "17개", after: "46개" },
      {
        label: "두 달간 신규 페이지 (BE 경력 팀원 작성)",
        after: "11개 중 9개가 같은 구조",
      },
      { label: "동시 담당 프로젝트", after: "4개" },
    ],
    sections: [
      {
        title: "결정을 줄이는 표준",
        body: [
          "보이는 것: Figma ↔ 컴포넌트 매핑표와 shadcn 기반 '소유하는' 컴포넌트. TablePageLayout · FilterLayout · FormModal · FormDrawer 같은 페이지 골격으로 '이 UI는 무엇을 쓴다'를 미리 정해 둡니다.",
          "보이지 않는 것: type 파일로 필드명·엔드포인트를 먼저 확정해 추측할 여지를 없앱니다.",
          "절차: createCrudApi / createCrudHooks 팩토리가 쿼리 무효화·Zod 응답 검증·토스트를 감춥니다. 페이지는 type만 쓰면 나머지가 따라옵니다.",
        ],
      },
      {
        title: "AI가 읽는 문서",
        body: [
          "CLAUDE.md에 규칙과 '왜'를 함께 적고, /new-page · /add-api · /add-filter · /figma-impl 스킬(608줄)로 절차를 고정했습니다. 보이지 않는 API 스펙은 추측 대신 질문하게 했습니다.",
          "AI 생성 UI가 커스터마이징에서 막히는 지점은 Compound Component · Render Props 패턴(FormDrawer가 편집 모드를 소유하고 children에 주입)으로 풀었습니다.",
        ],
      },
      {
        title: "실제 충전기 없이 테스트한다 — OCPP 1.6 시뮬레이터",
        body: [
          "충전 기능은 실제 충전기 없이는 검증하기 어렵습니다. WebSocket으로 CSMS에 붙는 OCPP 1.6 충전기 시뮬레이터를 직접 만들어, 여러 대를 동시에 띄우고 Boot · Heartbeat · Start/StopTransaction · MeterValues를 보낼 수 있게 했습니다.",
          "Remote Start/Stop 요청에 수락·거부를 골라 응답하고 응답 대기·자동 진행을 켜고 끌 수 있어, '요청은 받았지만 시작은 안 된' 같은 예외 상황도 재현합니다. 앱 충전 플로우, 웹 관제 등 모든 서비스 전반의 테스트에 씁니다.",
        ],
      },
      {
        title: "역할의 변화",
        body: [
          "2026.03부터는 FE 개발과 함께 BE·기획자·디자이너가 AI로 만든 코드와 화면의 기능·디자인 QA, 디테일 보완을 맡고 있습니다. 직접 구현보다 표준을 유지하고 공용 요소를 승격하는 데 시간을 쓰면서 동시에 4개 프로젝트를 담당합니다.",
        ],
      },
    ],
    groups: [
      {
        title: "같은 표준으로 만든 페이지들",
        description:
          "목록 · 필터 · 드로어 · 모달이 페이지마다 같은 골격을 공유합니다",
        shots: [
          {
            src: p("chargemate-csms", "station-list"),
            caption: "충전소 관리 — 참조 페이지",
          },
          {
            src: p("chargemate-csms", "station-drawer"),
            caption: "FormDrawer — 상세 보기",
          },
          {
            src: p("chargemate-csms", "station-drawer-edit"),
            caption: "FormDrawer — 같은 드로어의 편집 모드",
          },
          {
            src: p("chargemate-csms", "station-create"),
            caption: "FormModal — 등록",
          },
          { src: p("chargemate-csms", "client-list"), caption: "고객사 관리" },
          { src: p("chargemate-csms", "card-list"), caption: "충전카드 관리" },
          { src: p("chargemate-csms", "charger-list"), caption: "충전기 관리" },
          { src: p("chargemate-csms", "empty-state"), caption: "빈 상태 표준" },
        ],
      },
      {
        title: "모니터링 · 정산 · 운영",
        shots: [
          { src: p("chargemate-csms", "dashboard"), caption: "대시보드" },
          {
            src: p("chargemate-csms", "charging-history"),
            caption: "충전 내역",
          },
          { src: p("chargemate-csms", "revenue"), caption: "매출 집계" },
          {
            src: p("chargemate-csms", "price-policy"),
            caption: "요금 관리 — 계시별 요금",
          },
          {
            src: p("chargemate-csms", "maintenance"),
            caption: "유지보수 관리",
          },
          {
            src: p("chargemate-csms", "maintenance-drawer"),
            caption: "유지보수 상세 + 대응 이력",
          },
        ],
      },
      {
        title: "테스트 도구",
        description:
          "직접 만든 OCPP 1.6 충전기 시뮬레이터 — 앱·웹·관제 어디서든 실제 충전기 없이 충전 시나리오를 재현합니다",
        shots: [
          {
            src: p("chargemate-csms", "charger-simulator"),
            caption:
              "OCPP 1.6 충전기 시뮬레이터 — 다중 충전기, Remote Start/Stop 응답 제어, 제조사 특화 메시지",
          },
        ],
      },
    ],
    posts: ["codebase-is-harness", "factory-in-react"],
  },
  {
    slug: "chargemate-app",
    title: "ChargeMate 유저 앱 2.0 — Flutter ➜ React Native",
    subtitle:
      "FE 코드 베이스를 React/TypeScript 하나로 — 배포된 상태로 코드베이스 변경",
    client: "아론",
    period: "2026.07 ~ 2026.09",
    role: "리드 — 전환 판단·개발 환경 세팅·리딩·구현 보조·코드 리뷰, 최종 기능 디테일·디자인 QA",
    team: "FE를 몰랐던 시니어 BE 1 (구현 전담) + 리드",
    status: "operation",
    stack: [
      "React Native 0.81",
      "Expo 54",
      "Expo Router",
      "NativeWind",
      "TanStack Query",
      "Zustand",
      "EAS",
      "Figma MCP",
      "Mixpanel",
    ],
    summary:
      "Flutter 앱을 React Native로 다시 만들어 웹 CSMS와 언어·컨벤션·API 레이어 규칙을 통일하고 배포에서 자유로워졌습니다. CSMS에서 쓰던 '하네스' 방식을 그대로 가져와 FE를 몰랐던 시니어 BE 개발자가 구현을 전담하고, 리드는 개발 환경 세팅·리뷰·마지막 디테일을 맡았습니다.",
    cover: p("chargemate-app", "cover"),
    metrics: [
      {
        label: "사용자",
        after: "누적 가입 약 1,500명 · MAU 400~500명 · DAU 40~50",
      },
      { label: "출시", after: "v2.0.0 iOS · Android" },
      { label: "충전 플로우", after: "11단계 (실패·타임아웃 분기 포함)" },
      {
        label: "구현 담당",
        after: "시니어 BE 전담 / 리드는 세팅·리뷰·디테일",
      },
    ],
    sections: [
      {
        title: "교체 배포",
        body: [
          "Flutter 앱은 CS 대응으로 분기를 하나 추가할 때마다 양쪽 스토어 심사를 기다려야 해서, 사용자 반응을 보고 빠르게 고칠 수 없었습니다. 이게 RN 전환의 근거였습니다.",
          "새 앱이 아니라 기존 Flutter 앱을 같은 번들 ID로 올렸습니다. 빌드 번호는 EAS remote versioning에 맡기고, JS 수정은 OTA 채널로 내보냅니다. 이제 배포가 더 자유로워 졌습니다.",
        ],
      },
      {
        title: "충전 플로우",
        body: [
          "충전 시작·종료 요청의 성공 응답은 '충전기가 요청을 받았다'일 뿐 '시작됐다'가 아니라서, 확정은 폴링으로 합니다. 취소·대기 시간 만료·시작 실패를 각각 다른 화면으로 분기합니다. CS 건수는 그대로였지만, 사용자가 어떤 화면을 봤는지 말할 수 있게 되면서 접수 단계에서 원인 분류가 가능해졌습니다.",
          "Kakao·Naver·Apple 소셜 로그인, FCM 푸시, Bootpay 카드 등록을 붙였습니다.",
        ],
      },
      {
        title: "데이터로 가입 플로우 고치기",
        body: [
          "처음 기획할 때는 '첫 사용자는 대부분 충전하러 온 사람이고, 어차피 카드가 필요하다'는 논리로 카드 등록을 회원가입 필수 단계에 넣었습니다. 그런데 GA4에서 가입 플로우에 쌓이는 로그가 다음 단계보다 눈에 띄게 적은 게 보여, 카드 등록을 첫 충전 직전으로 옮기자고 제안했습니다.",
          "GA4로는 어디서 줄었는지까지만 보이고 사용자 흐름을 따라갈 수 없어 Mixpanel로 교체했습니다. 도구 선택과 기획자와의 이벤트 설계, 리뷰를 맡았습니다. 지금은 충전 시작 시점의 카드 등록 단계에서 약 30%가 이탈하는 게 보이고, 이 구간을 다음 과제로 추적하고 있습니다.",
          "이벤트 설계서를 타입으로 옮겨 설계서에 없는 이벤트 이름은 컴파일 에러가 나게 했고, 지표를 오염시키는 계측 결함(QR 실패 중복 발송 등)은 전수 조사해 목록으로 관리합니다.",
        ],
      },
      {
        title: "AI로 빠르게 개발하는 구조",
        body: [
          "Figma MCP로 시안을 읽어 RN 코드로 옮기는 절차를 컴포넌트 매핑표·RN 함정 목록과 함께 스킬로 정리하고, 스터디와 리뷰로 리딩했습니다.",
        ],
      },
    ],
    video: {
      title: "실제 충전 흐름",
      src: "/portfolio/chargemate-app/charging-flow.mp4",
      poster: "/portfolio/chargemate-app/charging-flow-poster.jpg",
      caption:
        "충전기 번호 입력 ➜ 결제수단 선택 ➜ 충전 중 ➜ 종료 ➜ 완료. 직접 만든 OCPP 시뮬레이터로 충전기 응답을 재현했습니다.",
    },
    groups: [
      {
        title: "주요 화면",
        shots: [
          {
            src: p("chargemate-app", "login"),
            caption: "소셜 로그인",
            mobile: true,
          },
          {
            src: p("chargemate-app", "home"),
            caption: "홈 — QR 스캔",
            mobile: true,
          },
          {
            src: p("chargemate-app", "charging-before"),
            caption: "충전 시작 대기",
            mobile: true,
          },
          {
            src: p("chargemate-app", "charging-done"),
            caption: "충전 완료",
            mobile: true,
          },
          {
            src: p("chargemate-app", "history"),
            caption: "충전 내역",
            mobile: true,
          },
          {
            src: p("chargemate-app", "my-page"),
            caption: "마이페이지",
            mobile: true,
          },
          {
            src: p("chargemate-app", "notifications"),
            caption: "알림 (FCM)",
            mobile: true,
          },
        ],
      },
      {
        title: "예외 분기",
        shots: [
          {
            src: p("chargemate-app", "charging-canceled"),
            caption: "충전 취소",
            mobile: true,
          },
          {
            src: p("chargemate-app", "charging-timeout"),
            caption: "대기 시간 만료",
            mobile: true,
          },
          {
            src: p("chargemate-app", "charging-failed"),
            caption: "시작 실패",
            mobile: true,
          },
        ],
      },
      {
        title: "결제 수단 등록",
        shots: [
          {
            src: p("chargemate-app", "payment-terms"),
            caption: "약관 동의",
            mobile: true,
          },
          {
            src: p("chargemate-app", "payment-card"),
            caption: "카드 정보 입력",
            mobile: true,
          },
          {
            src: p("chargemate-app", "payment-registering"),
            caption: "등록 중",
            mobile: true,
          },
        ],
      },
    ],
  },
  {
    slug: "sg-csms",
    title: "SG생활안전 · 카카오모빌리티 통합 CSMS",
    subtitle: "3사 협업 SaaS형 CSMS — 충전 인프라 + 유저·결제 연동",
    client: "SG생활안전 × 카카오모빌리티",
    period: "2025.04 ~ 현재",
    role: "FE 리드 (사내 FE 2명 + 외부 프리랜서) · 유지보수 · 운영 · 신규 개발",
    status: "operation",
    stack: [
      "React 19",
      "Vite",
      "TypeScript",
      "TanStack Query",
      "shadcn/ui",
      "Tailwind v4",
      "Kakao Maps",
      "Recharts",
      "AWS ECS Fargate",
    ],
    summary:
      "SG생활안전 충전 인프라에 카카오모빌리티 유저·결제를 연동한 멀티테넌트 CSMS입니다. RBAC 구조와 운영 화면을 만들고, 10만 줄 규모의 코드베이스 품질을 AI 하네스로 끌어올렸습니다.",
    cover: p("sg-csms", "station-detail"),
    metrics: [
      { label: "운영 규모", after: "충전소 253곳 · 충전기 1,411기" },
      { label: "월 평균 충전", after: "15만 건+ (카카오모빌리티 앱 포함)" },
      { label: "any", before: "328", after: "34 (-90%)" },
      { label: "테스트", before: "1 케이스", after: "48 케이스" },
      { label: "ESLint", before: "실행 불가", after: "정상" },
      { label: "배포 시간", before: "20분", after: "10분 · 무중단" },
    ],
    sections: [
      {
        title: "멀티테넌트 · RBAC",
        body: [
          "SG 어드민 · 고객사 어드민 · 위탁운영사 · 유지보수 등 소속과 권한에 따라 보이는 메뉴와 데이터가 달라지는 구조를 설계했습니다.",
        ],
      },
      {
        title: "레거시에 AI를 투입하기까지",
        body: [
          "설정 오류로 ESLint조차 돌지 않던 코드베이스에서, 먼저 가드레일(린트·테스트·네이밍)을 세우고 그 위에서 AI로 리팩토링했습니다. any 328➜34, console 385➜187, 1,000줄 넘는 파일 3➜1개, 카카오맵 SDK 타입 선언으로 unsafe 에러 275➜0.",
          "제가 관리하던 코드에서 ESLint가 꺼진 걸 놓친 데서 시작된 일이라, 재발은 구조로 막았습니다. CI에서 lint·테스트가 실패하면 머지가 되지 않습니다.",
        ],
      },
      {
        title: "무중단 배포",
        body: [
          "ECR + ECS Fargate Blue/Green 배포로 배포 시간을 20분➜10분으로 줄이고, 시간대 제약 없이 배포합니다.",
        ],
      },
    ],
    groups: [
      {
        title: "관제 · 리포트",
        shots: [
          {
            src: p("sg-csms", "station-map"),
            caption: "전국 충전소 맵 + 금월 매출",
          },
          {
            src: p("sg-csms", "station-detail"),
            caption: "충전소 상세 — 상태·부하별 충전량",
          },
          { src: p("sg-csms", "report"), caption: "월간 분석 리포트" },
          {
            src: p("sg-csms", "report-tou"),
            caption: "리포트 — 시간대(TOU) 분포·주간 사용",
          },
          {
            src: p("sg-csms", "report-vehicle"),
            caption: "리포트 — 차량별 부하 사용",
          },
        ],
      },
      {
        title: "운영",
        shots: [
          {
            src: p("sg-csms", "charging-history"),
            caption: "충전 내역 (38만 건)",
          },
          { src: p("sg-csms", "charger-list"), caption: "충전기 관리" },
          { src: p("sg-csms", "charger-detail"), caption: "충전기 상세" },
          {
            src: p("sg-csms", "role"),
            caption: "계정 권한 관리 (개인정보 마스킹)",
          },
          { src: p("sg-csms", "b2b-pricing"), caption: "B2B 요금제" },
          { src: p("sg-csms", "repair-list"), caption: "고장 관리" },
          { src: p("sg-csms", "repair-form"), caption: "고장 등록·수정" },
        ],
      },
    ],
    posts: ["agent-harness-for-legacy", "agent-harness-refactor-measured"],
  },
  {
    slug: "csms-nextjs",
    title: "CSMS 웹 — Next.js 리빌드",
    subtitle: "CSR(React) ➜ SSR(Next.js 14 App Router) 마이그레이션",
    client: "아론",
    period: "2024.09 ~ 2024.10",
    role: "FE 리드",
    status: "terminated",
    stack: ["Next.js 14", "React", "TypeScript"],
    summary:
      "회사 소개·문의 페이지와 서비스를 한 코드베이스로 관리하면서, 공개 페이지 SEO와 URL 기반 다국어(i18n) 라우팅을 위해 OCPP CSMS를 CSR(React)에서 Next.js 14 App Router로 옮겼습니다. 라우트 그룹으로 나눠 공개 페이지는 정적 HTML로 S3·CloudFront(루트 도메인)에, 서비스는 서브도메인으로 따로 배포합니다. 체감 속도 문제도 있어 전환 전후를 같은 조건으로 측정했습니다.",
    metrics: [
      { label: "TBT (Mobile·4G)", before: "4,100ms", after: "0~50ms" },
      { label: "의존성 · 번들", after: "-39% · ~84KB 절감" },
    ],
    sections: [],
    groups: [],
  },
];

export const getProject = (slug: string) => projects.find(x => x.slug === slug);
