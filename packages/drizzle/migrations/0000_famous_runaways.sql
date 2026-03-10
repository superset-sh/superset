CREATE TYPE "public"."report_reason" AS ENUM('spam', 'inappropriate', 'offensive', 'fake', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."board_post_status" AS ENUM('draft', 'published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."board_type" AS ENUM('general', 'gallery', 'qna');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('visible', 'hidden', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."comment_target_type" AS ENUM('board_post', 'community_post', 'blog_post', 'page');--> statement-breakpoint
CREATE TYPE "public"."community_report_action" AS ENUM('removed', 'banned', 'warned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."community_report_reason" AS ENUM('spam', 'harassment', 'hate_speech', 'misinformation', 'nsfw', 'violence', 'copyright', 'other');--> statement-breakpoint
CREATE TYPE "public"."community_report_status" AS ENUM('pending', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."community_report_target_type" AS ENUM('post', 'comment', 'user');--> statement-breakpoint
CREATE TYPE "public"."community_type" AS ENUM('public', 'restricted', 'private');--> statement-breakpoint
CREATE TYPE "public"."community_comment_distinguished" AS ENUM('moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."community_flair_type" AS ENUM('post', 'user');--> statement-breakpoint
CREATE TYPE "public"."community_member_role" AS ENUM('member', 'moderator', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "public"."community_mod_action" AS ENUM('remove_post', 'remove_comment', 'ban_user', 'unban_user', 'pin_post', 'lock_post', 'add_flair', 'edit_rules', 'other');--> statement-breakpoint
CREATE TYPE "public"."community_mod_log_target_type" AS ENUM('post', 'comment', 'user', 'community');--> statement-breakpoint
CREATE TYPE "public"."community_post_status" AS ENUM('draft', 'published', 'hidden', 'removed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."community_post_type" AS ENUM('text', 'link', 'image', 'video', 'poll');--> statement-breakpoint
CREATE TYPE "public"."community_rule_applies_to" AS ENUM('posts', 'comments', 'both');--> statement-breakpoint
CREATE TYPE "public"."community_rule_violation_action" AS ENUM('flag', 'remove', 'warn');--> statement-breakpoint
CREATE TYPE "public"."community_vote_target_type" AS ENUM('post', 'comment');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'opened');--> statement-breakpoint
CREATE TYPE "public"."email_template_type" AS ENUM('welcome', 'email-verification', 'password-reset', 'password-changed', 'notification');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('comment', 'like', 'follow', 'mention', 'system', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."payment_plan_tier" AS ENUM('free', 'pro', 'team', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."payment_credit_transaction_type" AS ENUM('allocation', 'deduction', 'purchase', 'refund', 'adjustment', 'expiration');--> statement-breakpoint
CREATE TYPE "public"."agent_message_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."marketing_campaign_status" AS ENUM('draft', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."marketing_content_source" AS ENUM('editor', 'board_post', 'community_post', 'content_studio');--> statement-breakpoint
CREATE TYPE "public"."marketing_publication_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."marketing_sns_platform" AS ENUM('facebook', 'instagram', 'threads', 'x', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."system_job_run_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."system_audit_action" AS ENUM('create', 'update', 'delete', 'assign', 'adjust', 'sync', 'config_change');--> statement-breakpoint
CREATE TYPE "public"."studio_content_status" AS ENUM('draft', 'writing', 'review', 'published', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."studio_node_type" AS ENUM('topic', 'content');--> statement-breakpoint
CREATE TYPE "public"."studio_repurpose_format" AS ENUM('card_news', 'short_form', 'twitter_thread', 'email_summary');--> statement-breakpoint
CREATE TYPE "public"."studio_sentence_length" AS ENUM('short', 'medium', 'long');--> statement-breakpoint
CREATE TYPE "public"."studio_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."booking_consultation_mode" AS ENUM('online', 'offline', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."booking_override_type" AS ENUM('unavailable', 'available');--> statement-breakpoint
CREATE TYPE "public"."booking_product_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."booking_provider_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'completed', 'no_show', 'cancelled_by_user', 'cancelled_by_provider', 'refunded', 'expired');--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"url" text NOT NULL,
	"bucket" text DEFAULT 'files' NOT NULL,
	"path" text NOT NULL,
	"public_url" text,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_helpful" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"admin_notes" text
);
--> statement-breakpoint
CREATE TABLE "review_summary" (
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"average_rating" numeric(3, 2),
	"rating_1_count" integer DEFAULT 0 NOT NULL,
	"rating_2_count" integer DEFAULT 0 NOT NULL,
	"rating_3_count" integer DEFAULT 0 NOT NULL,
	"rating_4_count" integer DEFAULT 0 NOT NULL,
	"rating_5_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"images" uuid[] DEFAULT '{}',
	"verified_purchase" boolean DEFAULT false NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"status" "review_status" DEFAULT 'approved' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"color" text,
	"icon" text,
	"priority" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"scope" text,
	"description" text,
	"category" text,
	CONSTRAINT "unique_permission" UNIQUE("resource","action","scope")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_role_permission" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_role" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key" text NOT NULL,
	"action" text NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_post_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"board_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"status" "board_post_status" DEFAULT 'draft' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_notice" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"type" "board_type" DEFAULT 'general' NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "board_boards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "comment_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"author_id" uuid NOT NULL,
	"target_type" "comment_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"parent_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"icon_url" text,
	"banner_url" text,
	"owner_id" uuid NOT NULL,
	"type" "community_type" DEFAULT 'public' NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"allow_images" boolean DEFAULT true NOT NULL,
	"allow_videos" boolean DEFAULT true NOT NULL,
	"allow_polls" boolean DEFAULT true NOT NULL,
	"allow_crosspost" boolean DEFAULT true NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"online_count" integer DEFAULT 0 NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb,
	"automod_config" jsonb DEFAULT '{}'::jsonb,
	"banned_words" text[] DEFAULT '{}',
	CONSTRAINT "community_communities_name_unique" UNIQUE("name"),
	CONSTRAINT "community_communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"is_permanent" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"content" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_removed" boolean DEFAULT false NOT NULL,
	"removal_reason" text,
	"removed_by" uuid,
	"is_edited" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp with time zone,
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"downvote_count" integer DEFAULT 0 NOT NULL,
	"vote_score" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"is_stickied" boolean DEFAULT false NOT NULL,
	"distinguished" "community_comment_distinguished"
);
--> statement-breakpoint
CREATE TABLE "community_flairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"type" "community_flair_type" NOT NULL,
	"text" text NOT NULL,
	"color" text DEFAULT '#ffffff' NOT NULL,
	"background_color" text DEFAULT '#0079d3' NOT NULL,
	"mod_only" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "community_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"banned_at" timestamp with time zone,
	"banned_reason" text,
	"banned_by" uuid,
	"ban_expires_at" timestamp with time zone,
	"is_muted" boolean DEFAULT false NOT NULL,
	"muted_until" timestamp with time zone,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"flair_text" text,
	"flair_color" text
);
--> statement-breakpoint
CREATE TABLE "community_mod_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"moderator_id" uuid NOT NULL,
	"action" "community_mod_action" NOT NULL,
	"target_type" "community_mod_log_target_type",
	"target_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_moderators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permissions" jsonb DEFAULT '{"managePosts":true,"manageComments":true,"manageUsers":true,"manageFlairs":false,"manageRules":false,"manageSettings":false,"manageModerators":false,"viewModLog":true,"viewReports":true}'::jsonb NOT NULL,
	"appointed_by" uuid NOT NULL,
	"appointed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"community_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"type" "community_post_type" DEFAULT 'text' NOT NULL,
	"link_url" text,
	"link_preview" jsonb,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"poll_data" jsonb DEFAULT '{"options":[],"multipleChoice":false}'::jsonb,
	"flair_id" uuid,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"is_oc" boolean DEFAULT false NOT NULL,
	"status" "community_post_status" DEFAULT 'published' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"removal_reason" text,
	"removed_by" uuid,
	"view_count" integer DEFAULT 0 NOT NULL,
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"downvote_count" integer DEFAULT 0 NOT NULL,
	"vote_score" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"crosspost_parent_id" uuid,
	"hot_score" double precision DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"community_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "community_report_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "community_report_reason" NOT NULL,
	"rule_violated" integer,
	"description" text,
	"status" "community_report_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"action_taken" "community_report_action"
);
--> statement-breakpoint
CREATE TABLE "community_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"applies_to" "community_rule_applies_to" DEFAULT 'both' NOT NULL,
	"violation_action" "community_rule_violation_action",
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_saved_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" "community_vote_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"vote" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_user_karma" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"post_karma" integer DEFAULT 0 NOT NULL,
	"comment_karma" integer DEFAULT 0 NOT NULL,
	"total_karma" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"recipient_id" uuid,
	"template_type" "email_template_type" NOT NULL,
	"subject" text NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"channels" jsonb DEFAULT '["inapp"]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "notification_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"data" jsonb,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lemon_squeezy_id" text NOT NULL,
	"user_id" uuid,
	"order_id" uuid,
	"subscription_id" uuid,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"status_formatted" text,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"activation_limit" integer,
	"activation_usage" integer DEFAULT 0 NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "payment_licenses_lemon_squeezy_id_unique" UNIQUE("lemon_squeezy_id"),
	CONSTRAINT "payment_licenses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lemon_squeezy_id" text NOT NULL,
	"order_number" integer NOT NULL,
	"user_id" uuid,
	"product_id" uuid,
	"customer_email" text NOT NULL,
	"customer_name" text,
	"status" text NOT NULL,
	"status_formatted" text,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"refunded" boolean DEFAULT false NOT NULL,
	"refunded_at" timestamp with time zone,
	"refund_amount" integer,
	"test_mode" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"urls" jsonb,
	CONSTRAINT "payment_orders_lemon_squeezy_id_unique" UNIQUE("lemon_squeezy_id")
);
--> statement-breakpoint
CREATE TABLE "payment_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lemon_squeezy_id" text NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"subscription_interval" text,
	"subscription_interval_count" integer DEFAULT 1,
	"has_license" boolean DEFAULT false NOT NULL,
	"license_length_value" integer,
	"license_length_unit" text,
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "payment_products_lemon_squeezy_id_unique" UNIQUE("lemon_squeezy_id")
);
--> statement-breakpoint
CREATE TABLE "payment_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lemon_squeezy_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"customer_email" text NOT NULL,
	"customer_name" text,
	"status" text NOT NULL,
	"status_formatted" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"interval" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"renews_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"billing_anchor" integer,
	"first_subscription_item_id" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"resumes_at" timestamp with time zone,
	"test_mode" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"urls" jsonb,
	CONSTRAINT "payment_subscriptions_lemon_squeezy_id_unique" UNIQUE("lemon_squeezy_id")
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	CONSTRAINT "payment_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"tier" "payment_plan_tier" NOT NULL,
	"monthly_credits" integer NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"interval" text DEFAULT 'month',
	"lemon_squeezy_product_id" text,
	"lemon_squeezy_variant_id" text,
	"is_per_seat" boolean DEFAULT false NOT NULL,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "payment_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"balance" integer DEFAULT 0 NOT NULL,
	"monthly_allocation" integer DEFAULT 0 NOT NULL,
	"auto_recharge" boolean DEFAULT false NOT NULL,
	"auto_recharge_amount" integer,
	"auto_recharge_threshold" integer,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"last_recharged_at" timestamp with time zone,
	CONSTRAINT "payment_credit_balances_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "payment_credit_transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text,
	"metadata" jsonb,
	"related_order_id" uuid
);
--> statement-breakpoint
CREATE TABLE "payment_model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"input_credits_per_k_token" integer NOT NULL,
	"output_credits_per_k_token" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "payment_model_pricing_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
CREATE TABLE "reaction_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text DEFAULT 'like' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"avatar" text,
	"system_prompt" text NOT NULL,
	"model_preference" jsonb DEFAULT '{}'::jsonb,
	"enabled_tools" text[] DEFAULT '{}',
	"temperature" real DEFAULT 0.7 NOT NULL,
	"max_steps" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	CONSTRAINT "agent_agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "agent_message_role" NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"model_id" text,
	"token_usage" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"model_id" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"status" "marketing_campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "marketing_campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "marketing_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"campaign_id" uuid,
	"author_id" uuid NOT NULL,
	"source_type" "marketing_content_source" DEFAULT 'editor' NOT NULL,
	"source_id" uuid,
	"title" varchar(200) NOT NULL,
	"body" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"link_url" text,
	"tags" text[] DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "marketing_platform_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_id" uuid NOT NULL,
	"platform" "marketing_sns_platform" NOT NULL,
	"body" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "marketing_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_id" uuid NOT NULL,
	"variant_id" uuid,
	"sns_account_id" uuid NOT NULL,
	"platform" "marketing_sns_platform" NOT NULL,
	"status" "marketing_publication_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"platform_post_id" text,
	"platform_post_url" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text
);
--> statement-breakpoint
CREATE TABLE "marketing_sns_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "marketing_sns_platform" NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_username" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"page_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "system_job_run_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"result" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "system_scheduled_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"cron_expression" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"metadata" jsonb,
	CONSTRAINT "system_scheduled_jobs_job_key_unique" UNIQUE("job_key")
);
--> statement-breakpoint
CREATE TABLE "system_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "system_audit_action" NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"description" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "system_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"user_id" uuid,
	"resource_type" text,
	"resource_id" text,
	"event_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "system_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"metric_key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "uq_daily_metrics_date_key" UNIQUE("date","metric_key")
);
--> statement-breakpoint
CREATE TABLE "studio_ai_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"prompt" text,
	"rule" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"total_generated" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" uuid NOT NULL,
	"brand_name" varchar(100) NOT NULL,
	"industry" varchar(100),
	"target_audience" text,
	"formality" integer DEFAULT 3 NOT NULL,
	"friendliness" integer DEFAULT 3 NOT NULL,
	"humor" integer DEFAULT 2 NOT NULL,
	"sentence_length" "studio_sentence_length" DEFAULT 'medium' NOT NULL,
	"forbidden_words" text[] DEFAULT '{}',
	"required_words" text[] DEFAULT '{}',
	"additional_guidelines" text,
	"active_preset_id" uuid,
	CONSTRAINT "studio_brand_profiles_studio_id_unique" UNIQUE("studio_id")
);
--> statement-breakpoint
CREATE TABLE "studio_content_seo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_id" uuid NOT NULL,
	"seo_title" varchar(200),
	"seo_description" varchar(500),
	"seo_keywords" text[] DEFAULT '{}',
	"og_image_url" text,
	"seo_score" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"avg_time_on_page" real DEFAULT 0 NOT NULL,
	"bounce_rate" real DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"studio_id" uuid NOT NULL,
	"topic_id" uuid,
	"title" varchar(300) NOT NULL,
	"content" text,
	"summary" text,
	"thumbnail_url" text,
	"status" "studio_content_status" DEFAULT 'draft' NOT NULL,
	"position_x" real DEFAULT 0 NOT NULL,
	"position_y" real DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"author_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"label" varchar(50),
	"slug" varchar(300),
	"derived_from_id" uuid,
	"repurpose_format" "studio_repurpose_format"
);
--> statement-breakpoint
CREATE TABLE "studio_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_type" "studio_node_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" "studio_node_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"rule" varchar(50) NOT NULL,
	"template_content_id" uuid,
	"label" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_studios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"owner_id" uuid NOT NULL,
	"visibility" "studio_visibility" DEFAULT 'private' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_tone_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"formality" integer DEFAULT 3 NOT NULL,
	"friendliness" integer DEFAULT 3 NOT NULL,
	"humor" integer DEFAULT 2 NOT NULL,
	"sentence_length" "studio_sentence_length" DEFAULT 'medium' NOT NULL,
	"system_prompt_suffix" text,
	"is_system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"studio_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"color" varchar(20),
	"position_x" real DEFAULT 0 NOT NULL,
	"position_y" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"file_id" uuid,
	"url" text,
	"file_type" varchar(50),
	"title" varchar(200),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"summary" text,
	"content" jsonb,
	"thumbnail_url" text,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"author_id" uuid NOT NULL,
	"total_lessons" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "course_courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"last_position" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"section_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"video_file_id" uuid,
	"video_duration_seconds" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "course_topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"consultation_mode" "booking_consultation_mode" NOT NULL,
	"meeting_link" text,
	"location" text,
	"payment_amount" integer NOT NULL,
	"payment_reference" text,
	"refund_amount" integer,
	"refunded_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"slot_locked_until" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "booking_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"slug" varchar(100) NOT NULL,
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "booking_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_provider_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_provider_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_id" uuid NOT NULL,
	"bio" text,
	"experience_years" integer,
	"consultation_mode" "booking_consultation_mode" DEFAULT 'online' NOT NULL,
	"languages" text[] DEFAULT '{"ko"}' NOT NULL,
	"status" "booking_provider_status" DEFAULT 'inactive' NOT NULL,
	CONSTRAINT "booking_providers_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "booking_refund_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"rules" jsonb NOT NULL,
	"no_show_refund_percentage" integer DEFAULT 0 NOT NULL,
	"provider_cancel_refund_percentage" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_schedule_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"date" date NOT NULL,
	"override_type" "booking_override_type" NOT NULL,
	"start_time" time,
	"end_time" time,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_session_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'KRW' NOT NULL,
	"status" "booking_product_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_weekly_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_profiles_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_helpful" ADD CONSTRAINT "review_helpful_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_helpful" ADD CONSTRAINT "review_helpful_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_post_attachments" ADD CONSTRAINT "board_post_attachments_post_id_board_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_board_id_board_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."board_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_comments" ADD CONSTRAINT "comment_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_communities" ADD CONSTRAINT "community_communities_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_banned_by_profiles_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_removed_by_profiles_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_flairs" ADD CONSTRAINT "community_flairs_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_banned_by_profiles_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mod_logs" ADD CONSTRAINT "community_mod_logs_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_mod_logs" ADD CONSTRAINT "community_mod_logs_moderator_id_profiles_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_moderators" ADD CONSTRAINT "community_moderators_appointed_by_profiles_id_fk" FOREIGN KEY ("appointed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_removed_by_profiles_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_rules" ADD CONSTRAINT "community_rules_community_id_community_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."community_communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_saved_posts" ADD CONSTRAINT "community_saved_posts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_saved_posts" ADD CONSTRAINT "community_saved_posts_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_user_karma" ADD CONSTRAINT "community_user_karma_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_notifications" ADD CONSTRAINT "notification_notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_licenses" ADD CONSTRAINT "payment_licenses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_licenses" ADD CONSTRAINT "payment_licenses_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_licenses" ADD CONSTRAINT "payment_licenses_subscription_id_payment_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."payment_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_product_id_payment_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."payment_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_subscriptions" ADD CONSTRAINT "payment_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_subscriptions" ADD CONSTRAINT "payment_subscriptions_product_id_payment_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."payment_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_credit_balances" ADD CONSTRAINT "payment_credit_balances_plan_id_payment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_credit_transactions" ADD CONSTRAINT "payment_credit_transactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_reactions" ADD CONSTRAINT "reaction_reactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_agents" ADD CONSTRAINT "agent_agents_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_agent_id_agent_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_usage_logs" ADD CONSTRAINT "agent_usage_logs_agent_id_agent_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_usage_logs" ADD CONSTRAINT "agent_usage_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_usage_logs" ADD CONSTRAINT "agent_usage_logs_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_contents" ADD CONSTRAINT "marketing_contents_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_contents" ADD CONSTRAINT "marketing_contents_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_platform_variants" ADD CONSTRAINT "marketing_platform_variants_content_id_marketing_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."marketing_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_publications" ADD CONSTRAINT "marketing_publications_content_id_marketing_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."marketing_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_publications" ADD CONSTRAINT "marketing_publications_variant_id_marketing_platform_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."marketing_platform_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_publications" ADD CONSTRAINT "marketing_publications_sns_account_id_marketing_sns_accounts_id_fk" FOREIGN KEY ("sns_account_id") REFERENCES "public"."marketing_sns_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sns_accounts" ADD CONSTRAINT "marketing_sns_accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_job_runs" ADD CONSTRAINT "system_job_runs_job_id_system_scheduled_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."system_scheduled_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "system_audit_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_analytics_events" ADD CONSTRAINT "system_analytics_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_ai_recurrences" ADD CONSTRAINT "studio_ai_recurrences_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_ai_recurrences" ADD CONSTRAINT "studio_ai_recurrences_topic_id_studio_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."studio_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_ai_recurrences" ADD CONSTRAINT "studio_ai_recurrences_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_brand_profiles" ADD CONSTRAINT "studio_brand_profiles_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_content_seo" ADD CONSTRAINT "studio_content_seo_content_id_studio_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."studio_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contents" ADD CONSTRAINT "studio_contents_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contents" ADD CONSTRAINT "studio_contents_topic_id_studio_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."studio_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contents" ADD CONSTRAINT "studio_contents_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contents" ADD CONSTRAINT "studio_contents_derived_from_id_studio_contents_id_fk" FOREIGN KEY ("derived_from_id") REFERENCES "public"."studio_contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_edges" ADD CONSTRAINT "studio_edges_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_recurrences" ADD CONSTRAINT "studio_recurrences_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_recurrences" ADD CONSTRAINT "studio_recurrences_template_content_id_studio_contents_id_fk" FOREIGN KEY ("template_content_id") REFERENCES "public"."studio_contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_recurrences" ADD CONSTRAINT "studio_recurrences_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_studios" ADD CONSTRAINT "studio_studios_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_tone_presets" ADD CONSTRAINT "studio_tone_presets_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_topics" ADD CONSTRAINT "studio_topics_studio_id_studio_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studio_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_attachments" ADD CONSTRAINT "course_attachments_course_id_course_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_attachments" ADD CONSTRAINT "course_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_courses" ADD CONSTRAINT "course_courses_topic_id_course_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."course_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_courses" ADD CONSTRAINT "course_courses_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_course_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson_progress" ADD CONSTRAINT "course_lesson_progress_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson_progress" ADD CONSTRAINT "course_lesson_progress_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_video_file_id_files_id_fk" FOREIGN KEY ("video_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_course_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_bookings" ADD CONSTRAINT "booking_bookings_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_bookings" ADD CONSTRAINT "booking_bookings_provider_id_booking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."booking_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_bookings" ADD CONSTRAINT "booking_bookings_product_id_booking_session_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booking_session_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_bookings" ADD CONSTRAINT "booking_bookings_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_provider_categories" ADD CONSTRAINT "booking_provider_categories_provider_id_booking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."booking_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_provider_categories" ADD CONSTRAINT "booking_provider_categories_category_id_booking_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."booking_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_provider_products" ADD CONSTRAINT "booking_provider_products_provider_id_booking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."booking_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_provider_products" ADD CONSTRAINT "booking_provider_products_product_id_booking_session_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booking_session_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_providers" ADD CONSTRAINT "booking_providers_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_schedule_overrides" ADD CONSTRAINT "booking_schedule_overrides_provider_id_booking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."booking_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_weekly_schedules" ADD CONSTRAINT "booking_weekly_schedules_provider_id_booking_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."booking_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_helpful_unique" ON "review_helpful" USING btree ("review_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_review_helpful_review" ON "review_helpful" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "idx_review_helpful_user" ON "review_helpful" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_reports_unique" ON "review_reports" USING btree ("review_id","reporter_id");--> statement-breakpoint
CREATE INDEX "idx_review_reports_review" ON "review_reports" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "idx_review_reports_status" ON "review_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_summary_unique" ON "review_summary" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_unique_user_target" ON "reviews" USING btree ("target_type","target_id","author_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_target" ON "reviews" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_author" ON "reviews" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_status" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_reviews_rating" ON "reviews" USING btree ("target_type","target_id","rating");--> statement-breakpoint
CREATE INDEX "idx_rate_limits_key_consumed" ON "rate_limits" USING btree ("key","consumed_at");--> statement-breakpoint
CREATE INDEX "idx_rate_limits_action" ON "rate_limits" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_comment_comments_target" ON "comment_comments" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_comment_comments_parent" ON "comment_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_comment_comments_author" ON "comment_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_communities_slug" ON "community_communities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_communities_owner" ON "community_communities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_communities_type" ON "community_communities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_communities_member_count" ON "community_communities" USING btree ("member_count");--> statement-breakpoint
CREATE UNIQUE INDEX "community_bans_unique" ON "community_bans" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_bans_community" ON "community_bans" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_bans_user" ON "community_bans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_community_comments_post" ON "community_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_community_comments_author" ON "community_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_community_comments_parent" ON "community_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_community_comments_vote_score" ON "community_comments" USING btree ("vote_score");--> statement-breakpoint
CREATE INDEX "idx_community_comments_created" ON "community_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_flairs_community" ON "community_flairs" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_flairs_type" ON "community_flairs" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "community_memberships_unique" ON "community_memberships" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_community" ON "community_memberships" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_user" ON "community_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_memberships_role" ON "community_memberships" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_mod_logs_community" ON "community_mod_logs" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_mod_logs_moderator" ON "community_mod_logs" USING btree ("moderator_id");--> statement-breakpoint
CREATE INDEX "idx_mod_logs_action" ON "community_mod_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_mod_logs_created" ON "community_mod_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_moderators_unique" ON "community_moderators" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_moderators_community" ON "community_moderators" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_moderators_user" ON "community_moderators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_posts_community" ON "community_posts" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_posts_author" ON "community_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_posts_status" ON "community_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_posts_created" ON "community_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_hot_score" ON "community_posts" USING btree ("hot_score");--> statement-breakpoint
CREATE INDEX "idx_posts_vote_score" ON "community_posts" USING btree ("vote_score");--> statement-breakpoint
CREATE INDEX "idx_posts_community_status" ON "community_posts" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "idx_reports_community" ON "community_reports" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_reports_status" ON "community_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_reports_target" ON "community_reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_reports_reporter" ON "community_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "idx_rules_community" ON "community_rules" USING btree ("community_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_saved_posts_unique" ON "community_saved_posts" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "idx_saved_posts_user" ON "community_saved_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_saved_posts_post" ON "community_saved_posts" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_votes_unique" ON "community_votes" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_votes_target" ON "community_votes" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_votes_user" ON "community_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_logs_recipient" ON "email_logs" USING btree ("recipient_email","created_at");--> statement-breakpoint
CREATE INDEX "idx_email_logs_status" ON "email_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_email_logs_template" ON "email_logs" USING btree ("template_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_notification_settings_user_type" ON "notification_settings" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notification_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_type" ON "notification_notifications" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_read_at" ON "notification_notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reaction_reactions_unique_idx" ON "reaction_reactions" USING btree ("target_type","target_id","user_id","type");--> statement-breakpoint
CREATE INDEX "reaction_reactions_target_idx" ON "reaction_reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reaction_reactions_user_idx" ON "reaction_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_agents_slug" ON "agent_agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_agent_agents_active" ON "agent_agents" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_thread" ON "agent_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_created" ON "agent_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_threads_user" ON "agent_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_threads_agent" ON "agent_threads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_threads_last_message" ON "agent_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_agent_usage_agent_user" ON "agent_usage_logs" USING btree ("agent_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_usage_created" ON "agent_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_marketing_campaigns_author" ON "marketing_campaigns" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_campaigns_status" ON "marketing_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketing_contents_campaign" ON "marketing_contents" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_contents_author" ON "marketing_contents" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_contents_source" ON "marketing_contents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_platform_variants_unique_idx" ON "marketing_platform_variants" USING btree ("content_id","platform");--> statement-breakpoint
CREATE INDEX "idx_marketing_publications_content" ON "marketing_publications" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_publications_sns_account" ON "marketing_publications" USING btree ("sns_account_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_publications_status" ON "marketing_publications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_marketing_publications_scheduled" ON "marketing_publications" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_sns_accounts_unique_idx" ON "marketing_sns_accounts" USING btree ("user_id","platform","platform_user_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_sns_accounts_user" ON "marketing_sns_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_studio_ai_recurrences_studio" ON "studio_ai_recurrences" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_studio_ai_recurrences_topic" ON "studio_ai_recurrences" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_studio_ai_recurrences_active" ON "studio_ai_recurrences" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_studio_ai_recurrences_next_run" ON "studio_ai_recurrences" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "idx_studio_brand_profiles_studio" ON "studio_brand_profiles" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_studio_content_seo_content" ON "studio_content_seo" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_studio_content_seo_snapshot" ON "studio_content_seo" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_studio" ON "studio_contents" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_topic" ON "studio_contents" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_author" ON "studio_contents" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_status" ON "studio_contents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_published_at" ON "studio_contents" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_scheduled_at" ON "studio_contents" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_studio_contents_derived_from" ON "studio_contents" USING btree ("derived_from_id");--> statement-breakpoint
CREATE INDEX "idx_studio_edges_studio" ON "studio_edges" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_studio_edges_source" ON "studio_edges" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_studio_edges_target" ON "studio_edges" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_studio_recurrences_studio" ON "studio_recurrences" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_studio_recurrences_active" ON "studio_recurrences" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_studio_recurrences_next_run" ON "studio_recurrences" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "idx_studio_studios_owner" ON "studio_studios" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_studio_studios_visibility" ON "studio_studios" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_studio_tone_presets_studio" ON "studio_tone_presets" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_studio_tone_presets_system" ON "studio_tone_presets" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "idx_studio_topics_studio" ON "studio_topics" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "idx_courses_topic" ON "course_courses" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_courses_status" ON "course_courses" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_unique" ON "course_enrollments" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_enrollments_user" ON "course_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_enrollments_course" ON "course_enrollments" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_lesson_progress_unique" ON "course_lesson_progress" USING btree ("lesson_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_progress_user" ON "course_lesson_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_progress_lesson" ON "course_lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "idx_lessons_section" ON "course_lessons" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "idx_sections_course" ON "course_sections" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_booking_bookings_customer" ON "booking_bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_booking_bookings_provider" ON "booking_bookings" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_booking_bookings_status" ON "booking_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_bookings_provider_session" ON "booking_bookings" USING btree ("provider_id","session_date","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_provider_categories_unique" ON "booking_provider_categories" USING btree ("provider_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_provider_products_unique" ON "booking_provider_products" USING btree ("provider_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_booking_providers_profile" ON "booking_providers" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_booking_providers_status" ON "booking_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_overrides_provider_date" ON "booking_schedule_overrides" USING btree ("provider_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_weekly_schedules_unique" ON "booking_weekly_schedules" USING btree ("provider_id","day_of_week","start_time");--> statement-breakpoint
CREATE INDEX "idx_booking_schedules_provider" ON "booking_weekly_schedules" USING btree ("provider_id");