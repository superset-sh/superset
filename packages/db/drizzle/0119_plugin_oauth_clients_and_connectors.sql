CREATE TABLE "plugin_oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_secret_expires_at" timestamp,
	"registration_access_token" text,
	"registration_client_uri" text,
	"token_endpoint_auth_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"connector" text NOT NULL,
	"owner_kind" text NOT NULL,
	"auth_method" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scopes" text[],
	"issuer" text,
	"resource" text,
	"external_account_id" text NOT NULL,
	"external_account_label" text,
	"external_user_id" text,
	"external_user_label" text,
	"config" jsonb,
	"state" jsonb,
	"disconnected_at" timestamp,
	"disconnect_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connections_user_identity_present" CHECK (owner_kind <> 'user' OR external_user_id IS NOT NULL)
);
--> statement-breakpoint
-- Hand-ordered: this must run before the DROP TABLE below. That statement takes
-- ACCESS EXCLUSIVE on auth.organizations, and an in-flight insert into
-- automation_events holds automation_events while waiting on auth.organizations
-- for its foreign-key check, so the generated order deadlocks under traffic.
ALTER TABLE "automation_events" DROP CONSTRAINT "automation_events_integration_connection_id_integration_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "plugin_connections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "plugin_connections" CASCADE;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_oauth_clients_issuer_redirect_unique" ON "plugin_oauth_clients" USING btree ("issuer","redirect_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_org_connector_unique" ON "connections" USING btree ("organization_id","connector") WHERE "connections"."owner_kind" = 'org';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_connector_unique" ON "connections" USING btree ("organization_id","connector","connected_by_user_id","external_account_id") WHERE "connections"."owner_kind" = 'user';--> statement-breakpoint
CREATE INDEX "connections_org_idx" ON "connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "connections_user_connector_idx" ON "connections" USING btree ("connected_by_user_id","connector") WHERE "connections"."disconnected_at" IS NULL;--> statement-breakpoint
CREATE INDEX "connections_external_account_idx" ON "connections" USING btree ("connector","external_account_id");