CREATE TABLE "plugin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"plugin_name" text NOT NULL,
	"install_id" uuid,
	"auth_method" text DEFAULT 'oauth2' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scopes" text[],
	"config" jsonb,
	"external_account_id" text NOT NULL,
	"external_account_label" text,
	"disconnected_at" timestamp,
	"disconnect_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_installs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"marketplace" text NOT NULL,
	"plugin_name" text NOT NULL,
	"version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_marketplaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_kind" text NOT NULL,
	"repo" text,
	"ref" text,
	"path" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugin_connections" ADD CONSTRAINT "plugin_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_connections" ADD CONSTRAINT "plugin_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_connections" ADD CONSTRAINT "plugin_connections_install_id_plugin_installs_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."plugin_installs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_marketplaces" ADD CONSTRAINT "plugin_marketplaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_marketplaces" ADD CONSTRAINT "plugin_marketplaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_connections_account_active_unique" ON "plugin_connections" USING btree ("user_id","install_id","external_account_id") WHERE "plugin_connections"."disconnected_at" IS NULL;--> statement-breakpoint
CREATE INDEX "plugin_connections_user_plugin_idx" ON "plugin_connections" USING btree ("user_id","plugin_name");--> statement-breakpoint
CREATE INDEX "plugin_connections_install_idx" ON "plugin_connections" USING btree ("install_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_installs_user_plugin_unique" ON "plugin_installs" USING btree ("user_id","marketplace","plugin_name");--> statement-breakpoint
CREATE INDEX "plugin_installs_user_idx" ON "plugin_installs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_marketplaces_user_name_unique" ON "plugin_marketplaces" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "plugin_marketplaces_user_idx" ON "plugin_marketplaces" USING btree ("user_id");