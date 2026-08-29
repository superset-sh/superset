ALTER TABLE "pages" ADD COLUMN "watched_by_agent" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "watch_heartbeat_at" timestamp with time zone;