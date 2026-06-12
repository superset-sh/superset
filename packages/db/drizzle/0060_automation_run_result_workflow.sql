CREATE TYPE "public"."automation_run_result_source" AS ENUM('agent_writeback', 'session_exit', 'system');--> statement-breakpoint
CREATE TYPE "public"."automation_run_source" AS ENUM('manual', 'schedule');--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'queued' BEFORE 'dispatching';--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'running' BEFORE 'dispatched';--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'completed' BEFORE 'dispatched';--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'failed' BEFORE 'dispatched';--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'skipped' BEFORE 'dispatched';--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "source" "automation_run_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "result_markdown" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "result_json" jsonb;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "result_summary" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "result_source" "automation_run_result_source";--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "terminal_exit_code" integer;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;