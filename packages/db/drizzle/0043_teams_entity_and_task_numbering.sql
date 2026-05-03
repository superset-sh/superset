CREATE TABLE "team_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"effective_at" timestamp DEFAULT now() NOT NULL,
	"retired_at" timestamp,
	CONSTRAINT "team_keys_org_key_unique" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "team_sequences" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp,
	"external_provider" "integration_provider",
	"external_id" text,
	"external_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_org_external_unique" UNIQUE("organization_id","external_provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "team_keys" ADD CONSTRAINT "team_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_keys" ADD CONSTRAINT "team_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_sequences" ADD CONSTRAINT "team_sequences_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_keys_team_id_current_unique" ON "team_keys" USING btree ("team_id") WHERE "team_keys"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "team_keys_team_id_idx" ON "team_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_organization_id_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint

-- 99%+ of pre-migration tasks were Linear-synced under the old slug-as-identifier
-- model. Wipe them: users will reconnect via the new LinearTeamLinker UI, and
-- initial-sync re-pulls everything fresh under the new linkage model. This also
-- avoids backfilling 800k+ rows whose slug values would all collide on rewrite.
DELETE FROM "tasks" WHERE external_provider = 'linear';--> statement-breakpoint

-- Add tasks.team_id and tasks.number as NULLABLE first; backfill below; ALTER NOT NULL after.
ALTER TABLE "tasks" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- Backfill: one default team per org that has any tasks.
INSERT INTO "teams" ("id", "organization_id", "name")
SELECT gen_random_uuid(), o.id, o.name
FROM "auth"."organizations" o
WHERE EXISTS (SELECT 1 FROM "tasks" t WHERE t.organization_id = o.id);--> statement-breakpoint

-- Backfill: initial team_keys row per team. Key derived from sanitized org slug, fallback "TASK".
INSERT INTO "team_keys" ("team_id", "organization_id", "key")
SELECT
  tm.id,
  tm.organization_id,
  COALESCE(NULLIF(UPPER(REGEXP_REPLACE(o.slug, '[^a-zA-Z0-9]', '', 'g')), ''), 'TASK')
FROM "teams" tm
JOIN "auth"."organizations" o ON o.id = tm.organization_id;--> statement-breakpoint

-- Backfill: assign tasks.team_id and tasks.number, ordered by created_at within each org.
WITH numbered AS (
  SELECT
    t.id AS task_id,
    (SELECT id FROM "teams" tm WHERE tm.organization_id = t.organization_id LIMIT 1) AS team_id,
    ROW_NUMBER() OVER (PARTITION BY t.organization_id ORDER BY t.created_at, t.id) AS num
  FROM "tasks" t
)
UPDATE "tasks"
SET team_id = numbered.team_id, number = numbered.num
FROM numbered
WHERE "tasks".id = numbered.task_id;--> statement-breakpoint

-- Drop the org-slug unique constraint before rewriting slugs in bulk;
-- transient row-level updates would otherwise collide with rows not yet
-- updated (e.g. existing "SUPER-1" already in the table). Re-added below.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_org_slug_unique";--> statement-breakpoint

-- Rewrite slug to canonical `${teamKey}-${number}` for all existing rows.
UPDATE "tasks"
SET slug = tk.key || '-' || "tasks".number
FROM "team_keys" tk
WHERE tk.team_id = "tasks".team_id AND tk.retired_at IS NULL;--> statement-breakpoint

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_slug_unique" UNIQUE ("organization_id","slug");--> statement-breakpoint

-- Seed team_sequences from MAX(number) per team.
INSERT INTO "team_sequences" ("team_id", "last_number")
SELECT team_id, COALESCE(MAX(number), 0)
FROM "tasks"
WHERE team_id IS NOT NULL
GROUP BY team_id;--> statement-breakpoint

-- Lock down the columns now that they're populated.
ALTER TABLE "tasks" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint

CREATE INDEX "tasks_team_id_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_org_external_key_unique" ON "tasks" USING btree ("organization_id","external_key") WHERE "tasks"."external_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_number_unique" UNIQUE("team_id","number");
