import { z } from "zod";

export const analyzeSchema = z.object({
  sessionId: z.string().uuid(),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export const generateSpecSchema = z.object({
  sessionId: z.string().uuid(),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export const executeSchema = z.object({
  sessionId: z.string().uuid(),
});

export const cancelExecutionSchema = z.object({
  sessionId: z.string().uuid(),
});

export type AnalyzeDto = z.infer<typeof analyzeSchema>;
export type GenerateSpecDto = z.infer<typeof generateSpecSchema>;
export type ExecuteDto = z.infer<typeof executeSchema>;
export type CancelExecutionDto = z.infer<typeof cancelExecutionSchema>;
