CREATE TYPE "public"."agent_desk_conflict_status" AS ENUM('none', 'duplicate', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_parse_status" AS ENUM('pending', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_requirement_category" AS ENUM('feature', 'role', 'entity', 'validation', 'exception');--> statement-breakpoint
CREATE TYPE "public"."agent_desk_source_type" AS ENUM('pdf', 'docx', 'md', 'txt', 'manual');--> statement-breakpoint
CREATE TABLE "agent_desk_normalized_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"category" "agent_desk_requirement_category" NOT NULL,
	"summary" varchar(500) NOT NULL,
	"detail" text,
	"source_ids" text[],
	"confidence" integer DEFAULT 80 NOT NULL,
	"conflict_status" "agent_desk_conflict_status" DEFAULT 'none' NOT NULL,
	"dedupe_group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "agent_desk_requirement_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"source_type" "agent_desk_source_type" NOT NULL,
	"title" varchar(500) NOT NULL,
	"raw_content" text,
	"parsed_content" text,
	"priority" integer DEFAULT 3 NOT NULL,
	"trust_score" integer DEFAULT 100 NOT NULL,
	"parse_status" "agent_desk_parse_status" DEFAULT 'pending' NOT NULL,
	"file_id" uuid,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "bookmark_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_desk_messages" ADD COLUMN "feedback" varchar(10);--> statement-breakpoint
ALTER TABLE "agent_desk_messages" ADD COLUMN "feedback_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_desk_normalized_requirements" ADD CONSTRAINT "agent_desk_normalized_requirements_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_desk_requirement_sources" ADD CONSTRAINT "agent_desk_requirement_sources_session_id_agent_desk_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_desk_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_desk_requirement_sources" ADD CONSTRAINT "agent_desk_requirement_sources_file_id_agent_desk_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."agent_desk_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark_bookmarks" ADD CONSTRAINT "bookmark_bookmarks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookmark_bookmarks_unique_idx" ON "bookmark_bookmarks" USING btree ("target_type","target_id","user_id");--> statement-breakpoint
CREATE INDEX "bookmark_bookmarks_target_idx" ON "bookmark_bookmarks" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "bookmark_bookmarks_user_idx" ON "bookmark_bookmarks" USING btree ("user_id");