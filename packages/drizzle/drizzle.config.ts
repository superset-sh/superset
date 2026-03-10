import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: "../../.env.local" });
dotenv.config({ path: "../../.env" });

export default defineConfig({
  // 스키마 배열로 관리
  schema: ["./src/schema/index.ts"],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase 시스템 테이블 제외, public 스키마만 관리
  schemaFilter: ["public"],
  // 관리할 테이블 명시 (실제 pgTable 이름과 일치해야 함)
  tablesFilter: [
    // core
    "profiles",
    "files",
    "reviews",
    "review_helpful",
    "review_reports",
    "review_summary",
    "rate_limits",
    "roles",
    "permissions",
    "role_permissions",
    "user_roles",
    // features/board
    "board_boards",
    "board_posts",
    "board_post_attachments",
    // features/comment
    "comment_comments",
    // features/community
    "community_communities",
    "community_memberships",
    "community_posts",
    "community_comments",
    "community_votes",
    "community_moderators",
    "community_reports",
    "community_bans",
    "community_flairs",
    "community_rules",
    "community_mod_logs",
    "community_saved_posts",
    "community_user_karma",
    // features/email
    "email_logs",
    // features/notification
    "notification_notifications",
    "notification_settings",
    // features/payment
    "payment_products",
    "payment_orders",
    "payment_subscriptions",
    "payment_licenses",
    "payment_webhook_events",
    "payment_plans",
    "payment_credit_balances",
    "payment_credit_transactions",
    "payment_model_pricing",
    "payment_coupons",
    "payment_coupon_redemptions",
    // features/reaction
    "reaction_reactions",
    // features/agent
    "agent_agents",
    "agent_threads",
    "agent_messages",
    "agent_usage_logs",
    // features/content-studio
    "studio_studios",
    "studio_topics",
    "studio_contents",
    "studio_content_seo",
    "studio_edges",
    "studio_recurrences",
    "studio_ai_recurrences",
    "studio_brand_profiles",
    "studio_tone_presets",
    "studio_content_analysis",
    // features/marketing
    "marketing_campaigns",
    "marketing_sns_accounts",
    "marketing_contents",
    "marketing_platform_variants",
    "marketing_publications",
    // features/scheduled-job
    "system_scheduled_jobs",
    "system_job_runs",
    // features/audit-log
    "system_audit_logs",
    // features/analytics
    "system_analytics_events",
    "system_daily_metrics",
    // features/course
    "course_topics",
    "course_courses",
    "course_sections",
    "course_lessons",
    "course_enrollments",
    "course_lesson_progress",
    "course_attachments",
    // features/booking
    "booking_categories",
    "booking_providers",
    "booking_provider_categories",
    "booking_session_products",
    "booking_provider_products",
    "booking_weekly_schedules",
    "booking_schedule_overrides",
    "booking_bookings",
    "booking_refund_policy",
    // features/payment (refund)
    "payment_refund_requests",
    // features/data-tracker
    "data_tracker_trackers",
    "data_tracker_columns",
    "data_tracker_entries",
    // features/profile (withdrawal)
    "profile_withdrawal_reasons",
    // features/family
    "family_groups",
    "family_members",
    "family_invitations",
    "family_children",
    "family_child_assignments",
    // features/agent-desk
    "agent_desk_sessions",
    "agent_desk_files",
    "agent_desk_messages",
    "agent_desk_executions",
    "agent_desk_requirement_sources",
    "agent_desk_normalized_requirements",
    "agent_desk_linear_publish_jobs",
    // features/ai-image
    "ai_image_style_templates",
    "ai_image_content_themes",
    "ai_image_generations",
    // features/story-studio
    "story_studio_projects",
    "story_studio_chapters",
    "story_studio_graph_nodes",
    "story_studio_graph_edges",
    "story_studio_flags",
    "story_studio_characters",
    "story_studio_dialogues",
    "story_studio_beat_templates",
    "story_studio_beats",
    "story_studio_endings",
    "story_studio_events",
    // features/terms
    "terms",
    // features/task
    "task_projects",
    "task_cycles",
    "task_labels",
    "task_tasks",
    "task_task_labels",
    "task_comments",
    "task_activities",
    // features/blog
    "blog_posts",
    "blog_tags",
    "blog_post_tags",
    "blog_claps",
    "blog_responses",
    "blog_bookmarks",
    // features/bookmark
    "bookmark_bookmarks",
    // features/feature-catalog
    "catalog_features",
    "catalog_dependencies",
  ],
  verbose: true,
  strict: true,
});
