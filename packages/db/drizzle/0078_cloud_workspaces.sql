CREATE TYPE "public"."cloud_workspace_status" AS ENUM('provisioning', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "cloud_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"branch" text NOT NULL,
	"provider" text DEFAULT 'blaxel' NOT NULL,
	"provider_sandbox_id" text NOT NULL,
	"sandbox_url" text,
	"status" "cloud_workspace_status" DEFAULT 'provisioning' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspaces_provider_sandbox_id_unique" UNIQUE("provider","provider_sandbox_id")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_project_id_v2_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspaces_organization_id_idx" ON "cloud_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_project_id_idx" ON "cloud_workspaces" USING btree ("project_id");