import { createZodDto } from "../../../shared/zod-nestjs";
import { z } from "zod";

export const updateCourseSchema = z.object({
  topicId: z.string().uuid().optional().describe("주제 ID"),
  title: z.string().min(1).max(200).optional().describe("강의 제목"),
  slug: z.string().max(200).optional().describe("URL용 식별자"),
  summary: z.string().nullable().optional().describe("짧은 요약"),
  content: z.any().optional().describe("TipTap JSON (강의 상세 설명)"),
  thumbnailUrl: z.string().url().nullable().optional().describe("썸네일 이미지 URL"),
  estimatedMinutes: z.number().int().positive().nullable().optional().describe("예상 수강 시간 (분)"),
  sortOrder: z.number().int().min(0).optional().describe("정렬 순서"),
});

export class UpdateCourseDto extends createZodDto(updateCourseSchema) {}
