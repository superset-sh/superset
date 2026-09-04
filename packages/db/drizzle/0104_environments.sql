CREATE TYPE "public"."environment_source_kind" AS ENUM('image', 'fork');--> statement-breakpoint
CREATE TABLE "environment_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"sensitive" boolean NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_secrets_environment_id_organization_id_key_unique" UNIQUE("environment_id","organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'blaxel' NOT NULL,
	"source_kind" "environment_source_kind" NOT NULL,
	"source_ref" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environments_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
--> Cloud workspaces predate environments and the column has no sensible
--> default; the rows go instead. Authorised: a handful of internal
--> workspaces behind the @superset.sh gate. Their sandboxes are not
--> deleted by this and must be torn down separately.
DELETE FROM "cloud_workspaces";--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "environment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "host_version" text;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "environment_secrets" ADD CONSTRAINT "environment_secrets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_secrets" ADD CONSTRAINT "environment_secrets_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_secrets" ADD CONSTRAINT "environment_secrets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_secrets_environment_id_idx" ON "environment_secrets" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "environment_secrets_organization_id_idx" ON "environment_secrets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "environments_organization_id_idx" ON "environments" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;