ALTER TYPE "public"."automation_trigger_kind" ADD VALUE 'gitlab' BEFORE 'slack';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'gitlab';--> statement-breakpoint
CREATE TABLE "gitlab_cloud_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"path_with_namespace" text NOT NULL,
	"clone_url" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gitlab_cloud_projects_connection_id_project_id_key" UNIQUE("connection_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "gitlab_environment_projects" (
	"environment_id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"path_with_namespace" text NOT NULL,
	"clone_url" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gitlab_workspace_checkouts" (
	"cloud_workspace_id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"path_with_namespace" text NOT NULL,
	"clone_url" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gitlab_cloud_projects" ADD CONSTRAINT "gitlab_cloud_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_cloud_projects" ADD CONSTRAINT "gitlab_cloud_projects_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_environment_projects" ADD CONSTRAINT "gitlab_environment_projects_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_environment_projects" ADD CONSTRAINT "gitlab_environment_projects_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_workspace_checkouts" ADD CONSTRAINT "gitlab_workspace_checkouts_cloud_workspace_id_fkey" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_workspace_checkouts" ADD CONSTRAINT "gitlab_workspace_checkouts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;