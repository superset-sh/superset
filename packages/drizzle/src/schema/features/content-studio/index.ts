/**
 * Content Studio Feature Schema
 * React Flow 기반 비주얼 콘텐츠 관리 캔버스 (AI 에이전트 연동)
 */
import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns, baseColumnsWithSoftDelete } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const studioVisibilityEnum = pgEnum("studio_visibility", [
  "public",
  "private",
]);

export const studioContentStatusEnum = pgEnum("studio_content_status", [
  "draft",
  "writing",
  "review",
  "published",
  "canceled",
]);

export const studioNodeTypeEnum = pgEnum("studio_node_type", [
  "topic",
  "content",
]);

export const studioSentenceLengthEnum = pgEnum("studio_sentence_length", [
  "short",
  "medium",
  "long",
]);

export const studioRepurposeFormatEnum = pgEnum("studio_repurpose_format", [
  "card_news",
  "short_form",
  "twitter_thread",
  "email_summary",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Studios - 프로젝트/워크스페이스
 */
export const studioStudios = pgTable(
  "studio_studios",
  {
    ...baseColumnsWithSoftDelete(),

    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    visibility: studioVisibilityEnum("visibility")
      .notNull()
      .default("private"),
  },
  (table) => [
    index("idx_studio_studios_owner").on(table.ownerId),
    index("idx_studio_studios_visibility").on(table.visibility),
  ],
);

/**
 * Studio Topics - 주제 노드
 */
export const studioTopics = pgTable(
  "studio_topics",
  {
    ...baseColumns(),

    studioId: uuid("studio_id")
      .notNull()
      .references(() => studioStudios.id, { onDelete: "cascade" }),

    label: varchar("label", { length: 100 }).notNull(),
    color: varchar("color", { length: 20 }),

    positionX: real("position_x").notNull().default(0),
    positionY: real("position_y").notNull().default(0),
  },
  (table) => [
    index("idx_studio_topics_studio").on(table.studioId),
  ],
);

/**
 * Studio Contents - 콘텐츠 노드
 */
export const studioContents = pgTable(
  "studio_contents",
  {
    ...baseColumnsWithSoftDelete(),

    studioId: uuid("studio_id")
      .notNull()
      .references(() => studioStudios.id, { onDelete: "cascade" }),

    topicId: uuid("topic_id").references(() => studioTopics.id, {
      onDelete: "set null",
    }),

    title: varchar("title", { length: 300 }).notNull(),
    content: text("content"),
    summary: text("summary"),
    thumbnailUrl: text("thumbnail_url"),

    status: studioContentStatusEnum("status").notNull().default("draft"),

    positionX: real("position_x").notNull().default(0),
    positionY: real("position_y").notNull().default(0),

    viewCount: integer("view_count").notNull().default(0),

    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    label: varchar("label", { length: 50 }),
    slug: varchar("slug", { length: 300 }),

    derivedFromId: uuid("derived_from_id").references(
      (): AnyPgColumn => studioContents.id,
      { onDelete: "set null" },
    ),
    repurposeFormat: studioRepurposeFormatEnum("repurpose_format"),
  },
  (table) => [
    index("idx_studio_contents_studio").on(table.studioId),
    index("idx_studio_contents_topic").on(table.topicId),
    index("idx_studio_contents_author").on(table.authorId),
    index("idx_studio_contents_status").on(table.status),
    index("idx_studio_contents_published_at").on(table.publishedAt),
    index("idx_studio_contents_scheduled_at").on(table.scheduledAt),
    index("idx_studio_contents_derived_from").on(table.derivedFromId),
  ],
);

/**
 * Studio Content SEO - SEO 이력/스냅샷
 */
export const studioContentSeo = pgTable(
  "studio_content_seo",
  {
    ...baseColumns(),

    contentId: uuid("content_id")
      .notNull()
      .references(() => studioContents.id, { onDelete: "cascade" }),

    seoTitle: varchar("seo_title", { length: 200 }),
    seoDescription: varchar("seo_description", { length: 500 }),
    seoKeywords: text("seo_keywords").array().default([]),
    ogImageUrl: text("og_image_url"),
    seoScore: integer("seo_score").notNull().default(0),

    // Analytics 스냅샷
    pageViews: integer("page_views").notNull().default(0),
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
    avgTimeOnPage: real("avg_time_on_page").notNull().default(0),
    bounceRate: real("bounce_rate").notNull().default(0),

    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_content_seo_content").on(table.contentId),
    index("idx_studio_content_seo_snapshot").on(table.snapshotAt),
  ],
);

/**
 * Studio Content Analysis - SEO/AEO/GEO 통합 분석 이력
 */
export const studioContentAnalysis = pgTable(
  "studio_content_analysis",
  {
    ...baseColumns(),

    contentId: uuid("content_id")
      .notNull()
      .references(() => studioContents.id, { onDelete: "cascade" }),

    seoScore: integer("seo_score").notNull().default(0),
    aeoScore: integer("aeo_score").notNull().default(0),
    geoScore: integer("geo_score").notNull().default(0),
    totalScore: integer("total_score").notNull().default(0),

    seoDetails: jsonb("seo_details").notNull().$type<Record<string, unknown>>(),
    aeoDetails: jsonb("aeo_details").notNull().$type<Record<string, unknown>>(),
    geoDetails: jsonb("geo_details").notNull().$type<Record<string, unknown>>(),

    analysisVersion: varchar("analysis_version", { length: 10 }).default("1.0"),

    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_studio_content_analysis_content").on(table.contentId),
    index("idx_studio_content_analysis_snapshot").on(table.snapshotAt),
  ],
);


/**
 * Studio Recurrences - 반복 콘텐츠 규칙
 */
export const studioRecurrences = pgTable(
  "studio_recurrences",
  {
    ...baseColumns(),

    studioId: uuid("studio_id")
      .notNull()
      .references(() => studioStudios.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 200 }).notNull(),
    rule: varchar("rule", { length: 50 }).notNull(),

    templateContentId: uuid("template_content_id").references(
      () => studioContents.id,
      { onDelete: "set null" }
    ),

    label: varchar("label", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),

    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_studio_recurrences_studio").on(table.studioId),
    index("idx_studio_recurrences_active").on(table.isActive),
    index("idx_studio_recurrences_next_run").on(table.nextRunAt),
  ],
);

/**
 * Studio Edges - 노드 간 연결선
 */
export const studioEdges = pgTable(
  "studio_edges",
  {
    ...baseColumns(),

    studioId: uuid("studio_id")
      .notNull()
      .references(() => studioStudios.id, { onDelete: "cascade" }),

    sourceId: uuid("source_id").notNull(),
    sourceType: studioNodeTypeEnum("source_type").notNull(),

    targetId: uuid("target_id").notNull(),
    targetType: studioNodeTypeEnum("target_type").notNull(),
  },
  (table) => [
    index("idx_studio_edges_studio").on(table.studioId),
    index("idx_studio_edges_source").on(table.sourceId),
    index("idx_studio_edges_target").on(table.targetId),
  ],
);

/**
 * Studio AI Recurrences - AI 추천 주기적 실행 규칙
 */
export const studioAiRecurrences = pgTable(
  "studio_ai_recurrences",
  {
    ...baseColumns(),

    studioId: uuid("studio_id")
      .notNull()
      .references(() => studioStudios.id, { onDelete: "cascade" }),

    topicId: uuid("topic_id")
      .notNull()
      .references(() => studioTopics.id, { onDelete: "cascade" }),

    // 커스텀 프롬프트 (선택) — "SEO 중심으로", "초보자 대상" 등
    prompt: text("prompt"),

    // 반복 규칙: weekly, biweekly, monthly
    rule: varchar("rule", { length: 50 }).notNull(),

    isActive: boolean("is_active").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    totalGenerated: integer("total_generated").notNull().default(0),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_studio_ai_recurrences_studio").on(table.studioId),
    index("idx_studio_ai_recurrences_topic").on(table.topicId),
    index("idx_studio_ai_recurrences_active").on(table.isActive),
    index("idx_studio_ai_recurrences_next_run").on(table.nextRunAt),
  ],
);

/**
 * Studio Brand Profiles - 스튜디오별 브랜드 보이스 설정 (1:1)
 */
export const studioBrandProfiles = pgTable(
  "studio_brand_profiles",
  {
    ...baseColumns(),

    studioId: uuid("studio_id")
      .notNull()
      .unique()
      .references(() => studioStudios.id, { onDelete: "cascade" }),

    brandName: varchar("brand_name", { length: 100 }).notNull(),
    industry: varchar("industry", { length: 100 }),
    targetAudience: text("target_audience"),

    formality: integer("formality").notNull().default(3),
    friendliness: integer("friendliness").notNull().default(3),
    humor: integer("humor").notNull().default(2),
    sentenceLength: studioSentenceLengthEnum("sentence_length")
      .notNull()
      .default("medium"),

    forbiddenWords: text("forbidden_words").array().default([]),
    requiredWords: text("required_words").array().default([]),
    additionalGuidelines: text("additional_guidelines"),

    activePresetId: uuid("active_preset_id"),
  },
  (table) => [
    index("idx_studio_brand_profiles_studio").on(table.studioId),
  ],
);

/**
 * Studio Tone Presets - 톤 프리셋 (시스템 + 커스텀)
 */
export const studioTonePresets = pgTable(
  "studio_tone_presets",
  {
    ...baseColumns(),

    studioId: uuid("studio_id").references(() => studioStudios.id, {
      onDelete: "cascade",
    }),

    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),

    formality: integer("formality").notNull().default(3),
    friendliness: integer("friendliness").notNull().default(3),
    humor: integer("humor").notNull().default(2),
    sentenceLength: studioSentenceLengthEnum("sentence_length")
      .notNull()
      .default("medium"),

    systemPromptSuffix: text("system_prompt_suffix"),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (table) => [
    index("idx_studio_tone_presets_studio").on(table.studioId),
    index("idx_studio_tone_presets_system").on(table.isSystem),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const studioStudiosRelations = relations(
  studioStudios,
  ({ one, many }) => ({
    owner: one(profiles, {
      fields: [studioStudios.ownerId],
      references: [profiles.id],
    }),
    topics: many(studioTopics),
    contents: many(studioContents),
    recurrences: many(studioRecurrences),
    edges: many(studioEdges),
    aiRecurrences: many(studioAiRecurrences),
    brandProfile: one(studioBrandProfiles),
    tonePresets: many(studioTonePresets),
  }),
);

export const studioTopicsRelations = relations(
  studioTopics,
  ({ one, many }) => ({
    studio: one(studioStudios, {
      fields: [studioTopics.studioId],
      references: [studioStudios.id],
    }),
    contents: many(studioContents),
  }),
);

export const studioContentsRelations = relations(
  studioContents,
  ({ one, many }) => ({
    studio: one(studioStudios, {
      fields: [studioContents.studioId],
      references: [studioStudios.id],
    }),
    topic: one(studioTopics, {
      fields: [studioContents.topicId],
      references: [studioTopics.id],
    }),
    author: one(profiles, {
      fields: [studioContents.authorId],
      references: [profiles.id],
    }),
    seoHistory: many(studioContentSeo),
    analysisHistory: many(studioContentAnalysis),
    derivedFrom: one(studioContents, {
      fields: [studioContents.derivedFromId],
      references: [studioContents.id],
      relationName: "derivedContents",
    }),
    derivedContents: many(studioContents, {
      relationName: "derivedContents",
    }),
  }),
);

export const studioContentSeoRelations = relations(
  studioContentSeo,
  ({ one }) => ({
    content: one(studioContents, {
      fields: [studioContentSeo.contentId],
      references: [studioContents.id],
    }),
  }),
);


export const studioContentAnalysisRelations = relations(
  studioContentAnalysis,
  ({ one }) => ({
    content: one(studioContents, {
      fields: [studioContentAnalysis.contentId],
      references: [studioContents.id],
    }),
  }),
);


export const studioRecurrencesRelations = relations(
  studioRecurrences,
  ({ one }) => ({
    studio: one(studioStudios, {
      fields: [studioRecurrences.studioId],
      references: [studioStudios.id],
    }),
    templateContent: one(studioContents, {
      fields: [studioRecurrences.templateContentId],
      references: [studioContents.id],
    }),
    creator: one(profiles, {
      fields: [studioRecurrences.createdBy],
      references: [profiles.id],
    }),
  }),
);

export const studioEdgesRelations = relations(studioEdges, ({ one }) => ({
  studio: one(studioStudios, {
    fields: [studioEdges.studioId],
    references: [studioStudios.id],
  }),
}));

export const studioAiRecurrencesRelations = relations(
  studioAiRecurrences,
  ({ one }) => ({
    studio: one(studioStudios, {
      fields: [studioAiRecurrences.studioId],
      references: [studioStudios.id],
    }),
    topic: one(studioTopics, {
      fields: [studioAiRecurrences.topicId],
      references: [studioTopics.id],
    }),
    creator: one(profiles, {
      fields: [studioAiRecurrences.createdBy],
      references: [profiles.id],
    }),
  }),
);

export const studioBrandProfilesRelations = relations(
  studioBrandProfiles,
  ({ one }) => ({
    studio: one(studioStudios, {
      fields: [studioBrandProfiles.studioId],
      references: [studioStudios.id],
    }),
    activePreset: one(studioTonePresets, {
      fields: [studioBrandProfiles.activePresetId],
      references: [studioTonePresets.id],
    }),
  }),
);

export const studioTonePresetsRelations = relations(
  studioTonePresets,
  ({ one }) => ({
    studio: one(studioStudios, {
      fields: [studioTonePresets.studioId],
      references: [studioStudios.id],
    }),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type StudioStudio = typeof studioStudios.$inferSelect;
export type NewStudioStudio = typeof studioStudios.$inferInsert;

export type StudioTopic = typeof studioTopics.$inferSelect;
export type NewStudioTopic = typeof studioTopics.$inferInsert;

export type StudioContent = typeof studioContents.$inferSelect;
export type NewStudioContent = typeof studioContents.$inferInsert;

export type StudioContentSeo = typeof studioContentSeo.$inferSelect;
export type NewStudioContentSeo = typeof studioContentSeo.$inferInsert;

export type StudioContentAnalysis = typeof studioContentAnalysis.$inferSelect;
export type NewStudioContentAnalysis = typeof studioContentAnalysis.$inferInsert;


export type StudioRecurrence = typeof studioRecurrences.$inferSelect;
export type NewStudioRecurrence = typeof studioRecurrences.$inferInsert;

export type StudioEdge = typeof studioEdges.$inferSelect;
export type NewStudioEdge = typeof studioEdges.$inferInsert;

export type StudioAiRecurrence = typeof studioAiRecurrences.$inferSelect;
export type NewStudioAiRecurrence = typeof studioAiRecurrences.$inferInsert;

export type StudioBrandProfile = typeof studioBrandProfiles.$inferSelect;
export type NewStudioBrandProfile = typeof studioBrandProfiles.$inferInsert;

export type StudioTonePreset = typeof studioTonePresets.$inferSelect;
export type NewStudioTonePreset = typeof studioTonePresets.$inferInsert;

export type StudioVisibility = "public" | "private";
export type StudioContentStatus =
  | "draft"
  | "writing"
  | "review"
  | "published"
  | "canceled";
export type StudioNodeType = "topic" | "content";
export type StudioSentenceLength = "short" | "medium" | "long";
export type StudioRepurposeFormat = "card_news" | "short_form" | "twitter_thread" | "email_summary";
