ALTER TABLE "automation_runs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "automation_runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."automation_run_status";--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('dispatching', 'dispatched', 'skipped_offline', 'dispatch_failed');--> statement-breakpoint
ALTER TABLE "automation_runs" ALTER COLUMN "status" SET DATA TYPE "public"."automation_run_status" USING "status"::"public"."automation_run_status";
