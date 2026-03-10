import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const createCourseSchema = z.object({
  topicId: z.string().uuid().describe("주제 ID"),
  title: z.string().min(1).max(200).describe("강의 제목"),
  summary: z.string().optional().describe("짧은 요약"),
  content: z.any().optional().describe("TipTap JSON (강의 상세 설명)"),
  thumbnailUrl: z.string().url().optional().describe("썸네일 이미지 URL"),
  estimatedMinutes: z.number().int().positive().optional().describe("예상 수강 시간 (분)"),
});

export class CreateCourseDto extends createZodDto(createCourseSchema) {}
