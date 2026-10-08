ALTER TABLE "automation_triggers" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "nickname" text;