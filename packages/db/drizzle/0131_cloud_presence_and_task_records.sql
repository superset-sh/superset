CREATE TYPE "public"."actor_kind" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."cloud_workspace_activity_event" AS ENUM('created', 'archived', 'joined', 'description_edited', 'run_finished', 'run_failed');--> statement-breakpoint
CREATE TYPE "public"."cloud_workspace_visibility" AS ENUM('just_me', 'org');--> statement-breakpoint
CREATE TYPE "public"."suggestion_entity" AS ENUM('cloud_workspace', 'task', 'task_project', 'task_label', 'pull_request');--> statement-breakpoint
CREATE TYPE "public"."suggestion_kind" AS ENUM('set_field', 'rewrite', 'relate', 'link_task', 'add_link', 'create_task');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'dismissed', 'stale', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."task_project_state" AS ENUM('planned', 'started', 'paused', 'completed', 'canceled');--> statement-breakpoint
ALTER TYPE "public"."attachment_parent_kind" ADD VALUE 'cloud_workspace_prompt';--> statement-breakpoint
ALTER TYPE "public"."attachment_parent_kind" ADD VALUE 'task_comment';--> statement-breakpoint
ALTER TYPE "public"."attachment_parent_kind" ADD VALUE 'project_description';--> statement-breakpoint
CREATE TABLE "cloud_workspace_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_workspace_id" uuid NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"event" "cloud_workspace_activity_event",
	"from_name" text,
	"to_name" text,
	"from_visibility" "cloud_workspace_visibility",
	"to_visibility" "cloud_workspace_visibility",
	"from_project_id" uuid,
	"to_project_id" uuid,
	"added_label_ids" uuid[],
	"removed_label_ids" uuid[],
	"linked_task_id" uuid,
	"unlinked_task_id" uuid,
	"pr_url" text,
	"page_id" uuid,
	"suggestion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_workspace_labels" (
	"cloud_workspace_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspace_labels_cloud_workspace_id_label_id_pk" PRIMARY KEY("cloud_workspace_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "cloud_workspace_presence" (
	"cloud_workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspace_presence_cloud_workspace_id_user_id_pk" PRIMARY KEY("cloud_workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "cloud_workspace_tasks" (
	"cloud_workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"linked_by_kind" "actor_kind" NOT NULL,
	"linked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspace_tasks_cloud_workspace_id_task_id_pk" PRIMARY KEY("cloud_workspace_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "suggestion_kind" NOT NULL,
	"subject_type" "suggestion_entity" NOT NULL,
	"subject_id" uuid NOT NULL,
	"object_type" "suggestion_entity",
	"object_id" uuid,
	"payload" jsonb,
	"reason" text,
	"source" text NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"proposed_by_kind" "actor_kind" NOT NULL,
	"proposed_by_user_id" uuid,
	"automation_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"from_title" text,
	"to_title" text,
	"from_status_id" uuid,
	"to_status_id" uuid,
	"from_priority" "task_priority",
	"to_priority" "task_priority",
	"from_assignee_id" uuid,
	"to_assignee_id" uuid,
	"from_project_id" uuid,
	"to_project_id" uuid,
	"description_edited" boolean DEFAULT false NOT NULL,
	"added_label_ids" uuid[],
	"removed_label_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_user_id" uuid,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_label_assignments" (
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_label_assignments_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"color" text,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_project_tasks" (
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_project_tasks_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "task_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"state" "task_project_state" DEFAULT 'planned' NOT NULL,
	"lead_user_id" uuid,
	"start_date" date,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "visibility" "cloud_workspace_visibility" DEFAULT 'org' NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_from_project_id_task_projects_id_fk" FOREIGN KEY ("from_project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_to_project_id_task_projects_id_fk" FOREIGN KEY ("to_project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_linked_task_id_tasks_id_fk" FOREIGN KEY ("linked_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_unlinked_task_id_tasks_id_fk" FOREIGN KEY ("unlinked_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_activity" ADD CONSTRAINT "cloud_workspace_activity_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_labels" ADD CONSTRAINT "cloud_workspace_labels_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_labels" ADD CONSTRAINT "cloud_workspace_labels_label_id_task_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."task_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_presence" ADD CONSTRAINT "cloud_workspace_presence_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_presence" ADD CONSTRAINT "cloud_workspace_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_tasks" ADD CONSTRAINT "cloud_workspace_tasks_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_tasks" ADD CONSTRAINT "cloud_workspace_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_tasks" ADD CONSTRAINT "cloud_workspace_tasks_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_from_status_id_task_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."task_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_to_status_id_task_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."task_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_from_assignee_id_users_id_fk" FOREIGN KEY ("from_assignee_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_to_assignee_id_users_id_fk" FOREIGN KEY ("to_assignee_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_from_project_id_task_projects_id_fk" FOREIGN KEY ("from_project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_to_project_id_task_projects_id_fk" FOREIGN KEY ("to_project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_parent_comment_id_task_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_label_id_task_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."task_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_parent_id_task_labels_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_project_tasks" ADD CONSTRAINT "task_project_tasks_project_id_task_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."task_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_project_tasks" ADD CONSTRAINT "task_project_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspace_activity_workspace_created_idx" ON "cloud_workspace_activity" USING btree ("cloud_workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "cloud_workspace_activity_linked_task_id_idx" ON "cloud_workspace_activity" USING btree ("linked_task_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_activity_unlinked_task_id_idx" ON "cloud_workspace_activity" USING btree ("unlinked_task_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_labels_label_id_idx" ON "cloud_workspace_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_presence_user_id_idx" ON "cloud_workspace_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_tasks_task_id_idx" ON "cloud_workspace_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suggestions_kind_subject_object_unique" ON "suggestions" USING btree ("kind","subject_type","subject_id","object_type","object_id");--> statement-breakpoint
CREATE INDEX "suggestions_subject_status_idx" ON "suggestions" USING btree ("subject_type","subject_id","status");--> statement-breakpoint
CREATE INDEX "suggestions_organization_id_status_idx" ON "suggestions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "task_activity_task_created_idx" ON "task_activity" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_activity_actor_user_id_idx" ON "task_activity" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "task_activity_from_status_id_idx" ON "task_activity" USING btree ("from_status_id");--> statement-breakpoint
CREATE INDEX "task_activity_to_status_id_idx" ON "task_activity" USING btree ("to_status_id");--> statement-breakpoint
CREATE INDEX "task_activity_from_assignee_id_idx" ON "task_activity" USING btree ("from_assignee_id");--> statement-breakpoint
CREATE INDEX "task_activity_to_assignee_id_idx" ON "task_activity" USING btree ("to_assignee_id");--> statement-breakpoint
CREATE INDEX "task_activity_from_project_id_idx" ON "task_activity" USING btree ("from_project_id");--> statement-breakpoint
CREATE INDEX "task_activity_to_project_id_idx" ON "task_activity" USING btree ("to_project_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_created_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_comments_author_user_id_idx" ON "task_comments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "task_comments_parent_comment_id_idx" ON "task_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "task_label_assignments_label_id_idx" ON "task_label_assignments" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_labels_organization_id_name_unique" ON "task_labels" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "task_project_tasks_project_id_idx" ON "task_project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_projects_organization_id_idx" ON "task_projects" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD CONSTRAINT "cloud_workspaces_project_id_task_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;