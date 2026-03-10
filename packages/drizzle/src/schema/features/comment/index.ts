/**
 * Comment Feature Schema
 * Polymorphic 댓글 시스템
 */
import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { profiles } from "../../core/profiles";

/**
 * 댓글 대상 타입 (Polymorphic)
 */
export const commentTargetType = pgEnum("comment_target_type", [
  "board_post",
  "community_post",
  "blog_post",
  "page",
]);

/**
 * 댓글 상태
 */
export const commentStatus = pgEnum("comment_status", [
  "visible",
  "hidden",
  "deleted",
]);

/**
 * Comments 테이블
 */
export const comments = pgTable(
  "comment_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    targetType: commentTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    parentId: uuid("parent_id"),
    depth: integer("depth").notNull().default(0),
    status: commentStatus("status").notNull().default("visible"),
    mentions: jsonb("mentions").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_comment_comments_target").on(table.targetType, table.targetId),
    index("idx_comment_comments_parent").on(table.parentId),
    index("idx_comment_comments_author").on(table.authorId),
  ]
);

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(profiles, {
    fields: [comments.authorId],
    references: [profiles.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "parentChild",
  }),
  children: many(comments, {
    relationName: "parentChild",
  }),
}));

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
