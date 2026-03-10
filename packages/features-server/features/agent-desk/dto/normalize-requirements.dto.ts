import { z } from "zod";

export const normalizeRequirementsSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  model: z.string().optional().describe("사용할 LLM 모델 (선택)"),
});

export type NormalizeRequirementsDto = z.infer<typeof normalizeRequirementsSchema>;

export const listNormalizedRequirementsSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
});

export type ListNormalizedRequirementsDto = z.infer<typeof listNormalizedRequirementsSchema>;
