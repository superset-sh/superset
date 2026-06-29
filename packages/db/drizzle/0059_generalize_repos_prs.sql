ALTER TYPE "public"."integration_provider" ADD VALUE 'gitlab';--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"host" text NOT NULL,
	"number" integer NOT NULL,
	"external_id" text NOT NULL,
	"head_branch" text NOT NULL,
	"head_sha" text NOT NULL,
	"base_branch" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"author_login" text NOT NULL,
	"author_avatar_url" text,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changed_files" integer DEFAULT 0 NOT NULL,
	"review_state_json" jsonb,
	"checks_status" text DEFAULT 'none' NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pull_requests_repo_number_unique" UNIQUE("repository_id","number")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"host" text NOT NULL,
	"installation_id" uuid,
	"connection_id" uuid,
	"organization_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_provider_host_external_id_unique" UNIQUE("provider","host","external_id")
);
--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pull_requests_repository_id_idx" ON "pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pull_requests_state_idx" ON "pull_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "pull_requests_head_branch_idx" ON "pull_requests" USING btree ("head_branch");--> statement-breakpoint
CREATE INDEX "pull_requests_org_id_idx" ON "pull_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repositories_installation_id_idx" ON "repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "repositories_connection_id_idx" ON "repositories" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "repositories_full_name_idx" ON "repositories" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "repositories_org_id_idx" ON "repositories" USING btree ("organization_id");