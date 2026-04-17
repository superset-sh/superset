DELETE FROM "v2_workspaces";--> statement-breakpoint
CREATE TYPE "public"."v2_client_type" AS ENUM('desktop', 'mobile', 'web');--> statement-breakpoint
CREATE TYPE "public"."v2_users_host_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "v2_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"machine_id" text NOT NULL,
	"type" "v2_client_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_clients_org_user_machine_unique" UNIQUE("organization_id","user_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "v2_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"machine_id" text NOT NULL,
	"name" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_hosts_org_machine_id_unique" UNIQUE("organization_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "v2_users_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"role" "v2_users_host_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_users_hosts_org_user_host_unique" UNIQUE("organization_id","user_id","host_id")
);
--> statement-breakpoint
ALTER TABLE "v2_device_presence" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "v2_devices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "v2_users_devices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "v2_device_presence" CASCADE;--> statement-breakpoint
DROP TABLE "v2_devices" CASCADE;--> statement-breakpoint
DROP TABLE "v2_users_devices" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "v2_workspaces_device_id_idx";--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD COLUMN "host_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "v2_clients" ADD CONSTRAINT "v2_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_clients" ADD CONSTRAINT "v2_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD CONSTRAINT "v2_hosts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD CONSTRAINT "v2_hosts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_users_hosts" ADD CONSTRAINT "v2_users_hosts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_users_hosts" ADD CONSTRAINT "v2_users_hosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_users_hosts" ADD CONSTRAINT "v2_users_hosts_host_id_v2_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."v2_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "v2_clients_organization_id_idx" ON "v2_clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_clients_user_id_idx" ON "v2_clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v2_hosts_organization_id_idx" ON "v2_hosts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_users_hosts_organization_id_idx" ON "v2_users_hosts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "v2_users_hosts_user_id_idx" ON "v2_users_hosts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "v2_users_hosts_host_id_idx" ON "v2_users_hosts" USING btree ("host_id");--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_host_id_v2_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."v2_hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "v2_workspaces_host_id_idx" ON "v2_workspaces" USING btree ("host_id");--> statement-breakpoint
ALTER TABLE "v2_workspaces" DROP COLUMN "device_id";--> statement-breakpoint
DROP TYPE "public"."v2_device_type";--> statement-breakpoint
DROP TYPE "public"."v2_users_device_role";