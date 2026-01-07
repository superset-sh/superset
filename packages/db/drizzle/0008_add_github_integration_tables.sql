ALTER TYPE "public"."integration_provider" ADD VALUE 'github';--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by_user_id" uuid NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp,
	"refresh_token" text,
	"webhook_id" text,
	"webhook_secret" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_installation_id_unique" UNIQUE("installation_id"),
	CONSTRAINT "github_installations_org_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "github_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"pr_number" integer NOT NULL,
	"node_id" text NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean NOT NULL,
	"url" text NOT NULL,
	"head_branch" text NOT NULL,
	"base_branch" text NOT NULL,
	"head_sha" text NOT NULL,
	"author_login" text NOT NULL,
	"author_avatar_url" text,
	"additions" integer NOT NULL,
	"deletions" integer NOT NULL,
	"changed_files" integer NOT NULL,
	"review_decision" text,
	"checks_status" text NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"etag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_pull_requests_node_id_unique" UNIQUE("node_id"),
	CONSTRAINT "github_pull_requests_repo_pr_unique" UNIQUE("repository_id","pr_number")
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"repo_id" text NOT NULL,
	"full_name" text NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"is_private" boolean NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_repositories_repo_id_unique" UNIQUE("repo_id")
);
--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_installations_installation_id_idx" ON "github_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_installations_org_idx" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "github_pull_requests_repo_idx" ON "github_pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "github_pull_requests_head_branch_idx" ON "github_pull_requests" USING btree ("head_branch");--> statement-breakpoint
CREATE INDEX "github_pull_requests_state_idx" ON "github_pull_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "github_pull_requests_checks_status_idx" ON "github_pull_requests" USING btree ("checks_status");--> statement-breakpoint
CREATE INDEX "github_pull_requests_synced_at_idx" ON "github_pull_requests" USING btree ("last_synced_at");--> statement-breakpoint
CREATE INDEX "github_repositories_installation_idx" ON "github_repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_repositories_full_name_idx" ON "github_repositories" USING btree ("full_name");