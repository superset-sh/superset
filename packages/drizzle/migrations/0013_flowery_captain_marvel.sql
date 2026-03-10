CREATE TYPE "public"."payment_coupon_redemption_status" AS ENUM('active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."story_studio_act" AS ENUM('act_1', 'act_2a', 'act_2b', 'act_3');--> statement-breakpoint
CREATE TYPE "public"."story_studio_beat_template_structure" AS ENUM('save_the_cat', 'three_act', 'hero_journey', 'custom');--> statement-breakpoint
CREATE TYPE "public"."story_studio_beat_type" AS ENUM('opening_image', 'setup', 'theme_stated', 'catalyst', 'debate', 'break_into_two', 'b_story', 'fun_and_games', 'midpoint', 'bad_guys_close_in', 'all_is_lost', 'dark_night', 'break_into_three', 'finale', 'final_image', 'climax', 'resolution', 'custom');--> statement-breakpoint
CREATE TYPE "public"."story_studio_chapter_status" AS ENUM('outline', 'draft', 'review', 'final', 'locked');--> statement-breakpoint
CREATE TYPE "public"."story_studio_character_role" AS ENUM('protagonist', 'antagonist', 'supporting', 'npc', 'mob');--> statement-breakpoint
CREATE TYPE "public"."story_studio_dialogue_type" AS ENUM('dialogue', 'narration', 'monologue', 'system', 'choice_text', 'direction');--> statement-breakpoint
CREATE TYPE "public"."story_studio_difficulty" AS ENUM('easy', 'normal', 'hard', 'very_hard');--> statement-breakpoint
CREATE TYPE "public"."story_studio_emotional_tone" AS ENUM('hope', 'despair', 'tension', 'relief', 'mystery', 'joy', 'sorrow', 'anger', 'fear', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."story_studio_ending_type" AS ENUM('true_end', 'normal_end', 'bad_end', 'hidden_end', 'secret_end');--> statement-breakpoint
CREATE TYPE "public"."story_studio_event_type" AS ENUM('item_acquire', 'location_visit', 'battle_result', 'npc_talk', 'quest_complete', 'custom');--> statement-breakpoint
CREATE TYPE "public"."story_studio_flag_category" AS ENUM('character', 'quest', 'world', 'system');--> statement-breakpoint
CREATE TYPE "public"."story_studio_flag_type" AS ENUM('boolean', 'number', 'string', 'enum');--> statement-breakpoint
CREATE TYPE "public"."story_studio_graph_node_type" AS ENUM('start', 'scene', 'choice', 'condition', 'merge', 'end');--> statement-breakpoint
CREATE TYPE "public"."story_studio_project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "payment_coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"discount_percent" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "payment_coupon_redemption_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "uq_payment_coupon_user" UNIQUE("coupon_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_percent" integer NOT NULL,
	"duration_months" integer NOT NULL,
	"applicable_plans" text[],
	"max_redemptions" integer,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	CONSTRAINT "payment_coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "story_studio_beat_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"structure" "story_studio_beat_template_structure" NOT NULL,
	"beats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_studio_beats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"act" "story_studio_act" DEFAULT 'act_1' NOT NULL,
	"beat_type" "story_studio_beat_type" DEFAULT 'custom' NOT NULL,
	"summary" text,
	"emotional_tone" "story_studio_emotional_tone",
	"characters" jsonb DEFAULT '[]'::jsonb,
	"location" varchar(200),
	"purpose" text,
	"linked_nodes" jsonb DEFAULT '[]'::jsonb,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_studio_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"code" varchar(50) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"status" "story_studio_chapter_status" DEFAULT 'outline' NOT NULL,
	"estimated_playtime" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "story_studio_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"role" "story_studio_character_role" DEFAULT 'npc' NOT NULL,
	"personality" text,
	"speech_style" text
);
--> statement-breakpoint
CREATE TABLE "story_studio_dialogues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"branch_node_id" uuid NOT NULL,
	"type" "story_studio_dialogue_type" DEFAULT 'dialogue' NOT NULL,
	"speaker_id" uuid,
	"emotion" varchar(50),
	"content" text NOT NULL,
	"direction" text,
	"timing" varchar(20),
	"voice_note" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"string_id" varchar(100) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_studio_endings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"type" "story_studio_ending_type" DEFAULT 'normal_end' NOT NULL,
	"description" text,
	"required_flags" jsonb DEFAULT '[]'::jsonb,
	"graph_node_id" uuid,
	"difficulty" "story_studio_difficulty" DEFAULT 'normal' NOT NULL,
	"discovery_hint" text
);
--> statement-breakpoint
CREATE TABLE "story_studio_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "story_studio_event_type" DEFAULT 'custom' NOT NULL,
	"description" text,
	"effects" jsonb DEFAULT '[]'::jsonb,
	"triggered_nodes" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "story_studio_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "story_studio_flag_type" DEFAULT 'boolean' NOT NULL,
	"default_value" varchar(200),
	"category" "story_studio_flag_category" DEFAULT 'quest' NOT NULL,
	"description" text,
	"is_interpolatable" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_studio_graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"label" varchar(200),
	"conditions" jsonb DEFAULT '[]'::jsonb,
	"effects" jsonb DEFAULT '[]'::jsonb,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_studio_graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"type" "story_studio_graph_node_type" NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" varchar(200) NOT NULL,
	"position_x" real DEFAULT 0 NOT NULL,
	"position_y" real DEFAULT 0 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "story_studio_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"title" varchar(200) NOT NULL,
	"genre" varchar(100),
	"description" text,
	"system_variables" jsonb DEFAULT '[]'::jsonb,
	"author_id" uuid NOT NULL,
	"status" "story_studio_project_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_coupon_redemptions" ADD CONSTRAINT "payment_coupon_redemptions_coupon_id_payment_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."payment_coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_coupon_redemptions" ADD CONSTRAINT "payment_coupon_redemptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_coupons" ADD CONSTRAINT "payment_coupons_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_beats" ADD CONSTRAINT "story_studio_beats_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_beats" ADD CONSTRAINT "story_studio_beats_chapter_id_story_studio_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."story_studio_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_chapters" ADD CONSTRAINT "story_studio_chapters_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_characters" ADD CONSTRAINT "story_studio_characters_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_dialogues" ADD CONSTRAINT "story_studio_dialogues_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_dialogues" ADD CONSTRAINT "story_studio_dialogues_chapter_id_story_studio_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."story_studio_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_dialogues" ADD CONSTRAINT "story_studio_dialogues_branch_node_id_story_studio_graph_nodes_id_fk" FOREIGN KEY ("branch_node_id") REFERENCES "public"."story_studio_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_dialogues" ADD CONSTRAINT "story_studio_dialogues_speaker_id_story_studio_characters_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."story_studio_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_endings" ADD CONSTRAINT "story_studio_endings_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_endings" ADD CONSTRAINT "story_studio_endings_graph_node_id_story_studio_graph_nodes_id_fk" FOREIGN KEY ("graph_node_id") REFERENCES "public"."story_studio_graph_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_events" ADD CONSTRAINT "story_studio_events_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_flags" ADD CONSTRAINT "story_studio_flags_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_graph_edges" ADD CONSTRAINT "story_studio_graph_edges_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_graph_edges" ADD CONSTRAINT "story_studio_graph_edges_chapter_id_story_studio_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."story_studio_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_graph_edges" ADD CONSTRAINT "story_studio_graph_edges_source_node_id_story_studio_graph_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."story_studio_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_graph_edges" ADD CONSTRAINT "story_studio_graph_edges_target_node_id_story_studio_graph_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."story_studio_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_graph_nodes" ADD CONSTRAINT "story_studio_graph_nodes_project_id_story_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."story_studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_graph_nodes" ADD CONSTRAINT "story_studio_graph_nodes_chapter_id_story_studio_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."story_studio_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_studio_projects" ADD CONSTRAINT "story_studio_projects_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;