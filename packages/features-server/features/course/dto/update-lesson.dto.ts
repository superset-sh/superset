import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const updateLessonSchema = z.object({
  title: z.string().min(1).max(200).optional().describe("레슨 제목"),
  description: z.string().max(500).nullable().optional().describe("레슨 설명"),
  sortOrder: z.number().int().min(0).optional().describe("정렬 순서"),
  isFree: z.boolean().optional().describe("미리보기 허용 여부"),
});

export class UpdateLessonDto extends createZodDto(updateLessonSchema) {}
