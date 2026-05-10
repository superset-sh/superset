ALTER TABLE "integration_connections" DROP CONSTRAINT "integration_connections_unique";--> statement-breakpoint
ALTER TABLE "v2_projects" ADD COLUMN "linear_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "v2_projects" ADD CONSTRAINT "v2_projects_linear_connection_id_integration_connections_id_fk" FOREIGN KEY ("linear_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "v2_projects_linear_connection_idx" ON "v2_projects" USING btree ("linear_connection_id");--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_org_provider_external_unique" UNIQUE("organization_id","provider","external_org_id");