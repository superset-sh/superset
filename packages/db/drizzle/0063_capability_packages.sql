CREATE TYPE "public"."capability_package_audit_status" AS ENUM('pending', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."capability_package_source_type" AS ENUM('zip', 'git', 'local_folder');--> statement-breakpoint
CREATE TYPE "public"."capability_package_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."capability_package_type" AS ENUM('skill', 'cli');--> statement-breakpoint
CREATE TABLE "automation_capabilities" (
	"automation_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"capability_version_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_capabilities_automation_id_capability_id_pk" PRIMARY KEY("automation_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "capability_package_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_id" uuid NOT NULL,
	"version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"artifact_url" text NOT NULL,
	"artifact_pathname" text NOT NULL,
	"artifact_sha256" text NOT NULL,
	"artifact_size_bytes" integer NOT NULL,
	"source_type" "capability_package_source_type" NOT NULL,
	"source_ref" text,
	"validation_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audit_status" "capability_package_audit_status" DEFAULT 'pending' NOT NULL,
	"audit_model_provider_id" uuid,
	"audit_model_id" text,
	"audit_summary" text,
	"audit_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_package_versions_capability_version_unique" UNIQUE("capability_id","version")
);
--> statement-breakpoint
CREATE TABLE "capability_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"type" "capability_package_type" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"current_version_id" uuid,
	"status" "capability_package_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_packages_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "project_capabilities" (
	"project_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"capability_version_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_capabilities_project_id_capability_id_pk" PRIMARY KEY("project_id","capability_id")
);
--> statement-breakpoint
ALTER TABLE "automation_capabilities" ADD CONSTRAINT "automation_capabilities_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_capabilities" ADD CONSTRAINT "automation_capabilities_capability_id_capability_packages_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capability_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_capabilities" ADD CONSTRAINT "automation_capabilities_capability_version_id_capability_package_versions_id_fk" FOREIGN KEY ("capability_version_id") REFERENCES "public"."capability_package_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD CONSTRAINT "capability_package_versions_capability_id_capability_packages_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capability_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD CONSTRAINT "capability_package_versions_audit_model_provider_id_model_providers_id_fk" FOREIGN KEY ("audit_model_provider_id") REFERENCES "public"."model_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_package_versions" ADD CONSTRAINT "capability_package_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_packages" ADD CONSTRAINT "capability_packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_packages" ADD CONSTRAINT "capability_packages_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_project_id_v2_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_capability_id_capability_packages_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capability_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_capability_version_id_capability_package_versions_id_fk" FOREIGN KEY ("capability_version_id") REFERENCES "public"."capability_package_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_capabilities_automation_order_idx" ON "automation_capabilities" USING btree ("automation_id","display_order");--> statement-breakpoint
CREATE INDEX "automation_capabilities_capability_id_idx" ON "automation_capabilities" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "automation_capabilities_version_id_idx" ON "automation_capabilities" USING btree ("capability_version_id");--> statement-breakpoint
CREATE INDEX "capability_package_versions_capability_id_idx" ON "capability_package_versions" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "capability_package_versions_artifact_sha256_idx" ON "capability_package_versions" USING btree ("artifact_sha256");--> statement-breakpoint
CREATE INDEX "capability_package_versions_audit_status_idx" ON "capability_package_versions" USING btree ("audit_status");--> statement-breakpoint
CREATE INDEX "capability_packages_organization_id_idx" ON "capability_packages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "capability_packages_owner_user_id_idx" ON "capability_packages" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "capability_packages_type_idx" ON "capability_packages" USING btree ("type");--> statement-breakpoint
CREATE INDEX "capability_packages_current_version_id_idx" ON "capability_packages" USING btree ("current_version_id");--> statement-breakpoint
CREATE INDEX "project_capabilities_capability_id_idx" ON "project_capabilities" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "project_capabilities_version_id_idx" ON "project_capabilities" USING btree ("capability_version_id");