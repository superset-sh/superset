CREATE TYPE "public"."v2_agent_state" AS ENUM('working', 'review', 'permission', 'failed');--> statement-breakpoint
CREATE TYPE "public"."v2_live_activity_token_kind" AS ENUM('update', 'push_to_start');--> statement-breakpoint
CREATE TABLE "v2_agent_status" (
	"organization_id" uuid NOT NULL,
	"machine_id" text NOT NULL,
	"terminal_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"project_id" text,
	"project_name" text,
	"state" "v2_agent_state" NOT NULL,
	"since_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_agent_status_organization_id_machine_id_terminal_id_pk" PRIMARY KEY("organization_id","machine_id","terminal_id")
);
--> statement-breakpoint
CREATE TABLE "v2_live_activity_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "v2_live_activity_token_kind" NOT NULL,
	"token" text NOT NULL,
	"activity_id" text,
	"labels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_agent_status" ADD CONSTRAINT "v2_agent_status_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_agent_status" ADD CONSTRAINT "v2_agent_status_host_fk" FOREIGN KEY ("organization_id","machine_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_live_activity_tokens" ADD CONSTRAINT "v2_live_activity_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_live_activity_tokens" ADD CONSTRAINT "v2_live_activity_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "v2_live_activity_tokens_token_idx" ON "v2_live_activity_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "v2_live_activity_tokens_user_org_idx" ON "v2_live_activity_tokens" USING btree ("user_id","organization_id");