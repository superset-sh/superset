import { z } from "zod";

export const askFlowAgentSchema = z.object({
  sessionId: z.string().uuid().describe("Flow Designer 세션 ID"),
  message: z.string().min(1).describe("사용자 질문/요청 메시지"),
  currentScreenId: z.string().uuid().optional().describe("현재 선택된 화면 ID"),
});

export const applyAiSuggestionSchema = z.object({
  sessionId: z.string().uuid().describe("Flow Designer 세션 ID"),
  suggestionId: z.string().uuid().describe("적용할 AI 제안 ID"),
  action: z.enum(["apply", "ignore", "modify"]).describe("제안에 대한 액션"),
  modifiedData: z.record(z.unknown()).optional().describe("modify 시 수정된 데이터"),
});

export const generateImplementationHandoffSchema = z.object({
  sessionId: z.string().uuid().describe("Flow Designer 세션 ID"),
});

export const generateFlowSpecDraftSchema = z.object({
  sessionId: z.string().uuid().describe("Flow Designer 세션 ID"),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export const resolveUiComponentsSchema = z.object({
  sessionId: z.string().uuid().describe("Flow Designer 세션 ID"),
  screenIds: z.array(z.string().uuid()).min(1).describe("UI 컴포넌트를 해석할 화면 ID 목록"),
});
