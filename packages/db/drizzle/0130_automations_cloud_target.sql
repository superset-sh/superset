ALTER TYPE "public"."automation_run_error_code" ADD VALUE 'cloud_not_ready';--> statement-breakpoint
ALTER TYPE "public"."automation_run_error_code" ADD VALUE 'cloud_access_denied';--> statement-breakpoint
ALTER TYPE "public"."automation_run_error_code" ADD VALUE 'cloud_environment_unusable';--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "cloud_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "cloud_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_runs_cloud_workspace_idx" ON "automation_runs" USING btree ("cloud_workspace_id");