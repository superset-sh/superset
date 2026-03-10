import { z } from "zod";

export const sendMessageSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  content: z.string().min(1).describe("메시지 내용"),
  model: z.string().optional().describe("사용할 LLM 모델 ID (미지정 시 기본 모델)"),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;
