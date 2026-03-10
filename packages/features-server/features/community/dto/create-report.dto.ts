import { z } from "zod";

export const createReportSchema = z.object({
  communityId: z.string().uuid().describe("커뮤니티 ID"),
  targetType: z.enum(["post", "comment", "user"]).describe("신고 대상 유형"),
  targetId: z.string().uuid().describe("신고 대상 ID"),
  reason: z
    .enum(["spam", "harassment", "hate_speech", "misinformation", "nsfw", "violence", "copyright", "other"])
    .describe("신고 사유"),
  ruleViolated: z.number().int().optional().describe("위반된 규칙 번호"),
  description: z.string().max(1000).optional().describe("상세 설명"),
});

export type CreateReportDto = z.infer<typeof createReportSchema>;
