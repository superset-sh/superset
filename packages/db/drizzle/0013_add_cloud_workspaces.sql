CREATE TABLE "cloud_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"name" text NOT NULL,
	"branch" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspaces_organization_id_idx" ON "cloud_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cloud_workspaces_repository_id_idx" ON "cloud_workspaces" USING btree ("repository_id");