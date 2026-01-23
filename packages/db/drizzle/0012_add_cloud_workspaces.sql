CREATE TYPE "public"."cloud_client_type" AS ENUM('desktop', 'web');--> statement-breakpoint
CREATE TYPE "public"."cloud_provider_type" AS ENUM('freestyle', 'fly');--> statement-breakpoint
CREATE TYPE "public"."cloud_workspace_status" AS ENUM('provisioning', 'running', 'paused', 'stopped', 'error');--> statement-breakpoint
CREATE TABLE "cloud_workspace_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_type" "cloud_client_type" DEFAULT 'desktop' NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" text NOT NULL,
	"branch" text NOT NULL,
	"provider_type" "cloud_provider_type" DEFAULT 'freestyle' NOT NULL,
	"provider_vm_id" text,
	"status" "cloud_workspace_status" DEFAULT 'provisioning' NOT NULL,
	"status_message" text,
	"auto_stop_minutes" integer DEFAULT 30 NOT NULL,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_workspace_sessions" ADD CONSTRAINT "cloud_workspace_sessions_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_sessions" ADD CONSTRAINT "cloud_workspace_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspace_sessions_workspace_id_idx" ON "cloud_workspace_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_sessions_user_id_idx" ON "cloud_workspace_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_organization_id_idx" ON "cloud_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_repository_id_idx" ON "cloud_workspaces" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_creator_id_idx" ON "cloud_workspaces" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_status_idx" ON "cloud_workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_provider_vm_id_idx" ON "cloud_workspaces" USING btree ("provider_vm_id");