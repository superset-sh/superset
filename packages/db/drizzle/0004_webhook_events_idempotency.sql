DROP INDEX "ingest"."webhook_events_event_id_idx";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" ALTER COLUMN "provider" SET DATA TYPE "public"."integration_provider" USING "provider"::"public"."integration_provider";--> statement-breakpoint
ALTER TABLE "ingest"."webhook_events" ALTER COLUMN "event_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_id_idx" ON "ingest"."webhook_events" USING btree ("provider","event_id");