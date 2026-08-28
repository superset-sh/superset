ALTER TABLE "review_pages" DROP CONSTRAINT "review_pages_github_pull_request_id_github_pull_requests_id_fk";
--> statement-breakpoint
DROP INDEX "review_pages_organization_id_pr_id_unique";--> statement-breakpoint
ALTER TABLE "review_pages" ADD COLUMN "repo_owner" text NOT NULL;--> statement-breakpoint
ALTER TABLE "review_pages" ADD COLUMN "repo_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "review_pages" ADD COLUMN "pr_number" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "review_pages_org_repo_pr_unique" ON "review_pages" USING btree ("organization_id","repo_owner","repo_name","pr_number");--> statement-breakpoint
ALTER TABLE "review_pages" DROP COLUMN "github_pull_request_id";