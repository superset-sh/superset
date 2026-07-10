CREATE TYPE "public"."automation_run_status" AS ENUM('pending', 'dispatching', 'dispatched', 'skipped_offline', 'dispatch_failed');--> statement-breakpoint
CREATE TYPE "public"."automation_session_kind" AS ENUM('chat', 'terminal');--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"host_id" uuid,
	"v2_workspace_id" uuid,
	"session_kind" "automation_session_kind",
	"chat_session_id" uuid,
	"terminal_session_id" text,
	"status" "automation_run_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"agent_config" jsonb NOT NULL,
	"target_host_id" uuid,
	"v2_project_id" uuid NOT NULL,
	"v2_workspace_id" uuid,
	"rrule" text NOT NULL,
	"dtstart" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mcp_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_host_id_v2_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."v2_hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_target_host_id_v2_hosts_id_fk" FOREIGN KEY ("target_host_id") REFERENCES "public"."v2_hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_v2_project_id_v2_projects_id_fk" FOREIGN KEY ("v2_project_id") REFERENCES "public"."v2_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_dedup_idx" ON "automation_runs" USING btree ("automation_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "automation_runs_history_idx" ON "automation_runs" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_status_idx" ON "automation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automation_runs_workspace_idx" ON "automation_runs" USING btree ("v2_workspace_id");--> statement-breakpoint
CREATE INDEX "automations_dispatcher_idx" ON "automations" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "automations_owner_idx" ON "automations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "automations_organization_idx" ON "automations" USING btree ("organization_id");