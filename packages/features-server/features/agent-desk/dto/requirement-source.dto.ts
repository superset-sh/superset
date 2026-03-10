import { z } from "zod";

export const addRequirementSourceSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  sourceType: z.enum(["pdf", "pptx", "docx", "md", "txt", "manual"]).describe("소스 유형"),
  title: z.string().min(1).max(500).describe("소스 제목"),
  rawContent: z.string().optional().describe("원본 텍스트 (manual 입력 시)"),
  fileId: z.string().uuid().optional().describe("업로드된 파일 ID"),
});

export type AddRequirementSourceDto = z.infer<typeof addRequirementSourceSchema>;

export const listRequirementSourcesSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
});

export type ListRequirementSourcesDto = z.infer<typeof listRequirementSourcesSchema>;
