import { z } from "zod";

export const generateScreenCandidatesSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  model: z.string().optional().describe("사용할 LLM 모델 (선택)"),
});
export type GenerateScreenCandidatesDto = z.infer<typeof generateScreenCandidatesSchema>;

export const selectCanvasNodeSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  nodeId: z.string().uuid().describe("선택할 노드(화면) ID"),
  panelMode: z.enum(["view", "edit"]).describe("패널 모드"),
});
export type SelectCanvasNodeDto = z.infer<typeof selectCanvasNodeSchema>;

export const selectCanvasEdgeSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  edgeId: z.string().uuid().describe("선택할 엣지 ID"),
  panelMode: z.enum(["view"]).default("view").describe("패널 모드"),
});
export type SelectCanvasEdgeDto = z.infer<typeof selectCanvasEdgeSchema>;

export const updateFlowEdgeSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  edgeId: z.string().uuid().describe("엣지 ID"),
  conditionLabel: z.string().optional().describe("전이 조건 라벨"),
  transitionType: z.enum(["navigate", "redirect", "modal", "conditional"]).optional().describe("전이 유형"),
});
export type UpdateFlowEdgeDto = z.infer<typeof updateFlowEdgeSchema>;

export const addFlowEdgeSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  fromScreenId: z.string().describe("출발 화면 ID"),
  toScreenId: z.string().describe("도착 화면 ID"),
  conditionLabel: z.string().optional().default("").describe("전이 조건 라벨"),
  transitionType: z.enum(["navigate", "redirect", "modal", "conditional"]).optional().default("navigate").describe("전이 유형"),
});
export type AddFlowEdgeDto = z.infer<typeof addFlowEdgeSchema>;

export const deleteFlowEdgeSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  edgeId: z.string().describe("삭제할 엣지 ID"),
});
export type DeleteFlowEdgeDto = z.infer<typeof deleteFlowEdgeSchema>;

export const updateScreenCandidateSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  screenId: z.string().uuid().describe("화면 ID"),
  screenGoal: z.string().optional().describe("화면 목적"),
  primaryUser: z.string().optional().describe("주 사용자"),
  routePath: z.string().optional().describe("라우트 경로"),
  routeParent: z.string().optional().describe("부모 라우트"),
  keyElements: z.array(z.string()).optional().describe("핵심 UI 요소"),
  inputs: z.array(z.string()).optional().describe("입력 필드"),
  actions: z.array(z.string()).optional().describe("사용자 액션"),
  states: z.array(z.string()).optional().describe("화면 상태"),
  entryConditions: z.array(z.string()).optional().describe("진입 조건"),
  exitConditions: z.array(z.string()).optional().describe("이탈 조건"),
  sourceRequirementIds: z.array(z.string()).optional().describe("근거 요구사항 ID"),
  notes: z.string().optional().describe("비고"),
});
export type UpdateScreenCandidateDto = z.infer<typeof updateScreenCandidateSchema>;
