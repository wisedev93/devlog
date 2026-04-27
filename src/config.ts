// =============================================================================
// SITE CONFIG
// -----------------------------------------------------------------------------
// 블로그 오픈 전에 반드시 수정해야 하는 값들을 PLACEHOLDER로 표시했습니다.
// 커스텀 도메인을 연결한 뒤 website 값만 바꾸면 OG / sitemap / canonical URL이
// 전부 자동으로 맞춰집니다.
// =============================================================================
export const SITE = {
  // TODO[PLACEHOLDER]: 배포 도메인으로 교체 (https://로 끝, 슬래시 포함)
  //   로컬 개발 중엔 Vercel 기본 도메인(e.g. https://my-blog.vercel.app/) 써도 됨
  website: "https://example.com/",

  author: "jaehyun um",

  profile: "https://github.com/wisedev93",

  desc: "코드보다 오래 남는 건 그 코드를 쓰게 만든 판단과 이야기라고 믿어, 일하며 배운 것, 읽으며 떠오른 것, 가끔의 회고, 그리고 그 사이에 남은 생각을 기록합니다.",

  title: "Devlog",

  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes

  showArchives: true,
  showBackButton: true,

  dynamicOgImage: true,
  dir: "ltr",
  lang: "ko",
  timezone: "Asia/Seoul",
} as const;
