# Database upgrades for an existing installation

Use the installation's backup and deployment procedure. Image startup does not
prepare existing data for a schema upgrade. Keep the official Drizzle SQL,
journal and snapshots intact. Follow `.agents/skills/db-migrations/SKILL.md`
for table sizes, lock order, timeouts and rehearsal.

## Task numbering at migrations 0141–0143

Migration `0141_tasks_team_number_constraints.sql` requires every task to have a
valid team and a number, and requires each `(team_id, number)` pair to be unique.
Migration `0143_task_numbers_per_team.sql` replaces
`reserve_task_numbers(organization, amount)` with
`reserve_task_numbers(organization, team, amount)`.

The order matters: the current `number-tasks.ts` uses the new three-argument
function. It cannot prepare an older database before 0143. The previous
two-argument script cannot run after 0143. Do not apply all pending migrations
and expect a later backfill to satisfy 0141.

Before migrating a database that has the task numbering columns, use a read-only
transaction to inspect the prerequisite data:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT count(*) AS missing_task_numbers
FROM public.tasks
WHERE team_id IS NULL OR number IS NULL;

SELECT count(*) AS invalid_task_teams
FROM public.tasks task
LEFT JOIN auth.teams team ON team.id = task.team_id
WHERE task.team_id IS NOT NULL
  AND (team.id IS NULL OR team.organization_id <> task.organization_id);

SELECT count(*) AS duplicate_task_numbers
FROM (
  SELECT team_id, number
  FROM public.tasks
  WHERE team_id IS NOT NULL AND number IS NOT NULL
  GROUP BY team_id, number
  HAVING count(*) > 1
) duplicate;

SELECT to_regprocedure('public.reserve_task_numbers(uuid,integer)')
         AS previous_allocator,
       to_regprocedure('public.reserve_task_numbers(uuid,uuid,integer)')
         AS current_allocator;
ROLLBACK;
```

If any count is nonzero, prepare and rehearse a data repair against the actual
schema epoch before applying 0141. Keep writers paused during the final repair
and migration. For a pre-0143 database, use the reviewed previous allocator and
matching backfill. A Linear mirror retirement may also be needed: inspect the
dry run of `packages/trpc/scripts/prune-linear-mirror.ts` and retain referenced
tasks as that script specifies. Its host-only reference limitation is documented
in the script. Inspect unexpected native tasks separately; a Linear cleanup
does not establish that every task is numbered.

Record the backup, previous journal entry, repair result and zero prerequisite
counts. Apply the intact official migrations through the deployment flow with
the configured lock and statement timeouts. Verify the journal and repeat the
data checks afterward. On the migrated schema, task backfills use the current
three-argument allocator; a null team selects the organization's default team.

Do not describe a code review or a quiet fixture as a production migration
rehearsal. Retain the previous images and configuration, but plan application
rollback against the upgraded schema rather than assuming a database downgrade
is available.
