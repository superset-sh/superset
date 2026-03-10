import { z } from "zod";

export const createBlogPostSchema = z.object({
    title: z.string().min(1, "제목을 입력해주세요.").max(300, "제목은 300자를 초과할 수 없습니다."),
    content: z.string().optional(),
    excerpt: z.string().max(500).optional(),
    coverImage: z.string().url().optional(),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    tags: z.array(z.string()).max(5, "태그는 하나 이상, 5개 이하로 입력해주세요.").optional(),
});

export type CreateBlogPostDto = z.infer<typeof createBlogPostSchema>;
