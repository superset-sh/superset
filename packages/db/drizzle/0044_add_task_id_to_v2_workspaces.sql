ALTER TABLE "v2_workspaces" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "v2_workspaces_task_id_idx" ON "v2_workspaces" USING btree ("task_id");