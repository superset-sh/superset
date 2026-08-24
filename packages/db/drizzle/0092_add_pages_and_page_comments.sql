CREATE TYPE "public"."page_comment_anchor_kind" AS ENUM('element', 'text', 'page');--> statement-breakpoint
CREATE TYPE "public"."page_comment_author_kind" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."page_visibility" AS ENUM('just_me', 'org', 'everyone');--> statement-breakpoint
CREATE TABLE "page_comment_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"page_version_id" uuid NOT NULL,
	"anchor_kind" "page_comment_anchor_kind" NOT NULL,
	"anchor" jsonb,
	"anchor_text" text,
	"created_by_user_id" uuid,
	"agent_activated_at" timestamp with time zone,
	"agent_activated_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_comment_threads_anchor_matches_kind" CHECK ((anchor_kind = 'page') = (anchor IS NULL))
);
--> statement-breakpoint
CREATE TABLE "page_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_kind" "page_comment_author_kind" DEFAULT 'human' NOT NULL,
	"author_user_id" uuid,
	"agent_session_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "page_comments_agent_has_session" CHECK (author_kind <> 'agent' OR agent_session_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"label" text,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "page_versions_page_id_version_unique" UNIQUE("page_id","version")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"visibility" "page_visibility" DEFAULT 'just_me' NOT NULL,
	"shared_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_pages" (
	"workspace_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"entry_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_pages_workspace_id_page_id_pk" PRIMARY KEY("workspace_id","page_id")
);
--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_page_version_id_page_versions_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_agent_activated_by_user_id_users_id_fk" FOREIGN KEY ("agent_activated_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_thread_id_page_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."page_comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_pages" ADD CONSTRAINT "workspace_pages_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_comment_threads_page_id_idx" ON "page_comment_threads" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "page_comment_threads_page_version_id_idx" ON "page_comment_threads" USING btree ("page_version_id");--> statement-breakpoint
CREATE INDEX "page_comment_threads_open_idx" ON "page_comment_threads" USING btree ("page_id") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "page_comments_thread_id_created_at_idx" ON "page_comments" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "page_versions_page_id_idx" ON "page_versions" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_unique" ON "pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pages_organization_id_updated_at_idx" ON "pages" USING btree ("organization_id","updated_at" desc);--> statement-breakpoint
CREATE INDEX "pages_created_by_user_id_idx" ON "pages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_pages_workspace_id_entry_path_unique" ON "workspace_pages" USING btree ("workspace_id","entry_path");--> statement-breakpoint
CREATE INDEX "workspace_pages_page_id_idx" ON "workspace_pages" USING btree ("page_id");