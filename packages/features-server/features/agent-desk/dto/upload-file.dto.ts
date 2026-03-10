import { z } from "zod";

export const confirmUploadSchema = z.object({
  sessionId: z.string().uuid().describe("세션 ID"),
  fileName: z.string().describe("저장된 파일명"),
  originalName: z.string().describe("원본 파일명"),
  mimeType: z.string().describe("MIME 타입"),
  size: z.number().int().positive().describe("파일 크기 (bytes)"),
  storageUrl: z.string().url().describe("Storage URL"),
});

export type ConfirmUploadDto = z.infer<typeof confirmUploadSchema>;
