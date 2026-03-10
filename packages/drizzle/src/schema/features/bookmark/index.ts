/**
 * Bookmark Feature Schema
 * Polymorphic 북마크 시스템
 */
import { profiles } from "../../core/profiles";
import { baseColumns } from "../../../utils";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Bookmarks 테이블
 * - Polymorphic 북마크 (모든 콘텐츠에 적용 가능)
 */
export const bookmarks = pgTable(
  "bookmark_bookmarks",
  {
    ...baseColumns(),
    targetType: text("target_type").notNull(), // 'board_post' | 'community_post' | 'blog_post' | ...
    targetId: uuid("target_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("bookmark_bookmarks_unique_idx").on(
      table.targetType,
      table.targetId,
      table.userId,
    ),
    index("bookmark_bookmarks_target_idx").on(table.targetType, table.targetId),
    index("bookmark_bookmarks_user_idx").on(table.userId),
  ],
);

// Type exports
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
