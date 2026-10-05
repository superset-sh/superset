CREATE TYPE "auth"."task_tracker" AS ENUM('superset', 'linear');--> statement-breakpoint
ALTER TABLE "auth"."organizations" ADD COLUMN "task_tracker" "auth"."task_tracker" DEFAULT 'superset' NOT NULL;