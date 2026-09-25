DROP INDEX "automation_triggers_dispatcher_idx";--> statement-breakpoint
DROP INDEX "automation_triggers_matcher_idx";--> statement-breakpoint
CREATE INDEX "automation_triggers_dispatcher_idx" ON "automation_triggers" USING btree ("next_run_at") WHERE kind = 'schedule';--> statement-breakpoint
CREATE INDEX "automation_triggers_matcher_idx" ON "automation_triggers" USING btree ("organization_id","kind");--> statement-breakpoint
ALTER TABLE "automation_triggers" DROP COLUMN "enabled";