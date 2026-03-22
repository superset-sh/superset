ALTER TABLE "v2_projects" DROP CONSTRAINT "v2_projects_github_repository_id_github_repositories_id_fk";
--> statement-breakpoint
ALTER TABLE "v2_workspaces" DROP CONSTRAINT "v2_workspaces_device_id_v2_devices_id_fk";
--> statement-breakpoint
ALTER TABLE "v2_projects" ALTER COLUMN "github_repository_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ALTER COLUMN "device_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_projects" ADD CONSTRAINT "v2_projects_github_repository_id_github_repositories_id_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_device_id_v2_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."v2_devices"("id") ON DELETE no action ON UPDATE no action;