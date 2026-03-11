CREATE TYPE "public"."v2_device_type" AS ENUM('host', 'cloud', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."v2_users_device_role" AS ENUM('owner', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "v2_device_presence" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v2_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" text,
	"name" text NOT NULL,
	"type" "v2_device_type" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_devices_org_client_id_unique" UNIQUE("organization_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "v2_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"github_repository_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_projects_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "v2_users_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"role" "v2_users_device_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_users_devices_user_device_unique" UNIQUE("user_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "v2_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"device_id" uuid,
	"name" text NOT NULL,
	"branch" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_device_presence" ADD CONSTRAINT "v2_device_presence_device_id_v2_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."v2_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_device_presence" ADD CONSTRAINT "v2_device_presence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_devices" ADD CONSTRAINT "v2_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_devices" ADD CONSTRAINT "v2_devices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_projects" ADD CONSTRAINT "v2_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_projects" ADD CONSTRAINT "v2_projects_github_repository_id_github_repositories_id_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_users_devices" ADD CONSTRAINT "v2_users_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_users_devices" ADD CONSTRAINT "v2_users_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_users_devices" ADD CONSTRAINT "v2_users_devices_device_id_v2_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."v2_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_project_id_v2_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_device_id_v2_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."v2_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "v2_device_presence_organization_id_idx" ON "v2_device_presence" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_device_presence_last_seen_idx" ON "v2_device_presence" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "v2_devices_organization_id_idx" ON "v2_devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_projects_organization_id_idx" ON "v2_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_users_devices_organization_id_idx" ON "v2_users_devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_users_devices_user_id_idx" ON "v2_users_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v2_users_devices_device_id_idx" ON "v2_users_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "v2_workspaces_project_id_idx" ON "v2_workspaces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "v2_workspaces_organization_id_idx" ON "v2_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_workspaces_device_id_idx" ON "v2_workspaces" USING btree ("device_id");