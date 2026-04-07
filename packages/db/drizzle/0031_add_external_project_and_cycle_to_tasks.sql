ALTER TABLE "tasks" ADD COLUMN "external_project_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_project_name" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_cycle_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "external_cycle_name" text;--> statement-breakpoint
CREATE INDEX "tasks_external_project_id_idx" ON "tasks" USING btree ("external_project_id");