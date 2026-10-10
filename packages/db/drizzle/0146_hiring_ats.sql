CREATE TYPE "public"."hiring_event_kind" AS ENUM('note', 'stage_change', 'outcome_change', 'outreach', 'reply', 'interview');--> statement-breakpoint
CREATE TYPE "public"."hiring_outcome" AS ENUM('active', 'hired', 'rejected', 'withdrew', 'not_looking');--> statement-breakpoint
CREATE TYPE "public"."hiring_role_status" AS ENUM('open', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."hiring_score" AS ENUM('strong_hire', 'lean_hire', 'lean_no_hire', 'strong_no_hire');--> statement-breakpoint
CREATE TYPE "public"."hiring_source" AS ENUM('power_user', 'referral', 'waas', 'inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."hiring_stage" AS ENUM('sourced', 'reached_out', 'screen', 'technical', 'system_design', 'work_trial', 'onsite', 'offer');--> statement-breakpoint
CREATE TABLE "hiring_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"stage" "hiring_stage" DEFAULT 'sourced' NOT NULL,
	"outcome" "hiring_outcome" DEFAULT 'active' NOT NULL,
	"score" "hiring_score",
	"owner_user_id" uuid,
	"next_step" text,
	"next_follow_up_on" date,
	"last_contacted_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"current_title" text,
	"current_company" text,
	"github_url" text,
	"linkedin_url" text,
	"x_url" text,
	"site_url" text,
	"waas_url" text,
	"superset_user_id" uuid,
	"source" "hiring_source",
	"referred_by" text,
	"notion_page_id" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"kind" "hiring_event_kind" NOT NULL,
	"body" text,
	"metadata" jsonb,
	"author_user_id" uuid,
	"author_label" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" "hiring_role_status" DEFAULT 'open' NOT NULL,
	"waas_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hiring_applications" ADD CONSTRAINT "hiring_applications_candidate_id_hiring_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."hiring_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_applications" ADD CONSTRAINT "hiring_applications_role_id_hiring_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."hiring_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_applications" ADD CONSTRAINT "hiring_applications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_candidates" ADD CONSTRAINT "hiring_candidates_superset_user_id_users_id_fk" FOREIGN KEY ("superset_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_candidates" ADD CONSTRAINT "hiring_candidates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_events" ADD CONSTRAINT "hiring_events_candidate_id_hiring_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."hiring_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_events" ADD CONSTRAINT "hiring_events_application_id_hiring_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."hiring_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_events" ADD CONSTRAINT "hiring_events_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hiring_applications_candidate_role_unique" ON "hiring_applications" USING btree ("candidate_id","role_id");--> statement-breakpoint
CREATE INDEX "hiring_applications_outcome_follow_up_idx" ON "hiring_applications" USING btree ("outcome","next_follow_up_on");--> statement-breakpoint
CREATE UNIQUE INDEX "hiring_candidates_email_unique" ON "hiring_candidates" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "hiring_candidates_notion_page_id_unique" ON "hiring_candidates" USING btree ("notion_page_id");--> statement-breakpoint
CREATE INDEX "hiring_candidates_github_url_idx" ON "hiring_candidates" USING btree ("github_url");--> statement-breakpoint
CREATE INDEX "hiring_events_candidate_occurred_at_idx" ON "hiring_events" USING btree ("candidate_id","occurred_at" desc);--> statement-breakpoint
CREATE INDEX "hiring_events_kind_occurred_at_idx" ON "hiring_events" USING btree ("kind","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hiring_roles_title_unique" ON "hiring_roles" USING btree ("title");