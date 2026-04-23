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

  // TODO[PLACEHOLDER]: 저자 표시명 (푸터, OG 태그에 사용)
  author: "Your Name",

  // TODO[PLACEHOLDER]: 외부 프로필 URL (개인 사이트, GitHub 등). 없으면 홈 URL.
  profile: "https://example.com/",

  // TODO[PLACEHOLDER]: 한 줄 소개 (SEO description, OG description)
  desc: "블로그 소개 입니다.",

  // TODO[PLACEHOLDER]: 브라우저 탭 / OG에 노출되는 사이트 타이틀
  title: "Dev Blog",

  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes

  showArchives: true,
  showBackButton: true,

  dynamicOgImage: true,
  dir: "ltr",
  lang: "ko", // 한국어 블로그
  timezone: "Asia/Seoul",
} as const;
