import { z } from "zod";

export const updateProviderProfileSchema = z.object({
  bio: z.string().optional().describe("자기소개"),
  experienceYears: z.number().int().min(0).optional().describe("경력 연수"),
  consultationMode: z
    .enum(["online", "offline", "hybrid"])
    .optional()
    .describe("상담 방식"),
  languages: z.array(z.string()).optional().describe("사용 가능 언어"),
  categoryIds: z
    .array(z.string().uuid())
    .optional()
    .describe("카테고리 ID 배열"),
});

export type UpdateProviderProfileDto = z.infer<
  typeof updateProviderProfileSchema
>;
