DO $$ BEGIN
 CREATE TYPE "public"."v2_workspace_type" AS ENUM('main', 'worktree');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD COLUMN IF NOT EXISTS "type" "v2_workspace_type" DEFAULT 'worktree' NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "v2_workspaces_one_main_per_host" ON "v2_workspaces" USING btree ("project_id","host_id") WHERE "v2_workspaces"."type" = 'main';
