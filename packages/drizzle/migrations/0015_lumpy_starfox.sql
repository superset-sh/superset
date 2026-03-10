CREATE TYPE "public"."agent_desk_publish_status" AS ENUM('drafted', 'publishing', 'partially_published', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "agent_desk_linear_publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"handoff_version" integer NOT NULL,
	"draft_key" varchar(500) NOT NULL,
	"status" "agent_desk_publish_status" DEFAULT 'drafted' NOT NULL,
	"team_key" varchar(50) NOT NULL,
	"project_id" varchar(200),
	"project_name" varchar(500),
	"grouping_mode" varchar(50) DEFAULT 'story-to-issue' NOT NULL,
	"draft_payload" jsonb,
	"created_issues" jsonb,
	"failed_issues" jsonb,
	"last_synced_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "agent_desk_linear_publish_jobs" ADD CONSTRAINT "agent_desk_linear_publish_jobs_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;