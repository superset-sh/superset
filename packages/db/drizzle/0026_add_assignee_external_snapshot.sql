ALTER TABLE "tasks" ADD COLUMN "assignee_external_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignee_display_name" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignee_avatar_url" text;--> statement-breakpoint
CREATE INDEX "tasks_assignee_external_id_idx" ON "tasks" USING btree ("assignee_external_id");