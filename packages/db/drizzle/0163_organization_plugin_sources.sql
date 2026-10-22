CREATE TABLE "organization_plugin_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repo" text NOT NULL,
	"ref" text,
	"path" text DEFAULT '' NOT NULL,
	"synced_sha" text,
	"synced_at" timestamp,
	"sync_error" text,
	"added_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_plugins" DROP CONSTRAINT "organization_plugins_uploaded_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD COLUMN "content_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD COLUMN "install_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD COLUMN "removed_from_source_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization_plugin_sources" ADD CONSTRAINT "organization_plugin_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_plugin_sources" ADD CONSTRAINT "organization_plugin_sources_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_plugin_sources_organization_repo_path_unique" ON "organization_plugin_sources" USING btree ("organization_id","repo","path");--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD CONSTRAINT "organization_plugins_source_id_organization_plugin_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."organization_plugin_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_plugins_source_idx" ON "organization_plugins" USING btree ("source_id");--> statement-breakpoint
ALTER TABLE "organization_plugins" DROP COLUMN "uploaded_by_user_id";--> statement-breakpoint
ALTER TABLE "organization_plugins" DROP COLUMN "published_at";