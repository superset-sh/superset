import { z } from "zod";

export const createContentThemeSchema = z.object({
  name: z.string().min(1).max(100).describe("테마 이름"),
  description: z.string().optional().describe("테마 설명"),
  promptTemplate: z.string().min(1).describe("프롬프트 템플릿 ({{변수}} 포함)"),
  recommendedStyleIds: z.array(z.string().uuid()).optional().describe("추천 스타일 ID 목록"),
  recommendedFormat: z.enum(["feed", "carousel", "story", "reels_cover"]).optional().describe("추천 포맷"),
  thumbnailUrl: z.string().url().optional().describe("미리보기 이미지"),
  sortOrder: z.number().int().default(0).describe("정렬 순서"),
});

export type CreateContentThemeInput = z.infer<typeof createContentThemeSchema>;

export const updateContentThemeSchema = z.object({
  id: z.string().uuid().describe("테마 ID"),
  data: createContentThemeSchema.partial(),
});

export type UpdateContentThemeInput = z.infer<typeof updateContentThemeSchema>;
