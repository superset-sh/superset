-- Collapse duplicate native task statuses before adding the partial unique
-- index. Keep the oldest row per organization/type and repoint tasks to it.
WITH ranked AS (
	SELECT
		id,
		FIRST_VALUE(id) OVER (
			PARTITION BY organization_id, type
			ORDER BY created_at ASC, id ASC
		) AS canonical_id,
		ROW_NUMBER() OVER (
			PARTITION BY organization_id, type
			ORDER BY created_at ASC, id ASC
		) AS rn
	FROM task_statuses
	WHERE external_provider IS NULL
)
UPDATE tasks
SET status_id = ranked.canonical_id
FROM ranked
WHERE ranked.rn > 1
  AND tasks.status_id = ranked.id;
--> statement-breakpoint
WITH ranked AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY organization_id, type
			ORDER BY created_at ASC, id ASC
		) AS rn
	FROM task_statuses
	WHERE external_provider IS NULL
)
DELETE FROM task_statuses
USING ranked
WHERE task_statuses.id = ranked.id
  AND ranked.rn > 1;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM tasks
		LEFT JOIN task_statuses ON task_statuses.id = tasks.status_id
		WHERE task_statuses.id IS NULL
	) THEN
		RAISE EXCEPTION 'task status cleanup left orphaned task status references';
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "task_statuses_org_native_type_unique" ON "task_statuses" USING btree ("organization_id","type") WHERE "task_statuses"."external_provider" IS NULL;
