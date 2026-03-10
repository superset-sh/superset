import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const updateSectionSchema = z.object({
  title: z.string().min(1).max(200).optional().describe("섹션 제목"),
  description: z.string().max(500).nullable().optional().describe("섹션 설명"),
  sortOrder: z.number().int().min(0).optional().describe("정렬 순서"),
});

export class UpdateSectionDto extends createZodDto(updateSectionSchema) {}
