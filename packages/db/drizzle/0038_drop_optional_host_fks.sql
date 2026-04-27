ALTER TABLE "automation_runs" DROP CONSTRAINT "automation_runs_host_fk";
--> statement-breakpoint
ALTER TABLE "automations" DROP CONSTRAINT "automations_target_host_fk";
