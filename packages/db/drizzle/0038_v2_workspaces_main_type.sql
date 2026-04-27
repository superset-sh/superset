CREATE TYPE "public"."v2_workspace_type" AS ENUM('main', 'worktree');--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD COLUMN "type" "v2_workspace_type" DEFAULT 'worktree' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "v2_workspaces_one_main_per_host" ON "v2_workspaces" USING btree ("project_id","host_id") WHERE "v2_workspaces"."type" = 'main';