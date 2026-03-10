import { z } from "zod";

export const flowScreenSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  order: z.number().int().min(0),
  description: z.string().default(""),
  wireframeType: z.string().default(""),
  wireframeMermaid: z.string().default(""),
  nextScreenIds: z.array(z.string().uuid()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export const updateFlowDataSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  flowData: z
    .object({
      screens: z.array(flowScreenSchema),
      currentScreenIndex: z.number().int().min(0),
    })
    .describe("화면 흐름 데이터"),
});

export const updateDesignerSettingsSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  platform: z.enum(["mobile", "desktop"]).optional().describe("플랫폼"),
  designTheme: z.string().optional().describe("디자인 테마"),
});

export const addScreenSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  name: z.string().min(1).max(100).describe("화면 이름"),
  afterScreenId: z
    .string()
    .uuid()
    .optional()
    .describe("이 화면 뒤에 추가 (미지정 시 마지막)"),
});

export const updateScreenSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  screenId: z.string().uuid().describe("화면 ID"),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  wireframeType: z.string().optional(),
  wireframeMermaid: z.string().optional(),
  nextScreenIds: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const removeScreenSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  screenId: z.string().uuid().describe("삭제할 화면 ID"),
});

export const completeFlowDesignSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  model: z
    .string()
    .optional()
    .describe("화면정의서 생성 시 사용할 LLM 모델"),
});

export type UpdateFlowDataDto = z.infer<typeof updateFlowDataSchema>;
export type UpdateDesignerSettingsDto = z.infer<
  typeof updateDesignerSettingsSchema
>;
export type AddScreenDto = z.infer<typeof addScreenSchema>;
export type UpdateScreenDto = z.infer<typeof updateScreenSchema>;
export type RemoveScreenDto = z.infer<typeof removeScreenSchema>;
export type CompleteFlowDesignDto = z.infer<typeof completeFlowDesignSchema>;
