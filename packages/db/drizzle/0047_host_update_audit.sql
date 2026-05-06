CREATE TYPE "public"."host_update_outcome" AS ENUM('dispatched', 'satisfied', 'updated', 'failed');--> statement-breakpoint
CREATE TABLE "host_update_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"machine_id" text NOT NULL,
	"triggered_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_version" text,
	"previous_version" text,
	"new_version" text,
	"outcome" "host_update_outcome" DEFAULT 'dispatched' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "host_update_audit" ADD CONSTRAINT "host_update_audit_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_update_audit" ADD CONSTRAINT "host_update_audit_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_update_audit" ADD CONSTRAINT "host_update_audit_host_fk" FOREIGN KEY ("organization_id","machine_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_update_audit_machine_requested_idx" ON "host_update_audit" USING btree ("machine_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "host_update_audit_organization_id_idx" ON "host_update_audit" USING btree ("organization_id");