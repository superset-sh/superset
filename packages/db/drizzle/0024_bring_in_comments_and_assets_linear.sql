CREATE TABLE "task_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"external_provider" "integration_provider" NOT NULL,
	"source_kind" text NOT NULL,
	"source_url" text NOT NULL,
	"source_hash" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_assets_unique_source" UNIQUE("organization_id","task_id","source_hash")
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_external_id" text,
	"author_name" text,
	"author_avatar_url" text,
	"external_provider" "integration_provider" NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"parent_comment_external_id" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_external_unique" UNIQUE("organization_id","external_provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "task_assets" ADD CONSTRAINT "task_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assets" ADD CONSTRAINT "task_assets_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_assets_org_idx" ON "task_assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "task_assets_task_idx" ON "task_assets" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_assets_provider_idx" ON "task_assets" USING btree ("external_provider");--> statement-breakpoint
CREATE INDEX "task_comments_org_idx" ON "task_comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_created_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_comments_provider_idx" ON "task_comments" USING btree ("external_provider");