import { z } from "zod";

export const createCommentSchema = z.object({
  postId: z.string().uuid().describe("게시물 ID"),
  content: z.string().min(1).max(10000).describe("댓글 내용"),
  parentId: z.string().uuid().optional().describe("부모 댓글 ID (답글인 경우)"),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
