import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100).describe("카테고리명"),
  description: z.string().optional().describe("설명"),
  slug: z.string().min(1).max(100).describe("URL slug"),
  icon: z.string().max(50).optional().describe("lucide 아이콘명"),
  sortOrder: z.number().int().default(0).describe("정렬 순서"),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
