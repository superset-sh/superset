/**
 * Reaction Feature Schema
 * Polymorphic 리액션 시스템
 */
import { profiles } from "../../core/profiles";
import { baseColumns } from "../../../utils";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Reactions 테이블
 * - Polymorphic 리액션 (모든 콘텐츠에 적용 가능)
 */
export const reactions = pgTable(
  "reaction_reactions",
  {
    ...baseColumns(),
    targetType: text("target_type").notNull(), // 'board_post' | 'comment' | 'blog_post' | ...
    targetId: uuid("target_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("like"), // 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'
  },
  (table) => [
    uniqueIndex("reaction_reactions_unique_idx").on(
      table.targetType,
      table.targetId,
      table.userId,
      table.type,
    ),
    index("reaction_reactions_target_idx").on(table.targetType, table.targetId),
    index("reaction_reactions_user_idx").on(table.userId),
  ],
);

// Type exports
export type Reaction = typeof reactions.$inferSelect;
export type NewReaction = typeof reactions.$inferInsert;
