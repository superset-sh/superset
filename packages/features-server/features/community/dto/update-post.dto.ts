import { z } from "zod";

export const updatePostSchema = z.object({
  title: z.string().min(1).max(300).optional().describe("게시물 제목"),
  content: z.string().optional().describe("텍스트 내용"),
  isNsfw: z.boolean().optional().describe("NSFW 콘텐츠"),
  isSpoiler: z.boolean().optional().describe("스포일러 콘텐츠"),
  flairId: z.string().uuid().nullable().optional().describe("플레어 ID"),
});

export type UpdatePostDto = z.infer<typeof updatePostSchema>;
