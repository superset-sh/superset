/**
 * 오프셋 기반 페이지네이션 공통 타입
 *
 * 커서 기반 페이지네이션은 `@/shared/utils/pagination` 참조.
 */

/** 페이지네이션 입력 */
export interface PaginationInput {
  page?: number;
  limit?: number;
}

/** 페이지네이션 결과 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 성공 응답 (삭제, 토글 등 부수효과 전용) */
export interface SuccessResult {
  success: boolean;
}
