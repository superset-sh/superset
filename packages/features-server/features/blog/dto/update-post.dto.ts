import { createBlogPostSchema } from "./create-post.dto";
import { z } from "zod";

export const updateBlogPostSchema = createBlogPostSchema.partial();

export type UpdateBlogPostDto = z.infer<typeof updateBlogPostSchema>;
