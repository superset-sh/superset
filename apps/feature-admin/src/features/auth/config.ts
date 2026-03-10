/**
 * Auth Feature UI Configuration
 *
 * shadcn-studio blocks variant 선택 (1~5)
 * packages/ui/src/components/shadcn-studio/blocks/ 의 variant에 대응
 */

export type AuthUiVariant = 1 | 2 | 3 | 4 | 5;

export const authConfig = {
  /**
   * UI variant 번호 (1~5)
   * - 1: Card 중앙 정렬 레이아웃 (기본)
   * - 2: 분할 화면 레이아웃 (이미지 + 폼)
   * - 3~5: 추가 레이아웃 variants
   */
  uiVariant: 4 as AuthUiVariant,
} as const;
