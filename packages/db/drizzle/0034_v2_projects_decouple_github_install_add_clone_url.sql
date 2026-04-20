ALTER TABLE "v2_projects" DROP CONSTRAINT "v2_projects_github_repository_id_github_repositories_id_fk";
--> statement-breakpoint
ALTER TABLE "v2_projects" ALTER COLUMN "github_repository_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_projects" ADD COLUMN "repo_clone_url" text;--> statement-breakpoint
ALTER TABLE "v2_projects" ADD CONSTRAINT "v2_projects_github_repository_id_github_repositories_id_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "v2_projects_org_repo_clone_url_unique" ON "v2_projects" USING btree ("organization_id",lower("repo_clone_url"));