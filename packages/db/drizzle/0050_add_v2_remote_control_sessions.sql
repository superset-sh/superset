CREATE TYPE "public"."remote_control_session_mode" AS ENUM('command', 'full');--> statement-breakpoint
CREATE TYPE "public"."remote_control_session_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "v2_remote_control_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"host_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"terminal_id" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"mode" "remote_control_session_mode" NOT NULL,
	"status" "remote_control_session_status" DEFAULT 'active' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"last_connected_at" timestamp with time zone,
	"viewer_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_remote_control_sessions" ADD CONSTRAINT "v2_remote_control_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_remote_control_sessions" ADD CONSTRAINT "v2_remote_control_sessions_workspace_id_v2_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."v2_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_remote_control_sessions" ADD CONSTRAINT "v2_remote_control_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_remote_control_sessions" ADD CONSTRAINT "v2_remote_control_sessions_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_remote_control_sessions" ADD CONSTRAINT "v2_remote_control_sessions_host_fk" FOREIGN KEY ("organization_id","host_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "v2_remote_control_sessions_token_hash_uniq" ON "v2_remote_control_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "v2_remote_control_sessions_organization_id_idx" ON "v2_remote_control_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_remote_control_sessions_host_id_idx" ON "v2_remote_control_sessions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "v2_remote_control_sessions_workspace_id_idx" ON "v2_remote_control_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "v2_remote_control_sessions_terminal_id_idx" ON "v2_remote_control_sessions" USING btree ("terminal_id");--> statement-breakpoint
CREATE INDEX "v2_remote_control_sessions_status_idx" ON "v2_remote_control_sessions" USING btree ("status");