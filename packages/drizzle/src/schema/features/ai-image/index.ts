/**
 * AI Image Feature Schema
 * AI-powered image generation with style templates
 */
import { baseColumns, softDelete } from "../../../utils";
import { profiles } from "../../core/profiles";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums (pgEnum)
// ============================================================================

export const aiImageGenerationStatusEnum = pgEnum("ai_image_generation_status", [
  "pending",
  "generating",
  "completed",
  "failed",
]);

export const aiImageStyleCategoryEnum = pgEnum("ai_image_style_category", [
  "instagram",
  "thumbnail",
  "banner",
]);

export const aiImageFormatEnum = pgEnum("ai_image_format", [
  "feed",
  "carousel",
  "story",
  "reels_cover",
]);

// ============================================================================
// Types (TypeScript types for JSONB columns)
// ============================================================================

export interface AiImageGenerationMetadata {
  model: string;
  durationMs: number;
  tokensUsed?: number;
  themeVariables?: Record<string, string>;
}

// ============================================================================
// Tables (pgTable definitions)
// ============================================================================

export const aiImageStyleTemplates = pgTable("ai_image_style_templates", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  promptSuffix: text("prompt_suffix").notNull(),
  category: aiImageStyleCategoryEnum("category").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiImageContentThemes = pgTable("ai_image_content_themes", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  promptTemplate: text("prompt_template").notNull(),
  recommendedStyleIds: uuid("recommended_style_ids").array(),
  recommendedFormat: aiImageFormatEnum("recommended_format"),
  thumbnailUrl: text("thumbnail_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const aiImageGenerations = pgTable(
  "ai_image_generations",
  {
    ...baseColumns(),
    ...softDelete(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    format: aiImageFormatEnum("format").notNull().default("feed"),
    styleTemplateId: uuid("style_template_id").references(() => aiImageStyleTemplates.id, {
      onDelete: "set null",
    }),
    contentThemeId: uuid("content_theme_id").references(() => aiImageContentThemes.id, {
      onDelete: "set null",
    }),
    inputImageUrl: text("input_image_url"),
    outputImageUrl: text("output_image_url"),
    status: aiImageGenerationStatusEnum("status").notNull().default("pending"),
    width: integer("width").notNull().default(1080),
    height: integer("height").notNull().default(1080),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<AiImageGenerationMetadata>(),
  },
  (table) => [
    index("idx_ai_image_generations_user").on(table.userId),
    index("idx_ai_image_generations_status").on(table.status),
    index("idx_ai_image_generations_format").on(table.format),
  ],
);

// ============================================================================
// Type Exports (Drizzle inferred types)
// ============================================================================

export type AiImageGeneration = typeof aiImageGenerations.$inferSelect;
export type NewAiImageGeneration = typeof aiImageGenerations.$inferInsert;
export type AiImageStyleTemplate = typeof aiImageStyleTemplates.$inferSelect;
export type NewAiImageStyleTemplate = typeof aiImageStyleTemplates.$inferInsert;
export type AiImageContentTheme = typeof aiImageContentThemes.$inferSelect;
export type NewAiImageContentTheme = typeof aiImageContentThemes.$inferInsert;
