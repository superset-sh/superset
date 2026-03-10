import { z } from "zod";

export const searchProvidersSchema = z.object({
  categoryId: z.string().uuid().optional().describe("카테고리 ID 필터"),
  budgetMax: z.number().int().min(0).optional().describe("최대 예산"),
  language: z.string().optional().describe("언어 필터"),
  mode: z
    .enum(["online", "offline", "hybrid"])
    .optional()
    .describe("상담 방식 필터"),
  keyword: z.string().optional().describe("검색어 (이름, 소개)"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
    .optional()
    .describe("가용 날짜 필터"),
  page: z.number().int().min(1).default(1).describe("페이지 번호"),
  limit: z.number().int().min(1).max(100).default(20).describe("페이지 크기"),
});

export type SearchProvidersDto = z.infer<typeof searchProvidersSchema>;
