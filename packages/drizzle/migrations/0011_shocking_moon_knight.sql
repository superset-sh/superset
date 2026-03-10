ALTER TYPE "public"."agent_desk_session_status" ADD VALUE 'chatting' BEFORE 'uploading';--> statement-breakpoint
ALTER TABLE "agent_desk_sessions" ALTER COLUMN "status" SET DEFAULT 'chatting';