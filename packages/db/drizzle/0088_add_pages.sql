CREATE TYPE "public"."page_visibility" AS ENUM('just_me', 'org', 'everyone');--> statement-breakpoint
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
	"visibility" "page_visibility" DEFAULT 'org' NOT NULL,
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
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_pages" ADD CONSTRAINT "workspace_pages_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_versions_page_id_idx" ON "page_versions" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_unique" ON "pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pages_organization_id_idx" ON "pages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pages_created_by_user_id_idx" ON "pages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_pages_workspace_id_entry_path_unique" ON "workspace_pages" USING btree ("workspace_id","entry_path");--> statement-breakpoint
CREATE INDEX "workspace_pages_page_id_idx" ON "workspace_pages" USING btree ("page_id");