ALTER TABLE "organization_members" RENAME TO "organization_members_backup";--> statement-breakpoint
ALTER TABLE "organizations" RENAME TO "organizations_backup";--> statement-breakpoint
ALTER TABLE "users" RENAME TO "users_backup";--> statement-breakpoint
ALTER TABLE "organization_members_backup" DROP CONSTRAINT "organization_members_unique";--> statement-breakpoint
ALTER TABLE "organizations_backup" DROP CONSTRAINT "organizations_clerk_org_id_unique";--> statement-breakpoint
ALTER TABLE "organizations_backup" DROP CONSTRAINT "organizations_slug_unique";--> statement-breakpoint
ALTER TABLE "users_backup" DROP CONSTRAINT "users_clerk_id_unique";--> statement-breakpoint
ALTER TABLE "users_backup" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "integration_connections" DROP CONSTRAINT "integration_connections_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "integration_connections" DROP CONSTRAINT "integration_connections_connected_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "organization_members_backup" DROP CONSTRAINT "organization_members_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "organization_members_backup" DROP CONSTRAINT "organization_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "repositories" DROP CONSTRAINT "repositories_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_creator_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "organization_members_organization_id_idx";--> statement-breakpoint
DROP INDEX "organization_members_user_id_idx";--> statement-breakpoint
DROP INDEX "organizations_slug_idx";--> statement-breakpoint
DROP INDEX "organizations_clerk_org_id_idx";--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
DROP INDEX "users_clerk_id_idx";--> statement-breakpoint
DROP INDEX "users_deleted_at_idx";--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_backup_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_connected_by_user_id_users_backup_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members_backup" ADD CONSTRAINT "organization_members_backup_organization_id_organizations_backup_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members_backup" ADD CONSTRAINT "organization_members_backup_user_id_users_backup_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_organization_id_organizations_backup_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_backup_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_backup_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users_backup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_users_backup_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_members_backup_organization_id_idx" ON "organization_members_backup" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_members_backup_user_id_idx" ON "organization_members_backup" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organizations_backup_slug_idx" ON "organizations_backup" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_backup_clerk_org_id_idx" ON "organizations_backup" USING btree ("clerk_org_id");--> statement-breakpoint
CREATE INDEX "users_backup_email_idx" ON "users_backup" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_backup_clerk_id_idx" ON "users_backup" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "users_backup_deleted_at_idx" ON "users_backup" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "organization_members_backup" ADD CONSTRAINT "organization_members_backup_unique" UNIQUE("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "organizations_backup" ADD CONSTRAINT "organizations_backup_clerk_org_id_unique" UNIQUE("clerk_org_id");--> statement-breakpoint
ALTER TABLE "organizations_backup" ADD CONSTRAINT "organizations_backup_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "users_backup" ADD CONSTRAINT "users_backup_clerk_id_unique" UNIQUE("clerk_id");--> statement-breakpoint
ALTER TABLE "users_backup" ADD CONSTRAINT "users_backup_email_unique" UNIQUE("email");