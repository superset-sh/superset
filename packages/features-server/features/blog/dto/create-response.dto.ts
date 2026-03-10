import { z } from "zod";

export const createResponseSchema = z.object({
    postId: z.string().uuid("올바른 포스트 ID가 아닙니다."),
    content: z.string().min(1, "댓글 내용을 입력해주세요.").max(10000, "내용이 너무 깁니다."),
    parentId: z.string().uuid().optional(),
});

export type CreateResponseDto = z.infer<typeof createResponseSchema>;
