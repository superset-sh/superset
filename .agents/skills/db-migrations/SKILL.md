---
name: db-migrations
description: Create a database migration with Drizzle on a fresh Neon branch, and check it is safe to run against production under load. Use when changing the packages/db schema, generating migrations, or reviewing one.
---

# DB migrations

A migration that is correct on a quiet database can still take production down. On 17 September
2026 migration 0119 rewrote `ingest.webhook_events` (about 540 GB with indexes) while holding
ACCESS EXCLUSIVE on the auth tables, and took the API down. Generate the migration with the steps
below, then clear the safety checklist before opening the PR.

## Generate

1. Spin up a new Neon branch and point the root `.env` files at it. `NEON_ORG_ID` and
   `NEON_PROJECT_ID` are in `.env`; the Neon `list_projects` tool needs `org_id` passed in.
2. Change the schema in `packages/db/src/schema/`.
3. Run `bunx drizzle-kit generate --name="<sample_name_snake_case>"` from `packages/db`.
4. Apply it to your dev branch only. Never apply against a shared or production database; those go
   through the deploy flow described under "What the production deploy does".

**Never hand-edit `packages/db/drizzle/`** (`.sql` files, `meta/_journal.json`, snapshots) without
explicit user confirmation. Change the schema and let `drizzle-kit generate` write the files. The
one legitimate reason to ask for that confirmation is statement order (rule 3).

## Safety checklist

- [ ] Production sizes checked for every table the migration touches (query below)
- [ ] No column type change on a large or busy table (rule 2)
- [ ] Locks are taken child table first, then the tables it references (rule 3)
- [ ] No long ACCESS EXCLUSIVE on a hot table (rule 4)
- [ ] Every statement finishes well inside 60 seconds at production size
- [ ] Rehearsed on a Neon branch of production **under load**
- [ ] If reads move to a new table or column, the data moves in the same release (rule 5)
- [ ] After changing an already-pushed migration, the PR's preview Neon branch was deleted

### Check production sizes first

Run this read-only against production, with the tables your migration touches:

```sql
begin transaction read only;
select c.oid::regclass as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       c.reltuples::bigint as approx_rows
from pg_class c
where c.oid in ('ingest.webhook_events'::regclass, 'automation_events'::regclass);
rollback;
```

Sizes on 2026-09-19, indexes included:

| Table | Size | Rows |
| --- | --- | --- |
| `ingest.webhook_events` | about 540 GB | ~199M |
| `automation_events` | about 245 GB | ~54M |

## Rules

### 1. All pending migrations run in ONE transaction

`PgDialect.migrate` in drizzle-orm 0.45.2 (`pg-core/dialect.js`) wraps the loop over every pending
migration in a single `session.transaction`.

- Splitting a change across several migration files gives **no** lock isolation.
- Every lock an early statement takes is held until the last statement of the last file finishes.

### 2. Never change a column's type on a large, busy table in a normal migration

`ALTER COLUMN ... SET DATA TYPE` between types that are not binary-coercible rewrites the whole
table and its indexes under ACCESS EXCLUSIVE. Enum to text on `ingest.webhook_events` was the
outage.

Safe shapes:

- For an enum, `ALTER TYPE ... ADD VALUE`.
- Otherwise add a new column, backfill it in batches, and swap in a later release.

### 3. Take locks in the order the application does: child first, then its parents

An insert locks its own table, then takes RowShare on each foreign-key parent. `DROP TABLE ...
CASCADE`, `DROP CONSTRAINT` and `ADD CONSTRAINT ... FOREIGN KEY` lock the referenced tables too. A
migration that locks a parent before the child deadlocks against in-flight inserts.

- The generated order of 0119 locked `auth.organizations` before `automation_events` and
  deadlocked 3 attempts out of 3 under load.
- Hand-ordering the `automation_events` statement first fixed it (4 of 4).

drizzle-kit picks statement order, so this is the one legitimate reason to hand-order a generated
file. Get explicit user confirmation first, and say why in a SQL comment above the moved statement,
because regenerating restores the bad order. See
`packages/db/drizzle/0119_plugin_oauth_clients_and_connectors.sql` for the pattern.

### 4. Know what is hot

| Table | Why it is hot |
| --- | --- |
| `auth.users`, `auth.organizations` | Read by every authenticated request. ACCESS EXCLUSIVE for more than a moment is an outage. |
| `automation_events`, `ingest.webhook_events` | Held in a transaction almost continuously by the dispatch sweep (`redispatchUndispatched`) and the retention job (`enforce-retention`). A 5 second lock wait succeeded from about 44% of start times. A migration that needs their table lock should first wait on the job's own advisory lock (the `singleFlight` key), which lets the running batch finish without queueing inserts; `0122_webhook_events_swap_to_short_retention.sql` is the pattern. |

Because of rule 1, a statement queued behind a lock on `automation_events` keeps every lock the
transaction already holds, including any on the auth tables.

### 5. Moving where data is READ from means moving the data in the same release

#7317 pointed every integration lookup at a new, empty `connections` table with no backfill. 2,393
live integrations read as disconnected until `packages/trpc/scripts/backfill-connections.ts` ran.

CI cannot catch this: unit tests mock the lookup layer
(`mock.module("@superset/trpc/connectors", ...)`). Ship the backfill with the schema change.

## Rehearse on a Neon branch of production, under load

A workspace's own Neon branch is a copy-on-write child of production at the same 0.25 to 2 CU
size. A quiet rehearsal is not enough: the first one for 0119 passed in 2.3s
and missed the deadlock entirely. pgbench found it immediately.

1. Point at a production-child branch that does not have your migration yet. The workspace `.env`
   has two `DATABASE_URL` entries and the last one is the workspace branch.
2. Write two pgbench scripts: reads on the parent tables your migration locks, and inserts into
   the child table.
3. Start pgbench with both scripts (`pgbench -n -f reads.sql -f inserts.sql -c <clients> -T
   <seconds>`).
4. While it runs, apply the migration with the production settings:
   `PGOPTIONS="-c lock_timeout=5s -c statement_timeout=60s" bun drizzle-kit migrate`.
5. Repeat a few times. One pass proves little; 0119 was judged on 3 of 3 failures and 4 of 4
   passes.

## What the production deploy does

Job `deploy-database` in `.github/workflows/deploy-production.yml`:

- A concurrency group, so two migration runs never overlap.
- `PGOPTIONS: -c lock_timeout=5s -c statement_timeout=60s`.
- Up to 8 attempts, retried only when the log contains "deadlock detected" or "lock timeout". Any
  other failure stops the deploy.
- Then `packages/db/src/verify-migrations-applied.ts`, which fails unless the newest migration
  recorded in the database equals the newest journal entry.

A migration that needs longer than 60 seconds for one statement fails by design. Do that work
online instead (rule 2).

## A reused preview branch proves nothing

`deploy-preview.yml` names the Neon branch after the PR head ref and reuses it across pushes. Once
the branch has applied a migration, later pushes that change that migration make the PR's database
check a no-op. Delete the Neon branch to force a real run.

Workflow pitfalls from the same incident (pipefail, production secrets) are in
`docs/deploy-workflows.md`.
