CREATE TYPE "public"."automation_run_error_code" AS ENUM('no_instructions', 'host_offline', 'agent_not_found', 'workspace_not_found');--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "error_code" "automation_run_error_code";--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "continue_agent_session" boolean DEFAULT false NOT NULL;