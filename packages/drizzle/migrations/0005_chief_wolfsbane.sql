CREATE TYPE "public"."agent_desk_execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_image_generation_status" AS ENUM('pending', 'generating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_image_style_category" AS ENUM('instagram', 'thumbnail', 'banner');--> statement-breakpoint
CREATE TABLE "agent_desk_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"worktree_path" text,
	"branch_name" varchar(200),
	"pr_url" text,
	"pr_number" integer,
	"status" "agent_desk_execution_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"log" text
);
--> statement-breakpoint
CREATE TABLE "ai_image_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"style_template_id" uuid,
	"input_image_url" text,
	"output_image_url" text,
	"status" "ai_image_generation_status" DEFAULT 'pending' NOT NULL,
	"width" integer DEFAULT 1080 NOT NULL,
	"height" integer DEFAULT 1080 NOT NULL,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_image_style_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"prompt_suffix" text NOT NULL,
	"category" "ai_image_style_category" NOT NULL,
	"thumbnail_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_image_style_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "analysis_result" jsonb;--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "spec" text;--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "agent_desk_executions" ADD CONSTRAINT "agent_desk_executions_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_style_template_id_ai_image_style_templates_id_fk" FOREIGN KEY ("style_template_id") REFERENCES "public"."ai_image_style_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_image_generations_user" ON "ai_image_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_image_generations_status" ON "ai_image_generations" USING btree ("status");