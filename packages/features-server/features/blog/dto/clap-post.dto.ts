import { z } from "zod";

export const clapPostSchema = z.object({
    postId: z.string().uuid("올바른 포스트 ID가 아닙니다."),
    count: z.number().int().min(1).max(50, "한 번에 최대 50번까지만 박수칠 수 있습니다."),
});

export type ClapPostDto = z.infer<typeof clapPostSchema>;
