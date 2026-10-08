CREATE TABLE "organization_plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"uploaded_by_user_id" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD COLUMN "organization_plugin_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD CONSTRAINT "organization_plugins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_plugins" ADD CONSTRAINT "organization_plugins_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_plugins_organization_name_unique" ON "organization_plugins" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_organization_plugin_id_organization_plugins_id_fk" FOREIGN KEY ("organization_plugin_id") REFERENCES "public"."organization_plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugin_installs_organization_plugin_idx" ON "plugin_installs" USING btree ("organization_plugin_id");