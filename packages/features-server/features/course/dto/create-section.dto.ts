import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const createSectionSchema = z.object({
  courseId: z.string().uuid().describe("강의 ID"),
  title: z.string().min(1).max(200).describe("섹션 제목"),
  description: z.string().max(500).optional().describe("섹션 설명"),
});

export class CreateSectionDto extends createZodDto(createSectionSchema) {}
