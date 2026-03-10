/**
 * 오프셋 기반 페이지네이션 유틸리티
 *
 * 커서 기반은 `./pagination.ts` 참조.
 */
import type { PaginatedResult } from "../types/pagination";

/**
 * 오프셋 페이지네이션 결과를 빌드한다.
 *
 * @example
 * ```ts
 * const [data, [{ count: total }]] = await Promise.all([
 *   db.query.posts.findMany({ limit, offset }),
 *   db.select({ count: count() }).from(posts).where(condition),
 * ]);
 * return buildPaginatedResult(data, total, page, limit);
 * ```
 */
export function buildPaginatedResult<T>(
  data: T[],
  total: number | string,
  page: number,
  limit: number,
): PaginatedResult<T> {
  // PostgreSQL COUNT(*)는 bigint를 반환하고 Drizzle이 string으로 직렬화할 수 있음
  const totalNum = typeof total === "string" ? Number(total) : total;
  return {
    data,
    total: totalNum,
    page,
    limit,
    totalPages: Math.ceil(totalNum / limit),
  };
}

/**
 * page/limit에서 offset을 계산한다.
 */
export function toOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}
