/**
 * Marketing Feature Schema
 * SNS 마케팅 콘텐츠 관리 및 발행 시스템
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const marketingSnsPlatformEnum = pgEnum("marketing_sns_platform", [
  "facebook",
  "instagram",
  "threads",
  "x",
  "linkedin",
]);

export const marketingCampaignStatusEnum = pgEnum("marketing_campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);

export const marketingContentSourceEnum = pgEnum("marketing_content_source", [
  "editor",
  "board_post",
  "community_post",
  "content_studio",
]);

export const marketingPublicationStatusEnum = pgEnum("marketing_publication_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Marketing Campaigns - 마케팅 캠페인
 */
export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    ...baseColumns(),

    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    description: text("description"),

    status: marketingCampaignStatusEnum("status").notNull().default("draft"),

    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),

    tags: text("tags").array().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("idx_marketing_campaigns_author").on(table.authorId),
    index("idx_marketing_campaigns_status").on(table.status),
  ],
);

/**
 * Marketing SNS Accounts - SNS 계정 연동
 */
export const marketingSnsAccounts = pgTable(
  "marketing_sns_accounts",
  {
    ...baseColumns(),

    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    platform: marketingSnsPlatformEnum("platform").notNull(),
    platformUserId: text("platform_user_id").notNull(),
    platformUsername: text("platform_username"),

    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),

    pageId: text("page_id"),
    isActive: boolean("is_active").notNull().default(true),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("marketing_sns_accounts_unique_idx").on(
      table.userId,
      table.platform,
      table.platformUserId,
    ),
    index("idx_marketing_sns_accounts_user").on(table.userId),
  ],
);

/**
 * Marketing Contents - 마케팅 콘텐츠 (원본)
 */
export const marketingContents = pgTable(
  "marketing_contents",
  {
    ...baseColumns(),

    campaignId: uuid("campaign_id").references(() => marketingCampaigns.id, {
      onDelete: "set null",
    }),

    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    sourceType: marketingContentSourceEnum("source_type")
      .notNull()
      .default("editor"),
    sourceId: uuid("source_id"),

    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    images: jsonb("images").$type<string[]>().default([]),
    linkUrl: text("link_url"),

    tags: text("tags").array().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("idx_marketing_contents_campaign").on(table.campaignId),
    index("idx_marketing_contents_author").on(table.authorId),
    index("idx_marketing_contents_source").on(table.sourceType, table.sourceId),
  ],
);

/**
 * Marketing Platform Variants - 플랫폼별 변형 콘텐츠
 */
export const marketingPlatformVariants = pgTable(
  "marketing_platform_variants",
  {
    ...baseColumns(),

    contentId: uuid("content_id")
      .notNull()
      .references(() => marketingContents.id, { onDelete: "cascade" }),

    platform: marketingSnsPlatformEnum("platform").notNull(),
    body: text("body"),
    images: jsonb("images").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    uniqueIndex("marketing_platform_variants_unique_idx").on(
      table.contentId,
      table.platform,
    ),
  ],
);

/**
 * Marketing Publications - 발행 기록
 */
export const marketingPublications = pgTable(
  "marketing_publications",
  {
    ...baseColumns(),

    contentId: uuid("content_id")
      .notNull()
      .references(() => marketingContents.id, { onDelete: "cascade" }),

    variantId: uuid("variant_id").references(
      () => marketingPlatformVariants.id,
      { onDelete: "set null" },
    ),

    snsAccountId: uuid("sns_account_id")
      .notNull()
      .references(() => marketingSnsAccounts.id, { onDelete: "cascade" }),

    platform: marketingSnsPlatformEnum("platform").notNull(),
    status: marketingPublicationStatusEnum("status").notNull().default("draft"),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    platformPostId: text("platform_post_id"),
    platformPostUrl: text("platform_post_url"),

    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),

    // UTM 파라미터
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
  },
  (table) => [
    index("idx_marketing_publications_content").on(table.contentId),
    index("idx_marketing_publications_sns_account").on(table.snsAccountId),
    index("idx_marketing_publications_status").on(table.status),
    index("idx_marketing_publications_scheduled").on(table.scheduledAt),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const marketingCampaignsRelations = relations(
  marketingCampaigns,
  ({ one, many }) => ({
    author: one(profiles, {
      fields: [marketingCampaigns.authorId],
      references: [profiles.id],
    }),
    contents: many(marketingContents),
  }),
);

export const marketingContentsRelations = relations(
  marketingContents,
  ({ one, many }) => ({
    campaign: one(marketingCampaigns, {
      fields: [marketingContents.campaignId],
      references: [marketingCampaigns.id],
    }),
    author: one(profiles, {
      fields: [marketingContents.authorId],
      references: [profiles.id],
    }),
    variants: many(marketingPlatformVariants),
    publications: many(marketingPublications),
  }),
);

export const marketingPlatformVariantsRelations = relations(
  marketingPlatformVariants,
  ({ one }) => ({
    content: one(marketingContents, {
      fields: [marketingPlatformVariants.contentId],
      references: [marketingContents.id],
    }),
  }),
);

export const marketingPublicationsRelations = relations(
  marketingPublications,
  ({ one }) => ({
    content: one(marketingContents, {
      fields: [marketingPublications.contentId],
      references: [marketingContents.id],
    }),
    variant: one(marketingPlatformVariants, {
      fields: [marketingPublications.variantId],
      references: [marketingPlatformVariants.id],
    }),
    snsAccount: one(marketingSnsAccounts, {
      fields: [marketingPublications.snsAccountId],
      references: [marketingSnsAccounts.id],
    }),
  }),
);

export const marketingSnsAccountsRelations = relations(
  marketingSnsAccounts,
  ({ one }) => ({
    user: one(profiles, {
      fields: [marketingSnsAccounts.userId],
      references: [profiles.id],
    }),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type NewMarketingCampaign = typeof marketingCampaigns.$inferInsert;

export type MarketingSnsAccount = typeof marketingSnsAccounts.$inferSelect;
export type NewMarketingSnsAccount = typeof marketingSnsAccounts.$inferInsert;

export type MarketingContent = typeof marketingContents.$inferSelect;
export type NewMarketingContent = typeof marketingContents.$inferInsert;

export type MarketingPlatformVariant =
  typeof marketingPlatformVariants.$inferSelect;
export type NewMarketingPlatformVariant =
  typeof marketingPlatformVariants.$inferInsert;

export type MarketingPublication = typeof marketingPublications.$inferSelect;
export type NewMarketingPublication = typeof marketingPublications.$inferInsert;

export type SnsPlatform = (typeof marketingSnsPlatformEnum.enumValues)[number];
export type CampaignStatus = (typeof marketingCampaignStatusEnum.enumValues)[number];
export type ContentSourceType = (typeof marketingContentSourceEnum.enumValues)[number];
export type PublicationStatus = (typeof marketingPublicationStatusEnum.enumValues)[number];
