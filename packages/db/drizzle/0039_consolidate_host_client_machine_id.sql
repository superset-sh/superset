-- session_hosts is dead (no writes anywhere); drop with CASCADE.
ALTER TABLE "session_hosts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "session_hosts" CASCADE;--> statement-breakpoint

-- Delete orphan FK rows in NOT NULL columns BEFORE the type change.
-- Once host_id is text, we can't easily distinguish orphans from valid uuids,
-- and the post-translation rows would still have stringified-UUID values that
-- can't satisfy the new composite FK to v2_hosts(organization_id, machine_id).
DELETE FROM "v2_users_hosts" WHERE "host_id" NOT IN (SELECT "id" FROM "v2_hosts");--> statement-breakpoint
DELETE FROM "v2_workspaces" WHERE "host_id" NOT IN (SELECT "id" FROM "v2_hosts");--> statement-breakpoint

-- Drop old unique constraints (replaced by composite PKs below).
ALTER TABLE "v2_clients" DROP CONSTRAINT "v2_clients_org_user_machine_unique";--> statement-breakpoint
ALTER TABLE "v2_hosts" DROP CONSTRAINT "v2_hosts_org_machine_id_unique";--> statement-breakpoint
ALTER TABLE "v2_users_hosts" DROP CONSTRAINT "v2_users_hosts_org_user_host_unique";--> statement-breakpoint

-- Drop old FK constraints (column type change requires no incoming FK).
ALTER TABLE "automation_runs" DROP CONSTRAINT "automation_runs_host_id_v2_hosts_id_fk";--> statement-breakpoint
ALTER TABLE "automations" DROP CONSTRAINT "automations_target_host_id_v2_hosts_id_fk";--> statement-breakpoint
ALTER TABLE "v2_users_hosts" DROP CONSTRAINT "v2_users_hosts_host_id_v2_hosts_id_fk";--> statement-breakpoint
ALTER TABLE "v2_workspaces" DROP CONSTRAINT "v2_workspaces_host_id_v2_hosts_id_fk";--> statement-breakpoint

-- Drop the partial unique index on v2_workspaces (project_id, host_id) WHERE
-- type='main' added by 0038. Recreated below after host_id becomes text.
DROP INDEX "v2_workspaces_one_main_per_host";--> statement-breakpoint

-- Cast FK columns uuid -> text. PostgreSQL has no implicit uuid->text cast,
-- so USING is required. We stringify the uuid here and translate to
-- machine_id in the UPDATEs below.
ALTER TABLE "automation_runs" ALTER COLUMN "host_id" SET DATA TYPE text USING "host_id"::text;--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "target_host_id" SET DATA TYPE text USING "target_host_id"::text;--> statement-breakpoint
ALTER TABLE "v2_users_hosts" ALTER COLUMN "host_id" SET DATA TYPE text USING "host_id"::text;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ALTER COLUMN "host_id" SET DATA TYPE text USING "host_id"::text;--> statement-breakpoint

-- Translate stringified UUIDs to machine_ids via UPDATE FROM v2_hosts.
-- v2_hosts.id still exists at this point (dropped further down); cast to text
-- to compare against the now-text host_id columns.
UPDATE "automation_runs" SET "host_id" = h."machine_id" FROM "v2_hosts" h WHERE "automation_runs"."host_id" = h."id"::text;--> statement-breakpoint
UPDATE "automations" SET "target_host_id" = h."machine_id" FROM "v2_hosts" h WHERE "automations"."target_host_id" = h."id"::text;--> statement-breakpoint
UPDATE "v2_users_hosts" SET "host_id" = h."machine_id" FROM "v2_hosts" h WHERE "v2_users_hosts"."host_id" = h."id"::text;--> statement-breakpoint
UPDATE "v2_workspaces" SET "host_id" = h."machine_id" FROM "v2_hosts" h WHERE "v2_workspaces"."host_id" = h."id"::text;--> statement-breakpoint

-- For nullable columns, NULL out any rows that don't have a matching
-- (organization_id, machine_id) pair in v2_hosts. NOT EXISTS with the
-- composite check rather than a global machine_id IN (...) so the migration
-- doesn't rely on an implicit "automation_runs.organization_id always matches
-- the host's organization_id" invariant — if any cross-org row exists, the
-- translation step above would have written the wrong-org's machine_id and
-- the new composite FK would reject it.
UPDATE "automation_runs" SET "host_id" = NULL WHERE "host_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "v2_hosts" h WHERE h."machine_id" = "automation_runs"."host_id" AND h."organization_id" = "automation_runs"."organization_id");--> statement-breakpoint
UPDATE "automations" SET "target_host_id" = NULL WHERE "target_host_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "v2_hosts" h WHERE h."machine_id" = "automations"."target_host_id" AND h."organization_id" = "automations"."organization_id");--> statement-breakpoint

-- Drop old uuid `id` columns. Implicitly drops the old PRIMARY KEY constraints,
-- freeing the tables to receive composite PKs below.
ALTER TABLE "v2_clients" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "v2_hosts" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "v2_users_hosts" DROP COLUMN "id";--> statement-breakpoint

-- Add new composite PRIMARY KEYs.
ALTER TABLE "v2_clients" ADD CONSTRAINT "v2_clients_organization_id_user_id_machine_id_pk" PRIMARY KEY("organization_id","user_id","machine_id");--> statement-breakpoint
ALTER TABLE "v2_hosts" ADD CONSTRAINT "v2_hosts_organization_id_machine_id_pk" PRIMARY KEY("organization_id","machine_id");--> statement-breakpoint
ALTER TABLE "v2_users_hosts" ADD CONSTRAINT "v2_users_hosts_organization_id_user_id_host_id_pk" PRIMARY KEY("organization_id","user_id","host_id");--> statement-breakpoint

-- Add new composite FOREIGN KEYs (now that v2_hosts has its composite PK).
ALTER TABLE "v2_users_hosts" ADD CONSTRAINT "v2_users_hosts_host_fk" FOREIGN KEY ("organization_id","host_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "v2_workspaces" ADD CONSTRAINT "v2_workspaces_host_fk" FOREIGN KEY ("organization_id","host_id") REFERENCES "public"."v2_hosts"("organization_id","machine_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Recreate the partial unique index on v2_workspaces against the now-text host_id.
CREATE UNIQUE INDEX "v2_workspaces_one_main_per_host" ON "v2_workspaces" USING btree ("project_id","host_id") WHERE "v2_workspaces"."type" = 'main';
