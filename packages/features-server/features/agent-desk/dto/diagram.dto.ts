import { z } from "zod";

export const diagramTypeEnum = z.enum([
  "flowchart",
  "sequence",
  "er",
  "mindmap",
  "classDiagram",
  "stateDiagram",
]);

export const generateDiagramsSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export const generateSingleDiagramSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  diagramType: diagramTypeEnum.describe("생성할 다이어그램 유형"),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export const generateFromAnalysisSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export const exportToCanvasSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  title: z.string().optional().describe("캔버스 제목"),
  model: z.string().optional().describe("사용할 LLM 모델 ID"),
});

export type DiagramType = z.infer<typeof diagramTypeEnum>;
export type GenerateDiagramsDto = z.infer<typeof generateDiagramsSchema>;
export type GenerateSingleDiagramDto = z.infer<typeof generateSingleDiagramSchema>;
export type GenerateFromAnalysisDto = z.infer<typeof generateFromAnalysisSchema>;
export type ExportToCanvasDto = z.infer<typeof exportToCanvasSchema>;
