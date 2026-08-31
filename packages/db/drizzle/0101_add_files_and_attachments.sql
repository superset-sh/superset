CREATE TYPE "public"."attachment_parent_kind" AS ENUM('page_version', 'issue', 'doc', 'chat_session', 'comment');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"parent_kind" "attachment_parent_kind" NOT NULL,
	"parent_id" uuid NOT NULL,
	"path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_file_id_idx" ON "attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "attachments_parent_kind_parent_id_idx" ON "attachments" USING btree ("parent_kind","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_parent_path_unique" ON "attachments" USING btree ("parent_kind","parent_id","path") WHERE "attachments"."path" is not null;--> statement-breakpoint
CREATE INDEX "files_organization_id_created_at_idx" ON "files" USING btree ("organization_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "files_status_created_at_idx" ON "files" USING btree ("status","created_at");