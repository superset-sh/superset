ALTER TABLE "automations" ALTER COLUMN "rrule" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "dtstart" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "timezone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "next_run_at" DROP NOT NULL;