// ============================================================================
// Cursor Pagination Utilities
// ============================================================================

/**
 * 커서 기반 페이지네이션 결과
 */
export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
}

// base64url helpers (isomorphic: Node.js + Browser)
function toBase64Url(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

/**
 * 커서 인코딩 (base64url)
 * @param value 정렬 기준 값 (createdAt, memberCount, name 등)
 * @param id 고유 식별자 (tie-breaker)
 */
export function encodeCursor(value: string, id: string): string {
  return toBase64Url(JSON.stringify({ v: value, id }));
}

/**
 * 커서 디코딩
 * @returns 디코딩된 { value, id } 또는 null (잘못된 커서)
 */
export function decodeCursor(cursor: string): { value: string; id: string } | null {
  try {
    const parsed = JSON.parse(fromBase64Url(cursor));
    if (typeof parsed.v === "string" && typeof parsed.id === "string") {
      return { value: parsed.v, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * limit+1 패턴으로 조회한 결과에서 커서 페이지네이션 결과를 빌드
 *
 * @param items limit+1개로 조회한 결과 배열
 * @param limit 실제 페이지 크기
 * @param cursorExtractor 마지막 아이템에서 커서 값을 추출하는 함수 (value, id)
 * @returns { items, nextCursor }
 *
 * @example
 * ```ts
 * const rows = await query.limit(limit + 1);
 * return buildCursorResult(rows, limit, (item) => ({
 *   value: item.createdAt.toISOString(),
 *   id: item.id,
 * }));
 * ```
 */
export function buildCursorResult<T>(
  items: T[],
  limit: number,
  cursorExtractor: (item: T) => { value: string; id: string },
): CursorPaginationResult<T> {
  const hasMore = items.length > limit;
  const result = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  if (hasMore && result.length > 0) {
    const last = result[result.length - 1]!;
    const { value, id } = cursorExtractor(last);
    nextCursor = encodeCursor(value, id);
  }

  return { items: result, nextCursor };
}
