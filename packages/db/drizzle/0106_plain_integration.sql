ALTER TYPE "public"."integration_provider" ADD VALUE 'plain';--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "webhook_secret" text;