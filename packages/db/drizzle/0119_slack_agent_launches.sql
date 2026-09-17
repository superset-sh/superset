CREATE TABLE "slack_agent_launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_session_id" uuid NOT NULL,
	"launched_by_user_id" uuid NOT NULL,
	"host_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"terminal_id" text NOT NULL,
	"agent_label" text NOT NULL,
	"workspace_name" text,
	"workspace_branch" text,
	"polls" integer DEFAULT 0 NOT NULL,
	"launched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_agent_launches_terminal_unique" UNIQUE("thread_session_id","terminal_id")
);
--> statement-breakpoint
ALTER TABLE "slack_thread_sessions" ADD COLUMN "quieted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slack_agent_launches" ADD CONSTRAINT "slack_agent_launches_thread_session_id_slack_thread_sessions_id_fk" FOREIGN KEY ("thread_session_id") REFERENCES "public"."slack_thread_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_agent_launches" ADD CONSTRAINT "slack_agent_launches_launched_by_user_id_users_id_fk" FOREIGN KEY ("launched_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;