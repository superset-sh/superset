import { z } from "zod";

export const generateImageSchema = z.object({
  prompt: z.string().min(1).max(2000).describe("이미지 생성 프롬프트"),
  model: z.string().optional().describe("AI 모델 ID"),
  format: z.enum(["feed", "carousel", "story", "reels_cover"]).default("feed").describe("인스타그램 포맷"),
  styleTemplateId: z.string().uuid().optional().describe("스타일 템플릿 ID"),
  contentThemeId: z.string().uuid().optional().describe("콘텐츠 테마 ID"),
  themeVariables: z.record(z.string()).optional().describe("테마 변수 ({{key}}: value)"),
  inputImageBase64: z.string().optional().describe("참조 이미지 (base64)"),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;

export const createStyleSchema = z.object({
  name: z.string().min(1).max(100).describe("스타일 이름"),
  description: z.string().optional().describe("스타일 설명"),
  promptSuffix: z.string().min(1).describe("프롬프트 접미사"),
  category: z.enum(["instagram", "thumbnail", "banner"]).describe("카테고리"),
  thumbnailUrl: z.string().url().optional().describe("미리보기 이미지 URL"),
  sortOrder: z.number().int().default(0).describe("정렬 순서"),
});

export type CreateStyleInput = z.infer<typeof createStyleSchema>;

export const updateStyleSchema = z.object({
  id: z.string().uuid().describe("스타일 ID"),
  data: createStyleSchema.partial(),
});

export type UpdateStyleInput = z.infer<typeof updateStyleSchema>;

export const adminHistorySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional().describe("특정 사용자 필터"),
  dateFrom: z.string().datetime().optional().describe("시작 날짜"),
  dateTo: z.string().datetime().optional().describe("종료 날짜"),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});
