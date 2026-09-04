ALTER TABLE "cloud_workspaces" DROP CONSTRAINT "cloud_workspaces_project_id_v2_projects_id_fk";
--> statement-breakpoint
DROP INDEX "cloud_workspaces_project_id_idx";--> statement-breakpoint
ALTER TABLE "cloud_workspaces" DROP COLUMN "project_id";