import { z } from "zod";

export const uploadFileSchema = z.object({
  bucket: z.enum(["files", "public-files"]).default("files").describe("Supabase bucket"),
  folder: z.string().optional().describe("저장 폴더 경로"),
});

export type UploadFileDto = z.infer<typeof uploadFileSchema>;
