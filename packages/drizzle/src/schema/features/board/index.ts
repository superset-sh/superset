/**
 * Board Feature Schema
 * 게시판 및 게시물 관련 테이블
 */
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import { boolean, integer, jsonb, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const boardTypeEnum = pgEnum("board_type", ["general", "gallery", "qna"]);
export const boardPostStatusEnum = pgEnum("board_post_status", ["draft", "published", "hidden"]);

// ============================================================================
// Types
// ============================================================================

export type BoardSettings = {
  allowAnonymous?: boolean;
  allowComments?: boolean;
  allowAttachments?: boolean;
  maxAttachments?: number;
  allowedFileTypes?: string[];
  postsPerPage?: number;
};

// ============================================================================
// Tables
// ============================================================================

/**
 * Boards 테이블
 * - 게시판 정의 테이블
 */
export const boards = pgTable("board_boards", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  type: boardTypeEnum("type").notNull().default("general"),
  description: text("description"),
  settings: jsonb("settings").$type<BoardSettings>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
});

/**
 * Board Posts 테이블
 * - 게시물 테이블
 */
export const boardPosts = pgTable("board_posts", {
  ...baseColumns(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  status: boardPostStatusEnum("status").notNull().default("draft"),
  viewCount: integer("view_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  isNotice: boolean("is_notice").notNull().default(false),
});

/**
 * Board Post Attachments 테이블
 * - 게시물 첨부파일 연결 테이블
 */
export const boardPostAttachments = pgTable("board_post_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => boardPosts.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull(), // files 테이블 참조 (선택적)
  order: integer("order").notNull().default(0),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;

export type BoardPost = typeof boardPosts.$inferSelect;
export type NewBoardPost = typeof boardPosts.$inferInsert;

export type BoardPostAttachment = typeof boardPostAttachments.$inferSelect;
export type NewBoardPostAttachment = typeof boardPostAttachments.$inferInsert;
