import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const createTopicSchema = z.object({
  name: z.string().min(1).max(100).describe("주제명"),
  slug: z.string().max(100).optional().describe("URL용 식별자 (미입력 시 자동 생성)"),
  description: z.string().optional().describe("주제 설명"),
  thumbnailUrl: z.string().url().optional().describe("썸네일 이미지 URL"),
});

export class CreateTopicDto extends createZodDto(createTopicSchema) {}
