ALTER TABLE "automations" DROP CONSTRAINT "automations_v2_project_id_v2_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "v2_project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE set null ON UPDATE no action;