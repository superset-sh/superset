import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const createLessonSchema = z.object({
  sectionId: z.string().uuid().describe("섹션 ID"),
  title: z.string().min(1).max(200).describe("레슨 제목"),
  description: z.string().max(500).optional().describe("레슨 설명"),
  isFree: z.boolean().optional().default(false).describe("미리보기 허용 여부"),
});

export class CreateLessonDto extends createZodDto(createLessonSchema) {}
