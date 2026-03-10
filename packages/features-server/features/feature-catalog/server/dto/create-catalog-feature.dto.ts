import { createZodDto } from "../../../../shared/zod-nestjs";
import { z } from "zod";

export const createCatalogFeatureSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .describe("Feature slug (kebab-case)"),
  name: z.string().min(1).max(200).describe("Feature display name"),
  description: z.string().optional().describe("Feature description"),
  icon: z.string().max(50).optional().describe("lucide icon name"),
  group: z
    .enum(["core", "content", "commerce", "system"])
    .default("content")
    .describe("Feature group"),
  tags: z.array(z.string()).default([]).describe("Search/filter tags"),
  previewImages: z
    .array(z.string().url())
    .default([])
    .describe("Screenshot URLs"),
  capabilities: z
    .array(z.string())
    .default([])
    .describe("Feature capabilities"),
  techStack: z
    .object({
      server: z.array(z.string()).optional(),
      client: z.array(z.string()).optional(),
    })
    .optional()
    .describe("Tech stack"),
  isCore: z.boolean().default(false).describe("Core feature flag"),
  isPublished: z.boolean().default(false).describe("Published to catalog"),
  order: z.number().int().default(0).describe("Display order"),
});

export class CreateCatalogFeatureDto extends createZodDto(
  createCatalogFeatureSchema,
) {}
