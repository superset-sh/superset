DROP INDEX "automations_dispatcher_idx";--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "rrule";--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "dtstart";--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "timezone";--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "mcp_scope";--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "next_run_at";