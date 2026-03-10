/**
 * Feature 공통 Zod 스키마
 *
 * tRPC route에서 반복되는 입력 스키마를 중앙 관리한다.
 */
import { z } from "zod";

/** 페이지네이션 입력 스키마 (기본값: page=1, limit=20, max=100) */
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

/** UUID ID 스키마 */
export const idSchema = z.object({
  id: z.string().uuid(),
});

/** 성공 응답 스키마 */
export const successResultSchema = z.object({
  success: z.boolean(),
});
