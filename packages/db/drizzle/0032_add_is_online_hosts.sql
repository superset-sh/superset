ALTER TABLE "v2_hosts" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_hosts" DROP COLUMN "last_seen_at";