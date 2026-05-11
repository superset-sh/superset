-- Consolidate team.slug + team.key into a single team.key identifier
-- (Linear-style). Uppercase ASCII alphanumeric, 3-8 chars, used both as URL
-- handle and as the task identifier prefix in `${key}-${number}`.

-- Add the new columns. `key` is nullable so we can backfill from slug
-- before flipping NOT NULL.
ALTER TABLE "auth"."teams" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "auth"."teams" ADD COLUMN "last_task_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."teams" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "auth"."teams" ADD COLUMN "external_provider" "integration_provider";--> statement-breakpoint
ALTER TABLE "auth"."teams" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "auth"."teams" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "auth"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Backfill key from slug: uppercase, strip non-alphanumeric, truncate to 8
-- chars. Empty or sub-3-char results fall back to "TEAM" (the org slug
-- validator permits "a-b" → "AB" which is under the 3-char app min; zero
-- prod orgs trip this today but guard anyway). On collision within an org,
-- suffix with a digit starting at "2"; base truncates to 7 chars so the
-- result stays within the 8-char cap.
UPDATE "auth"."teams" t
SET "key" = CASE
	WHEN derived.rn = 1 THEN LEFT(derived.base_key, 8)
	ELSE LEFT(derived.base_key, 7) || (derived.rn)::text
END
FROM (
	SELECT
		id,
		base_key,
		ROW_NUMBER() OVER (
			PARTITION BY organization_id, LEFT(base_key, 8)
			ORDER BY created_at, id
		) AS rn
	FROM (
		SELECT
			id,
			organization_id,
			created_at,
			CASE
				WHEN LENGTH(UPPER(REGEXP_REPLACE(slug, '[^a-zA-Z0-9]', '', 'g'))) >= 3
					THEN UPPER(REGEXP_REPLACE(slug, '[^a-zA-Z0-9]', '', 'g'))
				ELSE 'TEAM'
			END AS base_key
		FROM "auth"."teams"
	) keyed
) derived
WHERE t.id = derived.id;--> statement-breakpoint

-- Now that every row has a key, lock it down and replace slug with key.
ALTER TABLE "auth"."teams" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
DROP INDEX "auth"."teams_org_slug_unique";--> statement-breakpoint
ALTER TABLE "auth"."teams" DROP COLUMN "slug";--> statement-breakpoint

CREATE UNIQUE INDEX "teams_org_key_unique" ON "auth"."teams" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_external_unique" ON "auth"."teams" USING btree ("organization_id","external_provider","external_id");--> statement-breakpoint
CREATE INDEX "tasks_team_id_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_number_unique" UNIQUE("team_id","number");
