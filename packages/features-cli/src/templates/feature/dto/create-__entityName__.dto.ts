import { createZodDto } from "@superbuilder/features-shared/zod-nestjs";
import { z } from "zod";

export const create{{PascalEntity}}Schema = z.object({
  title: z.string().min(1).max(200).describe("제목"),
  content: z.string().optional().describe("내용"),
});

export class Create{{PascalEntity}}Dto extends createZodDto(create{{PascalEntity}}Schema) {}
export type Create{{PascalEntity}}Input = z.infer<typeof create{{PascalEntity}}Schema>;
