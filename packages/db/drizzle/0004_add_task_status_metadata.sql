ALTER TABLE "tasks" ADD COLUMN "status_color" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_type" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_position" real;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp;