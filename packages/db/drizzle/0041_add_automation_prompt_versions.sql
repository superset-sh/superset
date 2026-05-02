CREATE TYPE "public"."automation_prompt_source" AS ENUM('human', 'agent', 'restore');--> statement-breakpoint
CREATE TABLE "automation_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"window_bucket" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"source" "automation_prompt_source" NOT NULL,
	"restored_from_version_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_prompt_versions" ADD CONSTRAINT "automation_prompt_versions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_prompt_versions" ADD CONSTRAINT "automation_prompt_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_prompt_versions" ADD CONSTRAINT "automation_prompt_versions_restored_from_version_id_fk" FOREIGN KEY ("restored_from_version_id") REFERENCES "public"."automation_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_prompt_versions_bucket_uniq" ON "automation_prompt_versions" USING btree ("automation_id","author_user_id","window_bucket") WHERE "automation_prompt_versions"."source" <> 'restore';--> statement-breakpoint
CREATE INDEX "automation_prompt_versions_automation_idx" ON "automation_prompt_versions" USING btree ("automation_id","updated_at");--> statement-breakpoint
INSERT INTO "automation_prompt_versions" (
	"automation_id",
	"author_user_id",
	"window_bucket",
	"content",
	"content_hash",
	"source",
	"started_at",
	"updated_at"
)
SELECT
	a."id",
	a."owner_user_id",
	(extract(epoch from a."created_at") / 600)::int,
	a."prompt",
	encode(sha256(convert_to(a."prompt", 'UTF8')), 'hex'),
	'human',
	a."created_at",
	a."created_at"
FROM "automations" a;