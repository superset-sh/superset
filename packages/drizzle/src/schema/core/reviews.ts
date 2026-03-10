import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  numeric,
} from "drizzle-orm/pg-core";
import { baseColumns, baseColumnsWithSoftDelete, timestamps } from "../../utils";
import { profiles } from "./profiles";

// ============================================================================
// Enums
// ============================================================================

export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "hidden"]);

export const reportStatusEnum = pgEnum("report_status", ["pending", "resolved", "dismissed"]);

export const reportReasonEnum = pgEnum("report_reason", [
  "spam",
  "inappropriate",
  "offensive",
  "fake",
  "other",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Reviews Table
 *
 * Polymorphic review system that can attach to any entity type.
 * Uses text-based targetType for flexibility with Zod validation in tRPC.
 */
export const reviews = pgTable(
  "reviews",
  {
    ...baseColumnsWithSoftDelete(),

    // Polymorphic relationship
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),

    // Author
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    // Review content
    rating: integer("rating").notNull(), // 1-5
    title: text("title").notNull(),
    content: text("content").notNull(),
    images: uuid("images").array().default([]), // File IDs from files table

    // Metadata
    verifiedPurchase: boolean("verified_purchase").notNull().default(false),
    helpfulCount: integer("helpful_count").notNull().default(0), // Denormalized for performance

    // Status
    status: reviewStatusEnum("status").notNull().default("approved"),
  },
  (table) => [
    // CRITICAL: Prevent duplicate reviews from same user on same target
    uniqueIndex("reviews_unique_user_target").on(table.targetType, table.targetId, table.authorId),

    // Performance indexes
    index("idx_reviews_target").on(table.targetType, table.targetId),
    index("idx_reviews_author").on(table.authorId),
    index("idx_reviews_status").on(table.status),
    index("idx_reviews_rating").on(table.targetType, table.targetId, table.rating),
  ]
);

/**
 * Review Helpful Votes
 *
 * Tracks which users found a review helpful.
 * Unique constraint prevents duplicate votes.
 */
export const reviewHelpful = pgTable(
  "review_helpful",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Prevent duplicate helpful votes
    uniqueIndex("review_helpful_unique").on(table.reviewId, table.userId),
    index("idx_review_helpful_review").on(table.reviewId),
    index("idx_review_helpful_user").on(table.userId),
  ]
);

/**
 * Review Reports
 *
 * Allows users to report abusive or inappropriate reviews.
 * Unique constraint prevents spam reporting.
 */
export const reviewReports = pgTable(
  "review_reports",
  {
    ...baseColumns(),

    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    // Report details
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),

    // Status tracking
    status: reportStatusEnum("status").notNull().default("pending"),
    resolvedBy: uuid("resolved_by").references(() => profiles.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    adminNotes: text("admin_notes"),
  },
  (table) => [
    // Prevent duplicate reports from same user on same review
    uniqueIndex("review_reports_unique").on(table.reviewId, table.reporterId),
    index("idx_review_reports_review").on(table.reviewId),
    index("idx_review_reports_status").on(table.status),
  ]
);

/**
 * Review Summary
 *
 * Denormalized aggregation table for performance.
 * Updated on review create/update/delete operations.
 */
export const reviewSummary = pgTable(
  "review_summary",
  {
    // Composite key
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),

    // Aggregated data
    totalCount: integer("total_count").notNull().default(0),
    averageRating: numeric("average_rating", { precision: 3, scale: 2 }),

    // Rating distribution
    rating1Count: integer("rating_1_count").notNull().default(0),
    rating2Count: integer("rating_2_count").notNull().default(0),
    rating3Count: integer("rating_3_count").notNull().default(0),
    rating4Count: integer("rating_4_count").notNull().default(0),
    rating5Count: integer("rating_5_count").notNull().default(0),

    ...timestamps(),
  },
  (table) => [
    // Unique constraint on composite key
    uniqueIndex("review_summary_unique").on(table.targetType, table.targetId),
  ]
);

// ============================================================================
// Type Exports
// ============================================================================

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type ReviewHelpful = typeof reviewHelpful.$inferSelect;
export type NewReviewHelpful = typeof reviewHelpful.$inferInsert;

export type ReviewReport = typeof reviewReports.$inferSelect;
export type NewReviewReport = typeof reviewReports.$inferInsert;

export type ReviewSummary = typeof reviewSummary.$inferSelect;
export type NewReviewSummary = typeof reviewSummary.$inferInsert;

// Type unions for enum values
export type ReviewStatus = "pending" | "approved" | "hidden";
export type ReportStatus = "pending" | "resolved" | "dismissed";
export type ReportReason = "spam" | "inappropriate" | "offensive" | "fake" | "other";
