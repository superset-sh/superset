ALTER TABLE "integration_connections" ADD COLUMN "disconnected_at" timestamp;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "disconnect_reason" text;