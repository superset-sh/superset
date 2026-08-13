CREATE TYPE "public"."factory_item_source" AS ENUM('github_issue', 'github_pr');--> statement-breakpoint
CREATE TYPE "public"."factory_prompt_author" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."factory_prompt_status" AS ENUM('active', 'draft', 'archived');--> statement-breakpoint
CREATE TYPE "public"."factory_run_outcome" AS ENUM('success', 'flawed', 'blocked', 'manual');--> statement-breakpoint
CREATE TYPE "public"."factory_run_status" AS ENUM('dispatching', 'dispatched', 'skipped_offline', 'dispatch_failed', 'reported');--> statement-breakpoint
CREATE TYPE "public"."factory_stage" AS ENUM('intake', 'classify', 'analyze', 'implement', 'review', 'human_review', 'verify', 'done', 'rejected');--> statement-breakpoint
CREATE TABLE "factories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"v2_project_id" uuid NOT NULL,
	"repo_full_name" text NOT NULL,
	"target_host_id" text,
	"default_agent" text NOT NULL,
	"stage_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_advance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factory_improve_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"stage" "factory_stage" NOT NULL,
	"source_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"host_id" text,
	"v2_workspace_id" uuid,
	"session_kind" "automation_session_kind",
	"terminal_session_id" text,
	"chat_session_id" uuid,
	"status" "factory_run_status" NOT NULL,
	"proposed_prompt_version_id" uuid,
	"rationale" text,
	"error" text,
	"dispatched_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" "factory_item_source" NOT NULL,
	"external_number" integer NOT NULL,
	"external_url" text NOT NULL,
	"title" text NOT NULL,
	"author_login" text,
	"materialization_key" text NOT NULL,
	"stage" "factory_stage" DEFAULT 'intake' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"blocked_reason" text,
	"kind" text,
	"confidence" integer,
	"pr_number" integer,
	"pr_url" text,
	"task_id" uuid,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "factory_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"factory_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"stage" "factory_stage" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"prompt_version_id" uuid,
	"host_id" text,
	"v2_workspace_id" uuid,
	"session_kind" "automation_session_kind",
	"terminal_session_id" text,
	"chat_session_id" uuid,
	"status" "factory_run_status" NOT NULL,
	"outcome" "factory_run_outcome",
	"result_json" jsonb,
	"rationale" text,
	"error" text,
	"feedback_note" text,
	"actor_user_id" uuid,
	"dispatched_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factory_stage_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"stage" "factory_stage" NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"status" "factory_prompt_status" DEFAULT 'draft' NOT NULL,
	"authored_by" "factory_prompt_author" NOT NULL,
	"author_user_id" uuid,
	"source_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factories" ADD CONSTRAINT "factories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factories" ADD CONSTRAINT "factories_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_improve_runs" ADD CONSTRAINT "factory_improve_runs_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_improve_runs" ADD CONSTRAINT "factory_improve_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_improve_runs" ADD CONSTRAINT "factory_improve_runs_proposed_prompt_version_id_factory_stage_prompts_id_fk" FOREIGN KEY ("proposed_prompt_version_id") REFERENCES "public"."factory_stage_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_items" ADD CONSTRAINT "factory_items_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_items" ADD CONSTRAINT "factory_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_items" ADD CONSTRAINT "factory_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_runs" ADD CONSTRAINT "factory_runs_item_id_factory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."factory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_runs" ADD CONSTRAINT "factory_runs_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_runs" ADD CONSTRAINT "factory_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_runs" ADD CONSTRAINT "factory_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_stage_prompts" ADD CONSTRAINT "factory_stage_prompts_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factory_stage_prompts" ADD CONSTRAINT "factory_stage_prompts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factories_organization_idx" ON "factories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "factory_improve_runs_stage_idx" ON "factory_improve_runs" USING btree ("factory_id","stage","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "factory_items_materialization_idx" ON "factory_items" USING btree ("factory_id","materialization_key");--> statement-breakpoint
CREATE INDEX "factory_items_board_idx" ON "factory_items" USING btree ("factory_id","stage");--> statement-breakpoint
CREATE INDEX "factory_items_organization_idx" ON "factory_items" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "factory_runs_attempt_idx" ON "factory_runs" USING btree ("item_id","stage","attempt");--> statement-breakpoint
CREATE INDEX "factory_runs_item_idx" ON "factory_runs" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "factory_runs_stage_idx" ON "factory_runs" USING btree ("factory_id","stage");--> statement-breakpoint
CREATE INDEX "factory_runs_workspace_idx" ON "factory_runs" USING btree ("v2_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "factory_stage_prompts_version_idx" ON "factory_stage_prompts" USING btree ("factory_id","stage","version");--> statement-breakpoint
CREATE UNIQUE INDEX "factory_stage_prompts_active_idx" ON "factory_stage_prompts" USING btree ("factory_id","stage") WHERE "factory_stage_prompts"."status" = 'active';