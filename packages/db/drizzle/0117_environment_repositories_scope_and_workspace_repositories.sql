CREATE TYPE "public"."environment_scope" AS ENUM('organization', 'personal');--> statement-breakpoint
CREATE TABLE "cloud_workspace_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cloud_workspace_repositories_workspace_repository_unique" UNIQUE("cloud_workspace_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "environment_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "environment_repositories_environment_id_repository_id_unique" UNIQUE("environment_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "hooks_repository_id" uuid;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "scope" "environment_scope" DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cloud_workspace_repositories" ADD CONSTRAINT "cloud_workspace_repositories_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_repositories" ADD CONSTRAINT "cloud_workspace_repositories_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_repositories" ADD CONSTRAINT "environment_repositories_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_repositories" ADD CONSTRAINT "environment_repositories_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspace_repositories_cloud_workspace_id_idx" ON "cloud_workspace_repositories" USING btree ("cloud_workspace_id");--> statement-breakpoint
CREATE INDEX "environment_repositories_environment_id_idx" ON "environment_repositories" USING btree ("environment_id");--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_hooks_repository_id_github_repositories_id_fk" FOREIGN KEY ("hooks_repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;