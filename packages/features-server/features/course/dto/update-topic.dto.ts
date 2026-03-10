import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const updateTopicSchema = z.object({
  name: z.string().min(1).max(100).optional().describe("주제명"),
  slug: z.string().max(100).optional().describe("URL용 식별자"),
  description: z.string().optional().describe("주제 설명"),
  thumbnailUrl: z.string().url().nullable().optional().describe("썸네일 이미지 URL"),
  sortOrder: z.number().int().min(0).optional().describe("정렬 순서"),
  isActive: z.boolean().optional().describe("활성 여부"),
});

export class UpdateTopicDto extends createZodDto(updateTopicSchema) {}
