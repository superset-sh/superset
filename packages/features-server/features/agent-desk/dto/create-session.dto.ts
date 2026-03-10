import { z } from "zod";

export const createSessionSchema = z.object({
  type: z.enum(["customer", "operator", "designer"]).describe("세션 유형"),
  title: z.string().max(200).optional().describe("세션 제목"),
  prompt: z.string().optional().describe("초기 프롬프트"),
  platform: z
    .enum(["mobile", "desktop"])
    .optional()
    .describe("플랫폼 (designer 전용)"),
  designTheme: z
    .string()
    .optional()
    .describe("디자인 테마/스타일 (designer 전용)"),
});

export type CreateSessionDto = z.infer<typeof createSessionSchema>;
