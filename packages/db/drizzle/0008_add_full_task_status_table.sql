-- Clean up existing tasks before schema change
DELETE FROM "tasks";
--> statement-breakpoint
CREATE TABLE "task_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"type" text NOT NULL,
	"position" real NOT NULL,
	"progress_percent" real,
	"external_provider" "integration_provider",
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_statuses_org_external_unique" UNIQUE("organization_id","external_provider","external_id")
);
--> statement-breakpoint
DROP INDEX "tasks_status_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_statuses_organization_id_idx" ON "task_statuses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "task_statuses_type_idx" ON "task_statuses" USING btree ("type");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_id_task_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."task_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_status_id_idx" ON "tasks" USING btree ("status_id");--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status_color";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status_type";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status_position";