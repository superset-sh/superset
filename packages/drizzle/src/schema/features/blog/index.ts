import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const blogPostStatusEnum = pgEnum("blog_post_status", [
  "draft",
  "published",
  "archived",
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Blog Posts Table
 *
 * Core table for Medium-style blog articles.
 */
export const blogPosts = pgTable(
  "blog_posts",
  {
    ...baseColumns(),

    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    
    // Tiptap JSON content or HTML
    content: text("content"),
    excerpt: text("excerpt"),
    coverImage: text("cover_image"),

    status: blogPostStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    // Stats
    readTimeMinutes: integer("read_time_minutes").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    clapsCount: integer("claps_count").notNull().default(0),
    responsesCount: integer("responses_count").notNull().default(0),
  }
);

/**
 * Blog Tags Table
 *
 * Tags for categorizing blog posts.
 */
export const blogTags = pgTable(
  "blog_tags",
  {
    ...baseColumns(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
  }
);

/**
 * Blog Post Tags Table
 *
 * Many-to-many relationship between posts and tags.
 */
export const blogPostTags = pgTable(
  "blog_post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => blogTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("blog_post_tags_unique").on(table.postId, table.tagId),
  ]
);

/**
 * Blog Claps Table
 *
 * Tracks user claps (1-50 per user per post) similar to Medium.
 */
export const blogClaps = pgTable(
  "blog_claps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    
    // Medium allows up to 50 claps
    count: integer("count").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("blog_claps_unique").on(table.postId, table.userId),
  ]
);

/**
 * Blog Responses (Comments) Table
 *
 * Threaded responses for blog posts.
 */
export const blogResponses = pgTable(
  "blog_responses",
  {
    ...baseColumns(),

    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // Self-referencing for threads

    content: text("content").notNull(),
    clapsCount: integer("claps_count").notNull().default(0),
    
    isDeleted: boolean("is_deleted").notNull().default(false),
  }
);

/**
 * Blog Bookmarks Table
 *
 * Saved reading list for users.
 */
export const blogBookmarks = pgTable(
  "blog_bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("blog_bookmarks_unique").on(table.userId, table.postId),
  ]
);

// ============================================================================
// Type Exports
// ============================================================================

export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
export type BlogPostStatus = "draft" | "published" | "archived";

export type BlogTag = typeof blogTags.$inferSelect;
export type NewBlogTag = typeof blogTags.$inferInsert;

export type BlogPostTag = typeof blogPostTags.$inferSelect;
export type NewBlogPostTag = typeof blogPostTags.$inferInsert;

export type BlogClap = typeof blogClaps.$inferSelect;
export type NewBlogClap = typeof blogClaps.$inferInsert;

export type BlogResponse = typeof blogResponses.$inferSelect;
export type NewBlogResponse = typeof blogResponses.$inferInsert;

export type BlogBookmark = typeof blogBookmarks.$inferSelect;
export type NewBlogBookmark = typeof blogBookmarks.$inferInsert;
