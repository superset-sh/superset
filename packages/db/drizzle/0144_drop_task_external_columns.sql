ALTER TABLE "tasks" DROP CONSTRAINT "tasks_external_unique";--> statement-breakpoint
DROP INDEX "tasks_external_provider_idx";--> statement-breakpoint
DROP INDEX "tasks_external_project_id_idx";--> statement-breakpoint
DROP INDEX "tasks_external_project_name_idx";--> statement-breakpoint
DROP INDEX "tasks_external_cycle_id_idx";--> statement-breakpoint
DROP INDEX "tasks_assignee_external_id_idx";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_provider";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_key";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_url";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "last_synced_at";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "sync_error";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_updated_at";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_project_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_project_name";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_cycle_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "external_cycle_name";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "assignee_external_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "assignee_display_name";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "assignee_avatar_url";