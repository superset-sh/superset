/**
 * App Layout Configuration
 *
 * shadcn-studio application-shell variant 선택
 * packages/ui/src/components/shadcn-studio/blocks/ 의 variant에 대응
 */

export type AppShellVariant = 1 | 2 | 7 | "agent";

export const layoutConfig = {
  /**
   * Application Shell variant 번호
   * - 1: 심플 사이드바 레이아웃
   * - 2: 고급 다중 메뉴 + 플로팅 헤더 레이아웃
   * - 7: 뮤트 배경 + 사이드바 풋터 레이아웃
   * - "agent": 에이전트 중심 3탭 레이아웃 (Claude Desktop 스타일)
   */
  appShellVariant: "agent" as AppShellVariant,
} as const;
