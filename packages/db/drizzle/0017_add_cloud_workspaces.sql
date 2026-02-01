CREATE TYPE "public"."cloud_model" AS ENUM('claude-sonnet-4', 'claude-opus-4', 'claude-haiku-3-5');--> statement-breakpoint
CREATE TYPE "public"."cloud_sandbox_status" AS ENUM('pending', 'warming', 'syncing', 'ready', 'running', 'stopped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."cloud_session_status" AS ENUM('created', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "cloud_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"repository_id" uuid,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"branch" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"status" "cloud_session_status" DEFAULT 'created' NOT NULL,
	"sandbox_status" "cloud_sandbox_status" DEFAULT 'pending',
	"model" "cloud_model" DEFAULT 'claude-sonnet-4',
	"linear_issue_id" text,
	"linear_issue_key" text,
	"pr_url" text,
	"pr_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp,
	"archived_at" timestamp,
	CONSTRAINT "cloud_workspaces_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "cloud_workspaces_org_session_unique" UNIQUE("organization_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspaces_organization_id_idx" ON "cloud_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_user_id_idx" ON "cloud_workspaces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_session_id_idx" ON "cloud_workspaces" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_status_idx" ON "cloud_workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_repository_id_idx" ON "cloud_workspaces" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_linear_issue_id_idx" ON "cloud_workspaces" USING btree ("linear_issue_id");