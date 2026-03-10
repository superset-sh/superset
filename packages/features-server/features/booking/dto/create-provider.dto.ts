import { z } from "zod";

export const createProviderSchema = z.object({
  bio: z.string().optional().describe("자기소개"),
  experienceYears: z.number().int().min(0).optional().describe("경력 연수"),
  consultationMode: z
    .enum(["online", "offline", "hybrid"])
    .default("online")
    .describe("상담 방식"),
  languages: z.array(z.string()).default(["ko"]).describe("사용 가능 언어"),
  categoryIds: z
    .array(z.string().uuid())
    .min(1)
    .describe("카테고리 ID 배열"),
});

export type CreateProviderDto = z.infer<typeof createProviderSchema>;
