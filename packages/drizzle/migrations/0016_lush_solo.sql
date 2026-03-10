ALTER TYPE "public"."agent_desk_source_type" ADD VALUE 'pptx' BEFORE 'docx';--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ADD COLUMN "metadata" jsonb;