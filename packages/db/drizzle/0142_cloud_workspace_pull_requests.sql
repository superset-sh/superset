CREATE TABLE "cloud_workspace_pull_requests" (
	"cloud_workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"pr_number" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspace_pull_requests_pk" PRIMARY KEY("cloud_workspace_id","repository_id","pr_number")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspace_pull_requests" ADD CONSTRAINT "cloud_workspace_pull_requests_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_pull_requests" ADD CONSTRAINT "cloud_workspace_pull_requests_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;