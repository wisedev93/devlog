/**
 * Labs 메타데이터.
 *
 * 새 lab 을 추가하려면:
 *   1) src/islands/<Name>Lab.tsx       — Preact island 컴포넌트
 *   2) src/pages/labs/<slug>.astro     — LabLayout 으로 감싼 개별 페이지
 *   3) 이 배열에 한 항목 추가
 *
 * index.astro 의 카드 그리드는 이 배열만 읽어서 자동으로 갱신됩니다.
 */

export type LabStatus = "live" | "draft" | "wip";

export type LabMeta = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  /** 관련 블로그 글의 URL. 없으면 생략 가능. */
  post?: string;
  pubDate: Date;
  status?: LabStatus;
};

export const labs: LabMeta[] = [
  {
    slug: "upload-timeline",
    title: "Parallel upload timeline",
    summary:
      "사진 N장을 순차로 올릴 때와 Promise.all로 병렬로 올릴 때의 시간을, 핸드셰이크(고정 비용)와 전송(대역폭 공유)으로 쪼개 비교하는 인터랙티브. 병렬이 왜 장수만큼 빨라지지 않는지 슬라이더로 직접 확인합니다.",
    tags: ["upload", "performance", "concurrency"],
    post: "/posts/direct-to-storage-upload",
    pubDate: new Date("2026-05-28T12:00:00+09:00"),
    status: "live",
  },
  {
    slug: "silent-form-validation",
    title: "Silent form failure",
    summary:
      "UI · Schema · DB 세 레이어가 같은 데이터를 다루는데 각자의 룰로 진화하면 어떤 일이 벌어지는지, '기타' 칩 하나로 재현해보는 인터랙티브",
    tags: ["form", "zod", "validation"],
    post: "/posts/silent-form-validation",
    pubDate: new Date("2026-05-14T10:00:00+09:00"),
    status: "live",
  },
];

export function getLab(slug: string): LabMeta | undefined {
  return labs.find(l => l.slug === slug);
}

export function getSortedLabs(): LabMeta[] {
  return [...labs].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}
