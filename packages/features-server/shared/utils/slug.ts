/**
 * Slug 생성 유틸리티
 *
 * 한글/영문/숫자를 지원하며, 고유성을 위해 타임스탬프를 추가한다.
 */

/**
 * 문자열에서 URL-safe slug를 생성한다.
 *
 * @param input 원본 문자열 (제목, 이름 등)
 * @returns slug 문자열 (예: "hello-world-m1abc2d")
 *
 * @example
 * ```ts
 * generateSlug("Hello World!"); // "hello-world-m1abc2d"
 * generateSlug("블로그 포스트 제목"); // "블로그-포스트-제목-m1abc2d"
 * ```
 */
export function generateSlug(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${Date.now().toString(36)}`;
}
