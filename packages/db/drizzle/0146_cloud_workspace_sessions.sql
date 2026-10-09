CREATE TABLE "cloud_workspace_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"cloud_workspace_id" uuid NOT NULL,
	"vcpus" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"observed_ms" integer DEFAULT 0 NOT NULL,
	"reported_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_workspace_sessions" ADD CONSTRAINT "cloud_workspace_sessions_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspace_sessions_cloud_workspace_id_idx" ON "cloud_workspace_sessions" USING btree ("cloud_workspace_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_sessions_unsettled_idx" ON "cloud_workspace_sessions" USING btree ("cloud_workspace_id") WHERE "cloud_workspace_sessions"."stopped_at" is null or "cloud_workspace_sessions"."reported_ms" < "cloud_workspace_sessions"."observed_ms";