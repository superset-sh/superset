-- One schedule trigger per existing automation. Idempotent: safe to re-run, and
-- the cutover also repairs anything missed, so this is an optimization rather
-- than a correctness requirement.
--
-- automations.rrule/dtstart/timezone/next_run_at stay authoritative until the
-- dispatcher cuts over; they drop in a later migration.
INSERT INTO "automation_triggers" (
	"automation_id",
	"organization_id",
	"kind",
	"config",
	"enabled",
	"next_run_at",
	"created_at",
	"updated_at"
)
SELECT
	a."id",
	a."organization_id",
	'schedule',
	jsonb_build_object(
		'kind', 'schedule',
		'rrule', a."rrule",
		'dtstart', to_char(a."dtstart" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		'timezone', a."timezone"
	),
	a."enabled",
	a."next_run_at",
	a."created_at",
	a."updated_at"
FROM "automations" a
WHERE NOT EXISTS (
	SELECT 1 FROM "automation_triggers" t
	WHERE t."automation_id" = a."id" AND t."kind" = 'schedule'
);
