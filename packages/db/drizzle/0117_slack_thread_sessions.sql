CREATE TABLE "slack_thread_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_ts" text NOT NULL,
	"started_by_user_id" uuid,
	"status" text DEFAULT 'idle' NOT NULL,
	"quiet" boolean DEFAULT false NOT NULL,
	"last_context_ts" text,
	"entity_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"queued_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_thread_sessions_thread_unique" UNIQUE("organization_id","team_id","channel_id","thread_ts")
);
--> statement-breakpoint
ALTER TABLE "slack_thread_sessions" ADD CONSTRAINT "slack_thread_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_thread_sessions" ADD CONSTRAINT "slack_thread_sessions_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;