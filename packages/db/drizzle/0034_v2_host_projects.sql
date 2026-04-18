CREATE TABLE "v2_host_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_host_projects_project_host_unique" UNIQUE("project_id","host_id")
);
--> statement-breakpoint
ALTER TABLE "v2_host_projects" ADD CONSTRAINT "v2_host_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_host_projects" ADD CONSTRAINT "v2_host_projects_project_id_v2_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_host_projects" ADD CONSTRAINT "v2_host_projects_host_id_v2_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."v2_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "v2_host_projects_organization_id_idx" ON "v2_host_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_host_projects_project_id_idx" ON "v2_host_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "v2_host_projects_host_id_idx" ON "v2_host_projects" USING btree ("host_id");