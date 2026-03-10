ALTER TYPE "public"."agent_desk_session_status" ADD VALUE 'designing' BEFORE 'analyzing';--> statement-breakpoint
ALTER TYPE "public"."agent_desk_session_type" ADD VALUE 'designer';--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "platform" varchar(20);--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "design_theme" text;--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "flow_data" jsonb;