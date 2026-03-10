/**
 * Community Feature Schema
 * Reddit-style communities with posts, comments, voting, and moderation
 */
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
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

export const communityTypeEnum = pgEnum("community_type", ["public", "restricted", "private"]);

export const postTypeEnum = pgEnum("community_post_type", [
  "text",
  "link",
  "image",
  "video",
  "poll",
]);

export const postStatusEnum = pgEnum("community_post_status", [
  "draft",
  "published",
  "hidden",
  "removed",
  "deleted",
]);

export const distinguishedEnum = pgEnum("community_comment_distinguished", ["moderator", "admin"]);

export const voteTargetTypeEnum = pgEnum("community_vote_target_type", ["post", "comment"]);

export const memberRoleEnum = pgEnum("community_member_role", [
  "member",
  "moderator",
  "admin",
  "owner",
]);

export const ruleAppliesTo = pgEnum("community_rule_applies_to", ["posts", "comments", "both"]);

export const ruleViolationActionEnum = pgEnum("community_rule_violation_action", [
  "flag",
  "remove",
  "warn",
]);

export const flairTypeEnum = pgEnum("community_flair_type", ["post", "user"]);

export const communityReportTargetTypeEnum = pgEnum("community_report_target_type", [
  "post",
  "comment",
  "user",
]);

export const communityReportReasonEnum = pgEnum("community_report_reason", [
  "spam",
  "harassment",
  "hate_speech",
  "misinformation",
  "nsfw",
  "violence",
  "copyright",
  "other",
]);

export const communityReportStatusEnum = pgEnum("community_report_status", [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
]);

export const communityReportActionEnum = pgEnum("community_report_action", [
  "removed",
  "banned",
  "warned",
  "dismissed",
]);

export const modActionEnum = pgEnum("community_mod_action", [
  "remove_post",
  "remove_comment",
  "ban_user",
  "unban_user",
  "pin_post",
  "lock_post",
  "add_flair",
  "edit_rules",
  "other",
]);

export const modLogTargetTypeEnum = pgEnum("community_mod_log_target_type", [
  "post",
  "comment",
  "user",
  "community",
]);

// ============================================================================
// Types
// ============================================================================

export type AutomodConfig = {
  enableSpamFilter?: boolean;
  enableKeywordFilter?: boolean;
  minKarmaToPost?: number;
  minAccountAge?: number;
};

export type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

export type PollData = {
  options: Array<{ id: string; text: string; voteCount: number }>;
  multipleChoice: boolean;
  expiresAt?: string;
};

export type ModeratorPermissions = {
  managePosts: boolean;
  manageComments: boolean;
  manageUsers: boolean;
  manageFlairs: boolean;
  manageRules: boolean;
  manageSettings: boolean;
  manageModerators: boolean;
  viewModLog: boolean;
  viewReports: boolean;
};

// ============================================================================
// Tables
// ============================================================================

/**
 * Communities Table (서브커뮤니티)
 *
 * Reddit-style communities where users can create and join topic-based boards.
 */
export const communities = pgTable(
  "community_communities",
  {
    ...baseColumns(),

    // Basic info
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    iconUrl: text("icon_url"),
    bannerUrl: text("banner_url"),

    // Ownership
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    // Settings
    type: communityTypeEnum("type").notNull().default("public"),
    isOfficial: boolean("is_official").notNull().default(false),
    isNsfw: boolean("is_nsfw").notNull().default(false),
    allowImages: boolean("allow_images").notNull().default(true),
    allowVideos: boolean("allow_videos").notNull().default(true),
    allowPolls: boolean("allow_polls").notNull().default(true),
    allowCrosspost: boolean("allow_crosspost").notNull().default(true),

    // Statistics (cached)
    memberCount: integer("member_count").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    onlineCount: integer("online_count").notNull().default(0),

    // Moderation
    rules: jsonb("rules").$type<Array<{ title: string; description: string }>>().default([]),
    automodConfig: jsonb("automod_config").$type<AutomodConfig>().default({}),
    bannedWords: text("banned_words").array().default([]),
  },
  (table) => [
    index("idx_communities_slug").on(table.slug),
    index("idx_communities_owner").on(table.ownerId),
    index("idx_communities_type").on(table.type),
    index("idx_communities_member_count").on(table.memberCount),
  ]
);

/**
 * Community Posts Table
 *
 * Posts in communities with support for multiple content types.
 */
export const communityPosts = pgTable(
  "community_posts",
  {
    ...baseColumns(),

    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    // Basic info
    title: text("title").notNull(),
    content: text("content"),
    type: postTypeEnum("type").notNull().default("text"),

    // Type-specific data
    linkUrl: text("link_url"),
    linkPreview: jsonb("link_preview").$type<LinkPreview>(),
    mediaUrls: jsonb("media_urls").$type<string[]>().default([]),
    pollData: jsonb("poll_data")
      .$type<PollData>()
      .default({ options: [], multipleChoice: false }),

    // Metadata
    flairId: uuid("flair_id"),
    isNsfw: boolean("is_nsfw").notNull().default(false),
    isSpoiler: boolean("is_spoiler").notNull().default(false),
    isOc: boolean("is_oc").notNull().default(false),

    // Status
    status: postStatusEnum("status").notNull().default("published"),
    isPinned: boolean("is_pinned").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    removalReason: text("removal_reason"),
    removedBy: uuid("removed_by").references(() => profiles.id),

    // Statistics
    viewCount: integer("view_count").notNull().default(0),
    upvoteCount: integer("upvote_count").notNull().default(0),
    downvoteCount: integer("downvote_count").notNull().default(0),
    voteScore: integer("vote_score").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),

    // Crosspost
    crosspostParentId: uuid("crosspost_parent_id"),

    // Algorithm
    hotScore: doublePrecision("hot_score").notNull().default(0),

    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_posts_community").on(table.communityId),
    index("idx_posts_author").on(table.authorId),
    index("idx_posts_status").on(table.status),
    index("idx_posts_created").on(table.createdAt),
    index("idx_posts_hot_score").on(table.hotScore),
    index("idx_posts_vote_score").on(table.voteScore),
    index("idx_posts_community_status").on(table.communityId, table.status),
  ]
);

/**
 * Community Comments Table
 *
 * Threaded comments with infinite nesting support.
 */
export const communityComments = pgTable(
  "community_comments",
  {
    ...baseColumns(),

    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),

    // Content
    content: text("content").notNull(),
    depth: integer("depth").notNull().default(0),

    // Status
    isDeleted: boolean("is_deleted").notNull().default(false),
    isRemoved: boolean("is_removed").notNull().default(false),
    removalReason: text("removal_reason"),
    removedBy: uuid("removed_by").references(() => profiles.id),
    isEdited: boolean("is_edited").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),

    // Statistics
    upvoteCount: integer("upvote_count").notNull().default(0),
    downvoteCount: integer("downvote_count").notNull().default(0),
    voteScore: integer("vote_score").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),

    // Moderator features
    isStickied: boolean("is_stickied").notNull().default(false),
    distinguished: distinguishedEnum("distinguished"),
  },
  (table) => [
    index("idx_community_comments_post").on(table.postId),
    index("idx_community_comments_author").on(table.authorId),
    index("idx_community_comments_parent").on(table.parentId),
    index("idx_community_comments_vote_score").on(table.voteScore),
    index("idx_community_comments_created").on(table.createdAt),
  ]
);

/**
 * Community Votes Table
 *
 * Upvotes and downvotes for posts and comments.
 */
export const communityVotes = pgTable(
  "community_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    targetType: voteTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),

    // 1 = upvote, -1 = downvote
    vote: integer("vote").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("community_votes_unique").on(table.userId, table.targetType, table.targetId),
    index("idx_votes_target").on(table.targetType, table.targetId),
    index("idx_votes_user").on(table.userId),
  ]
);

/**
 * Community Memberships Table
 *
 * Tracks user membership in communities, including role and ban status.
 */
export const communityMemberships = pgTable(
  "community_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    // Role
    role: memberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),

    // Ban status
    isBanned: boolean("is_banned").notNull().default(false),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    bannedReason: text("banned_reason"),
    bannedBy: uuid("banned_by").references(() => profiles.id),
    banExpiresAt: timestamp("ban_expires_at", { withTimezone: true }),

    // Mute status
    isMuted: boolean("is_muted").notNull().default(false),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),

    // User settings
    notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
    flairText: text("flair_text"),
    flairColor: text("flair_color"),
  },
  (table) => [
    uniqueIndex("community_memberships_unique").on(table.communityId, table.userId),
    index("idx_memberships_community").on(table.communityId),
    index("idx_memberships_user").on(table.userId),
    index("idx_memberships_role").on(table.role),
  ]
);

/**
 * Community Moderators Table
 *
 * Moderators with granular permissions for each community.
 */
export const communityModerators = pgTable(
  "community_moderators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    // Permissions
    permissions: jsonb("permissions")
      .$type<ModeratorPermissions>()
      .notNull()
      .default({
        managePosts: true,
        manageComments: true,
        manageUsers: true,
        manageFlairs: false,
        manageRules: false,
        manageSettings: false,
        manageModerators: false,
        viewModLog: true,
        viewReports: true,
      }),

    appointedBy: uuid("appointed_by")
      .notNull()
      .references(() => profiles.id),
    appointedAt: timestamp("appointed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("community_moderators_unique").on(table.communityId, table.userId),
    index("idx_moderators_community").on(table.communityId),
    index("idx_moderators_user").on(table.userId),
  ]
);

/**
 * Community Rules Table
 *
 * Community-specific rules with automatic enforcement options.
 */
export const communityRules = pgTable(
  "community_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description").notNull(),

    // Enforcement
    appliesTo: ruleAppliesTo("applies_to").notNull().default("both"),
    violationAction: ruleViolationActionEnum("violation_action"),

    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_rules_community").on(table.communityId)]
);

/**
 * Community Flairs Table
 *
 * Custom flairs for posts and users in each community.
 */
export const communityFlairs = pgTable(
  "community_flairs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),

    type: flairTypeEnum("type").notNull(),
    text: text("text").notNull(),
    color: text("color").notNull().default("#ffffff"),
    backgroundColor: text("background_color").notNull().default("#0079d3"),

    // Restrictions
    modOnly: boolean("mod_only").notNull().default(false),

    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_flairs_community").on(table.communityId),
    index("idx_flairs_type").on(table.type),
  ]
);

/**
 * Community Reports Table
 *
 * User reports for posts, comments, and users.
 */
export const communityReports = pgTable(
  "community_reports",
  {
    ...baseColumns(),

    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    targetType: communityReportTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),

    reason: communityReportReasonEnum("reason").notNull(),
    ruleViolated: integer("rule_violated"),
    description: text("description"),

    // Resolution
    status: communityReportStatusEnum("status").notNull().default("pending"),
    resolvedBy: uuid("resolved_by").references(() => profiles.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    actionTaken: communityReportActionEnum("action_taken"),
  },
  (table) => [
    index("idx_reports_community").on(table.communityId),
    index("idx_reports_status").on(table.status),
    index("idx_reports_target").on(table.targetType, table.targetId),
    index("idx_reports_reporter").on(table.reporterId),
  ]
);

/**
 * Community Bans Table
 *
 * User bans at the community level.
 */
export const communityBans = pgTable(
  "community_bans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    bannedBy: uuid("banned_by")
      .notNull()
      .references(() => profiles.id),

    reason: text("reason").notNull(),
    note: text("note"),

    // Ban type
    isPermanent: boolean("is_permanent").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("community_bans_unique").on(table.communityId, table.userId),
    index("idx_bans_community").on(table.communityId),
    index("idx_bans_user").on(table.userId),
  ]
);

/**
 * Community Mod Logs Table
 *
 * Audit log for all moderator actions in communities.
 */
export const communityModLogs = pgTable(
  "community_mod_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    moderatorId: uuid("moderator_id")
      .notNull()
      .references(() => profiles.id),

    action: modActionEnum("action").notNull(),
    targetType: modLogTargetTypeEnum("target_type"),
    targetId: uuid("target_id"),

    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    reason: text("reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mod_logs_community").on(table.communityId),
    index("idx_mod_logs_moderator").on(table.moderatorId),
    index("idx_mod_logs_action").on(table.action),
    index("idx_mod_logs_created").on(table.createdAt),
  ]
);

/**
 * Community Saved Posts Table
 *
 * Users can save posts for later viewing.
 */
export const communitySavedPosts = pgTable(
  "community_saved_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("community_saved_posts_unique").on(table.userId, table.postId),
    index("idx_saved_posts_user").on(table.userId),
    index("idx_saved_posts_post").on(table.postId),
  ]
);

/**
 * User Karma Table
 *
 * Aggregated karma scores for users based on their posts and comments.
 */
export const userKarma = pgTable("community_user_karma", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),

  postKarma: integer("post_karma").notNull().default(0),
  commentKarma: integer("comment_karma").notNull().default(0),
  totalKarma: integer("total_karma").notNull().default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;
export type CommunityType = "public" | "restricted" | "private";

export type CommunityPost = typeof communityPosts.$inferSelect;
export type NewCommunityPost = typeof communityPosts.$inferInsert;
export type PostType = "text" | "link" | "image" | "video" | "poll";
export type PostStatus = "draft" | "published" | "hidden" | "removed" | "deleted";

export type CommunityComment = typeof communityComments.$inferSelect;
export type NewCommunityComment = typeof communityComments.$inferInsert;
export type Distinguished = "moderator" | "admin" | null;

export type CommunityVote = typeof communityVotes.$inferSelect;
export type NewCommunityVote = typeof communityVotes.$inferInsert;
export type VoteTargetType = "post" | "comment";

export type CommunityMembership = typeof communityMemberships.$inferSelect;
export type NewCommunityMembership = typeof communityMemberships.$inferInsert;
export type MemberRole = "member" | "moderator" | "admin" | "owner";

export type CommunityModerator = typeof communityModerators.$inferSelect;
export type NewCommunityModerator = typeof communityModerators.$inferInsert;

export type CommunityRule = typeof communityRules.$inferSelect;
export type NewCommunityRule = typeof communityRules.$inferInsert;
export type RuleAppliesTo = "posts" | "comments" | "both";
export type RuleViolationAction = "flag" | "remove" | "warn" | null;

export type CommunityFlair = typeof communityFlairs.$inferSelect;
export type NewCommunityFlair = typeof communityFlairs.$inferInsert;
export type FlairType = "post" | "user";

export type CommunityReport = typeof communityReports.$inferSelect;
export type NewCommunityReport = typeof communityReports.$inferInsert;
export type CommunityReportTargetType = "post" | "comment" | "user";
export type CommunityReportReason =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "misinformation"
  | "nsfw"
  | "violence"
  | "copyright"
  | "other";
export type CommunityReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";
export type CommunityReportAction = "removed" | "banned" | "warned" | "dismissed" | null;

export type CommunityBan = typeof communityBans.$inferSelect;
export type NewCommunityBan = typeof communityBans.$inferInsert;

export type CommunityModLog = typeof communityModLogs.$inferSelect;
export type NewCommunityModLog = typeof communityModLogs.$inferInsert;
export type ModAction =
  | "remove_post"
  | "remove_comment"
  | "ban_user"
  | "unban_user"
  | "pin_post"
  | "lock_post"
  | "add_flair"
  | "edit_rules"
  | "other";
export type ModLogTargetType = "post" | "comment" | "user" | "community" | null;

export type CommunitySavedPost = typeof communitySavedPosts.$inferSelect;
export type NewCommunitySavedPost = typeof communitySavedPosts.$inferInsert;

export type UserKarma = typeof userKarma.$inferSelect;
export type NewUserKarma = typeof userKarma.$inferInsert;
