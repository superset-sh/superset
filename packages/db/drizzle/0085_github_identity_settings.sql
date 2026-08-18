CREATE TYPE "public"."github_actor_policy" AS ENUM('bot', 'user_or_bot', 'user_only');--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"github_actor_policy" "github_actor_policy" DEFAULT 'user_or_bot' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "integration_connections_org_provider_unique";--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_github_user_unique" ON "integration_connections" USING btree ("organization_id","provider","connected_by_user_id") WHERE "integration_connections"."provider" = 'github';--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_org_provider_unique" ON "integration_connections" USING btree ("organization_id","provider") WHERE "integration_connections"."provider" NOT IN ('google', 'github');