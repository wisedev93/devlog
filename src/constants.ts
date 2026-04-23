import type { Props } from "astro";
import IconMail from "@/assets/icons/IconMail.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

// =============================================================================
// SOCIALS — 헤더/푸터에 노출되는 링크
// -----------------------------------------------------------------------------
// 사용하지 않는 항목은 배열에서 지워도 됩니다. 최소 GitHub / Mail만 남기고
// 나머지는 제거하는 것을 추천합니다.
// =============================================================================
export const SOCIALS: Social[] = [
  {
    name: "GitHub",
    // TODO[PLACEHOLDER]: 본인 GitHub 프로필 URL
    href: "https://github.com/your-username",
    linkTitle: `${SITE.title} on GitHub`,
    icon: IconGitHub,
  },
  {
    name: "LinkedIn",
    // TODO[PLACEHOLDER]: 본인 LinkedIn URL. 안 쓰면 이 객체 통째로 삭제.
    href: "https://www.linkedin.com/in/your-username/",
    linkTitle: `${SITE.title} on LinkedIn`,
    icon: IconLinkedin,
  },
  {
    name: "Mail",
    // TODO[PLACEHOLDER]: 본인 이메일
    href: "mailto:you@example.com",
    linkTitle: `Send an email to ${SITE.title}`,
    icon: IconMail,
  },
] as const;

export const SHARE_LINKS: Social[] = [
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `Share this post via email`,
    icon: IconMail,
  },
] as const;
