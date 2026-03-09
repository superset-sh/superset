-- 1. Add columns as nullable
ALTER TABLE "github_repositories" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "organization_id" uuid;--> statement-breakpoint

-- 2. Backfill github_repositories from github_installations
UPDATE "github_repositories" r
SET "organization_id" = i."organization_id"
FROM "github_installations" i
WHERE r."installation_id" = i."id";--> statement-breakpoint

-- 3. Backfill github_pull_requests from github_repositories
UPDATE "github_pull_requests" pr
SET "organization_id" = r."organization_id"
FROM "github_repositories" r
WHERE pr."repository_id" = r."id";--> statement-breakpoint

-- 4. Set NOT NULL
ALTER TABLE "github_repositories" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint

-- 5. Add FK constraints
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 6. Add indexes
CREATE INDEX "github_repositories_org_id_idx" ON "github_repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "github_pull_requests_org_id_idx" ON "github_pull_requests" USING btree ("organization_id");
