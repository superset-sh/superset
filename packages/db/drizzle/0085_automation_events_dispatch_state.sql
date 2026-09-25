ALTER TABLE "automation_events" ADD COLUMN "dispatch_input" jsonb;--> statement-breakpoint
ALTER TABLE "automation_events" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "automation_events_undispatched_idx" ON "automation_events" USING btree ("received_at") WHERE "automation_events"."dispatched_at" IS NULL;