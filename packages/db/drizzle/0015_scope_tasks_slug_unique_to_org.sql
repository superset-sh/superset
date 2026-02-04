ALTER TABLE "tasks" DROP CONSTRAINT "tasks_slug_unique";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_slug_unique" UNIQUE("organization_id","slug");