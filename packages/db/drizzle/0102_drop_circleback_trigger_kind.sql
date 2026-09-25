-- Postgres has no DROP VALUE for enums, so removing 'circleback' means
-- recreating the type. Everything that depends on the column has to step
-- aside for the two ALTER COLUMN TYPE round-trips: the two partial indexes
-- whose WHERE clause names the enum, and the CHECK constraint whose kind::text
-- cast would silently rewrite to text = enum while the column is text.
DROP INDEX "automation_triggers_dispatcher_idx";--> statement-breakpoint
DROP INDEX "automation_triggers_schedule_idx";--> statement-breakpoint
ALTER TABLE "automation_triggers" DROP CONSTRAINT "automation_triggers_kind_matches_config";--> statement-breakpoint
ALTER TABLE "automation_triggers" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."automation_trigger_kind";--> statement-breakpoint
CREATE TYPE "public"."automation_trigger_kind" AS ENUM('schedule', 'webhook', 'github', 'slack', 'linear', 'sentry', 'microsoft_teams', 'google_calendar', 'gmail', 'notion');--> statement-breakpoint
ALTER TABLE "automation_triggers" ALTER COLUMN "kind" SET DATA TYPE "public"."automation_trigger_kind" USING "kind"::"public"."automation_trigger_kind";--> statement-breakpoint
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_kind_matches_config" CHECK (config->>'kind' = kind::text);--> statement-breakpoint
CREATE INDEX "automation_triggers_dispatcher_idx" ON "automation_triggers" USING btree ("next_run_at") WHERE kind = 'schedule';--> statement-breakpoint
CREATE INDEX "automation_triggers_schedule_idx" ON "automation_triggers" USING btree ("automation_id") WHERE kind = 'schedule';
