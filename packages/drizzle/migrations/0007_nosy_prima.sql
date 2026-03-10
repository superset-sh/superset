CREATE TYPE "public"."task_activity_action" AS ENUM('created', 'status_changed', 'priority_changed', 'assigned', 'unassigned', 'label_added', 'label_removed', 'project_changed', 'cycle_changed', 'estimate_changed', 'due_date_changed', 'title_changed', 'description_changed', 'parent_changed', 'commented');--> statement-breakpoint
CREATE TYPE "public"."task_cycle_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."task_project_status" AS ENUM('planned', 'started', 'paused', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'duplicate');--> statement-breakpoint
CREATE TABLE "task_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" "task_activity_action" NOT NULL,
	"from_value" text,
	"to_value" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(200),
	"number" serial NOT NULL,
	"status" "task_cycle_status" DEFAULT 'active' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_by_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(7) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "task_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"color" varchar(7),
	"status" "task_project_status" DEFAULT 'planned' NOT NULL,
	"start_date" date,
	"target_date" date,
	"created_by_id" uuid NOT NULL,
	CONSTRAINT "task_projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "task_task_labels" (
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "task_task_labels_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "task_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"identifier" varchar(20) NOT NULL,
	"number" serial NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'backlog' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assignee_id" uuid,
	"created_by_id" uuid NOT NULL,
	"project_id" uuid,
	"cycle_id" uuid,
	"parent_id" uuid,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"estimate" integer,
	"sort_order" real DEFAULT 0 NOT NULL,
	CONSTRAINT "task_tasks_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_task_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_task_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_cycles" ADD CONSTRAINT "task_cycles_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_task_labels" ADD CONSTRAINT "task_task_labels_task_id_task_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_task_labels" ADD CONSTRAINT "task_task_labels_label_id_task_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."task_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tasks" ADD CONSTRAINT "task_tasks_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tasks" ADD CONSTRAINT "task_tasks_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tasks" ADD CONSTRAINT "task_tasks_project_id_task_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tasks" ADD CONSTRAINT "task_tasks_cycle_id_task_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."task_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tasks" ADD CONSTRAINT "task_tasks_parent_id_task_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_activities_task" ON "task_activities" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_activities_created_at" ON "task_activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_task_comments_task" ON "task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_tasks_status" ON "task_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_task_tasks_assignee" ON "task_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_task_tasks_project" ON "task_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_task_tasks_cycle" ON "task_tasks" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_task_tasks_parent" ON "task_tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_task_tasks_created_at" ON "task_tasks" USING btree ("created_at");