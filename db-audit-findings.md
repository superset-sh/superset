# Production Postgres schema audit — 2026-08-24

**Report only. Nothing here was fixed, and nothing here implies a fix should land.**
Every statement run against production was a `SELECT` or a plain `EXPLAIN`, with
`statement_timeout='60s'` and `default_transaction_read_only=on` on every session.

Target: Neon project `frosty-lab-32416990`, branch `br-billowing-dream-af839yib`
(`production`, `Default = true`, confirmed via `neonctl branches list`).
PostgreSQL 18.4. Total database size **617 GB**.

## This run establishes the baseline

`db-audit-findings.md` does not exist on `main` and has no git history
(`git log --all --oneline -- db-audit-findings.md` → empty). This is the first
run, so there is **no "Changes since last report" section** and no week-over-week
comparison. Every number below is a first observation. Next week's run can diff
against it — provided the stats window has not reset in between (see below).

Because there is no baseline, every table, column, index and constraint is
technically "new". Rather than list the whole schema under that heading, the
**[New since last report](#new-since-last-report)** section reviews the objects
that landed in the last eight days, which are the ones that have had the least
review time.

## Stats window — read this before trusting any counter

```sql
select now(), pg_postmaster_start_time(), now() - pg_postmaster_start_time();
select stats_reset from pg_stat_statements_info;
select stats_reset from pg_stat_database where datname = current_database();
```

| Source | Reset at | Window |
|---|---|---|
| `pg_postmaster_start_time()` | 2026-07-24 11:00:20+00 | **31 days 5 h** |
| `pg_stat_statements_info.stats_reset` | 2026-07-24 11:00:20+00 | **31 days 5 h** |
| `pg_stat_database.stats_reset` | `NULL` | n/a |

The window is **31 days**, comfortably longer than the ~10-day floor, so
`idx_scan = 0` findings are reported at full confidence. Read every such claim as
**"unused for 31 days"**, never "unused ever".

Two exceptions where `idx_scan = 0` is *expected* and is **not** reported as a
finding: the `pages` / `page_versions` / `page_comments` / `page_comment_threads` /
`workspace_pages` tables (created 2026-08-23, no traffic yet) and the
pre-created future `ingest.webhook_payloads_2026*` partitions (empty by design).

One nuance that matters for anything below marked "unused": a **unique** index's
constraint enforcement does not increment `idx_scan`. A unique index at 0 scans is
not evidence it is droppable. Only non-unique indexes are called out as unused.

## Ranked summary

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | 419 GB of dead TOAST on `ingest.webhook_events` from `DROP COLUMN payload` — 68% of the entire database | **Urgent** | [§1](#1) |
| 2 | Retention job runs at ~24% of its designed rate; the headroom comment overstates capacity ~4× | **Urgent** | [§2](#2) |
| 3 | `automation_events` has no retention and a hard deadline of ~2026-09-14 | **Urgent** | [§3](#3) |
| 4 | 36 foreign keys with no supporting index; one is load-bearing for #3 | **Moderate** | [§4](#4) |
| 5 | 1.2 GB of genuinely unused indexes, incl. a 1 GB index no code references | **Moderate** | [§5](#5) |
| 6 | `task_statuses.type` holds two values its schema comment forbids | **Moderate** | [§6](#6) |
| 7 | Deleting one `auth.users` row CASCADEs into 20 tables incl. 5.5M-row `tasks` | **Moderate** | [§7](#7) |
| 8 | ~120 MB of redundant prefix indexes | **Cosmetic** | [§8](#8) |
| 9 | `github_pull_requests.state` documents a value that never occurs | **Cosmetic** | [§9](#9) |
| 10 | 3 CHECK constraints in the whole database; `diag` table with no PK | **Cosmetic** | [§10](#10) |
| — | Partition key vs. dedup-index tension | **Deliberate — correct** | [§deliberate](#deliberate-and-correct-leave-alone) |
| — | Sequences near exhaustion / int4 PKs | **Nothing to report** | [§11](#11) |

---

<a name="1"></a>
## 1. 419 GB of dead TOAST on `ingest.webhook_events` — Urgent

`ingest.webhook_events` is **533 GB total** across 105M rows, of which the TOAST
relation alone is **419 GB heap / 424 GB total**. The whole database is 617 GB.

```sql
select n.nspname||'.'||c.relname as tbl,
       to_char(c.reltuples,'FM999,999,999') as est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       pg_size_pretty(pg_relation_size(c.oid))       as heap,
       pg_size_pretty(pg_indexes_size(c.oid))        as idx,
       pg_size_pretty(coalesce(pg_total_relation_size(c.reltoastrelid),0)) as toast
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema','pg_toast')
order by pg_total_relation_size(c.oid) desc limit 5;
```

| tbl | est_rows | total | heap | idx | toast |
|---|---|---|---|---|---|
| `ingest.webhook_events` | 104,910,336 | **533 GB** | 73 GB | 35 GB | **424 GB** |
| `public.automation_events` | 6,177,374 | 54 GB | 3542 MB | 1782 MB | 48 GB |
| `public.tasks` | 5,548,375 | 11 GB | 5773 MB | 2470 MB | 3200 MB |
| `ingest.webhook_payloads_20260824` | 1,486,779 | 9228 MB | 815 MB | 81 MB | 8331 MB |
| `public.github_pull_requests` | 1,659,586 | 1508 MB | 1109 MB | 396 MB | 2376 kB |

**The TOAST is not live data.** Migration `0090_webhook_events_drop_payload.sql`
is a single statement:

```sql
ALTER TABLE "ingest"."webhook_events" DROP COLUMN "payload";
```

`DROP COLUMN` is a catalog-only operation. It does not rewrite the table and does
not remove the column's data from existing row versions — the TOAST rows survive
until each owning heap tuple is itself deleted and vacuumed. The catalog still
carries the tombstone:

```sql
select attnum, attname, attisdropped
from pg_attribute where attrelid='ingest.webhook_events'::regclass and attnum>0;
--  5 | ........pg.dropped.5........ | t
```

The only remaining toastable column is `error`. Measured, not assumed:

```sql
with s as (select * from ingest.webhook_events tablesample system (0.05))
select count(*) as sampled,
       count(*) filter (where error is not null) as with_error,
       count(*) filter (where length(error) > 2000) as error_gt_2k,
       pg_size_pretty((sum(length(coalesce(error,'')))::numeric
                       * (104975592.0/nullif(count(*),0)))::bigint) as est_total_error_bytes
from s;
```

| sampled | with_error | error_gt_2k | est_total_error_bytes |
|---|---|---|---|
| 52,243 | 120 | 2 | **42 MB** |

**~42 MB of live toastable data against a 419 GB TOAST relation.** Essentially
the entire 419 GB is the dropped `payload` column. That is **68% of the 617 GB
database** and, on Neon, 68% of the storage bill.

### How it actually gets reclaimed — and why it is slower than it looks

This finding and [§2](#2) are the same problem viewed from two sides. Those TOAST
rows become dead and vacuumable only when their owning heap tuple is deleted —
which is exactly what the retention job in §2 does. So the drain *is* the storage
fix. Two caveats a reader should not miss:

- Only rows written **before** `0090` landed (2026-08-22) carry a payload. The
  current 30-day retention window still contains ~28 days of such rows. Full
  TOAST relief therefore cannot arrive before **~2026-09-21**, and only if the
  backlog in §2 has drained by then.
- Vacuum returns freed TOAST pages to the relation's free space, but only
  truncates trailing empty pages. Returning 419 GB to Neon's billed storage in
  full needs a rewrite (`VACUUM FULL` / `pg_repack`), which takes an
  `ACCESS EXCLUSIVE` lock on a table taking ~1.7M inserts/day.

Autovacuum is not currently in a position to help quickly: at 105M live rows the
default `autovacuum_vacuum_scale_factor = 0.2` puts the dead-tuple trigger near
21M, and the table is sitting at 3.4M.

```sql
select relname, n_live_tup, n_dead_tup, n_tup_del, last_autovacuum, autovacuum_count
from pg_stat_all_tables where schemaname='ingest' and relname='webhook_events';
```

| relname | n_live_tup | n_dead_tup | n_tup_del | last_autovacuum | autovacuum_count |
|---|---|---|---|---|---|
| webhook_events | 105,011,713 | 3,466,156 | 6,289,569 | 2026-08-23 21:57:30+00 | 48 |

---

<a name="2"></a>
## 2. The retention job runs at ~24% of its designed rate — Urgent

`apps/api/src/app/api/ingest/jobs/enforce-retention/route.ts` bounds
`ingest.webhook_events` to 30 days. It landed in `cb6df622f` on **2026-08-22
13:31 PDT**, 43.5 hours before this audit. It works. It is simply much slower
than its own comment believes, and the gap is not small.

### The backlog

```sql
explain select 1 from ingest.webhook_events where received_at < now() - interval '30 days';
--  Index Only Scan using webhook_events_received_at_idx  (cost=0.57..3976947.22 rows=65447902 width=4)
```

**~65.4M rows** — 62% of the table — are already past the retention horizon.
(Planner estimate from a plain `EXPLAIN`; a filtered `count(*)` on this table
exceeds the 60 s timeout, as does `min(received_at)`.) A bounded probe places the
oldest surviving row between **2026-04-15 and 2026-06-01**, roughly four months
back against a 30-day policy:

```sql
select 1 from ingest.webhook_events where received_at < timestamp '2026-04-15' limit 1;  -- 0 rows
select 1 from ingest.webhook_events where received_at < timestamp '2026-06-01' limit 1;  -- 1 row
```

### Why it is slow

```sql
select calls, rows as rows_deleted,
       round(mean_exec_time::numeric) as mean_ms_per_batch,
       round((max_exec_time/1000.0)::numeric) as max_s,
       round((total_exec_time/1000.0/3600.0)::numeric,2) as total_hours_db_time,
       round((rows::numeric/nullif(calls,0)),0) as rows_per_call
from pg_stat_statements where query ilike '%ctid%' and query ilike '%webhook_events%';
```

| calls | rows_deleted | mean_ms_per_batch | max_s | total_hours_db_time | rows_per_call |
|---|---|---|---|---|---|
| 1,226 | 6,130,000 | **34,915** | **582** | 11.89 | **5,000** |

Three things fall out of that row:

1. **`rows_per_call` is exactly 5,000 — on every one of 1,226 calls.**
   `deleteAgedRows` returns `more: false` only when `rows < BATCH_SIZE`. That has
   never once happened. The job has never run out of work.
2. **A 5,000-row batch averages 35 seconds** against a `TIME_BUDGET_MS` of
   **20,000**. The budget is checked *before* each batch, so a run gets one batch
   started for free and then exits. Measured: `1226 calls ÷ (43.5 h ÷ 5 min)` =
   **2.35 batches per run** ≈ 11,750 rows, against the `MAX_ROWS_PER_TABLE`
   ceiling of 50,000. `MAX_ROWS_PER_TABLE` is never the binding constraint;
   `TIME_BUDGET_MS` is.
3. **The worst batch took 582 seconds.** That is far past any normal serverless
   function timeout, so some runs are being killed mid-flight rather than ending
   "by choice rather than by kill" as the comment intends.

The 5-minute cadence is not in the repo — there is no `vercel.json` cron and no
QStash schedule config under version control, so it is configured out-of-band.
It is inferred here from the call count, which lands at 5.2 min/run.

### The arithmetic the code comment gets wrong

Lines 22–27 of the route claim:

> Against a 5-minute schedule it is ~14M rows/day, comfortably ahead of the
> ~1.2M/day these tables take on.

Measured over the job's 43.5-hour life:

| Quantity | Source | Rate |
|---|---|---|
| Rows deleted | `pg_stat_statements`, 6,130,000 rows | **3.38M/day** |
| Rows inserted | `pg_stat_statements`, 3,017,717 calls on the current insert path | **1.66M/day** |
| **Net drain** | | **1.72M/day** |

So the real capacity is **3.4M rows/day, not 14M** — a ~4× overstatement, because
the estimate assumed 50,000 rows/run when the time budget only permits ~11,750.
Intake is also ~1.4× the assumed 1.2M/day.

At a net 1.72M/day, the 65.4M backlog clears in **~38 days — around 2026-10-01**.

That is the *optimistic* reading, and it is load-bearing on intake staying flat.
Intake is not flat: a like-for-like hour measured 35,162 rows on 08-23 and
**110,060** on 08-24 — extrapolating to ~2.6M/day at the recent peak.

```sql
select count(*) from ingest.webhook_events
 where received_at >= timestamp '2026-08-24 12:00:00'
   and received_at <  timestamp '2026-08-24 13:00:00';   -- 110060
```

**If sustained intake reaches ~3.4M/day, net drain hits zero and the backlog
never clears.** There is also a self-slowing feedback loop: each batch is
`ORDER BY received_at LIMIT 5000` off the left edge of
`webhook_events_received_at_idx`, and every prior delete leaves dead index entries
in exactly that prefix for the next batch to walk. The 35 s mean and 582 s max are
that loop already showing. It is also why `min(received_at)` times out while
`max(received_at)` returns instantly.

**Not fixed here, and no fix implied.** Flagging loudly because the safety margin
is roughly 4× thinner than the code comment states, and both §1's 419 GB and the
storage bill are downstream of this job finishing.

---

<a name="3"></a>
## 3. `automation_events` — no retention, hard deadline ~2026-09-14 — Urgent

54 GB across ~6.5M rows at nine days old, and growing ~600k–1.3M rows/day.

```sql
with s as (select * from public.automation_events tablesample system (0.5))
select received_at::date as day, count(*) as sampled,
       to_char(round(count(*) * 200.0),'FM999,999,999') as est_rows,
       count(*) filter (where payload is null) as pruned_in_sample
from s group by 1 order by 1;
```

| day | est_rows | pruned_in_sample |
|---|---|---|
| 2026-08-16 | 31,400 | 157 / 157 |
| 2026-08-17 | 458,800 | 1,273 / 2,294 |
| 2026-08-18 | 660,400 | 0 |
| 2026-08-19 | 794,200 | 0 |
| 2026-08-20 | 1,318,800 | 0 |
| 2026-08-21 | 1,276,000 | 0 |
| 2026-08-22 | 599,000 | 0 |
| 2026-08-23 | 609,600 | 0 |
| 2026-08-24 | 908,200 (partial) | 0 |

The **payload** pruner works correctly — the 7-day boundary lands exactly on
2026-08-17, and everything older is nulled. That part is fine and is listed under
[deliberate](#deliberate-and-correct-leave-alone).

What does not exist is **row** retention. `enforce-retention/route.ts` carries
exactly one target, and the comment at lines 39–47 explains the omission:

> `automation_events` is deliberately absent. Bounding it needs two index builds
> that take write locks on live ingest tables […] the table was created on
> 2026-08-15, so no row reaches thirty days until mid-September, and the
> us-east-1 restore rebuilds both tables before then with those indexes created
> on the way in, for free.

That reasoning checks out, and the two missing indexes are real:

```sql
select s.relname, s.indexrelname, pg_get_indexdef(s.indexrelid)
from pg_stat_all_indexes s
where s.schemaname='public' and s.relname in ('automation_events','automation_runs');
```

- `automation_events` has **no plain `received_at` index**. The two that touch it
  are partial — `automation_events_prunable_idx … WHERE payload IS NOT NULL` and
  `automation_events_undispatched_idx … WHERE dispatched_at IS NULL`. Neither
  covers "all rows older than 30 days", because by then payload is already NULL.
- `automation_runs.event_id` has no usable index either. The closest,
  `automation_runs_event_dedup_idx`, is `(trigger_id, event_id) WHERE event_id IS
  NOT NULL` — `event_id` is the *second* column, so it cannot serve the
  `ON DELETE SET NULL` lookup the FK needs.

Confirmed: the oldest row is 2026-08-16 and only ~653 rows are past 30 days today
(`explain select 1 from public.automation_events where received_at < now() -
interval '30 days'` → `rows=653`). So nothing is broken *yet*.

**The risk is schedule, not code.** The plan is sound but depends entirely on a
us-east-1 restore happening before ~2026-09-14. That restore is not referenced
anywhere in this repo, so this audit cannot confirm it is scheduled. If it slips,
this table starts growing unbounded at ~800k rows/day with the two enabling
indexes still unbuilt — and building them then means taking write locks on a live
ingest table under time pressure, which is the exact situation the current plan
was designed to avoid.

---

<a name="4"></a>
## 4. Foreign keys with no supporting index — Moderate

36 FKs have no index whose leading columns match the constraint.

```sql
select n.nspname||'.'||c.relname as child_table, k.conname,
       (select string_agg(a.attname,',' order by ord)
          from unnest(k.conkey) with ordinality u(att,ord)
          join pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.att) as fk_cols,
       pn.nspname||'.'||pc.relname as parent_table,
       to_char(c.reltuples,'FM999,999,999') as child_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as child_size,
       case k.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint k
join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
join pg_class pc on pc.oid=k.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
where k.contype='f' and n.nspname in ('public','auth','ingest')
  and not exists (
    select 1 from pg_index i
    where i.indrelid=k.conrelid
      and (i.indkey::int2[])[0:array_length(k.conkey,1)-1] @> k.conkey
      and k.conkey @> (i.indkey::int2[])[0:array_length(k.conkey,1)-1])
order by pg_total_relation_size(c.oid) desc;
```

Most are small enough that a seq scan on parent delete is irrelevant. The ones
that carry real blast radius:

| child_table | fk_cols | parent | child_rows | on_delete | Why it matters |
|---|---|---|---|---|---|
| `public.automation_runs` | `event_id` | `automation_events` | 58,574 | SET NULL | **Blocks §3.** Every `automation_events` row deleted by a future retention job seq-scans `automation_runs`. O(n×m) on a bulk drain. |
| `public.v2_workspaces` | `organization_id,host_id` | `v2_hosts` | 104,769 | CASCADE | Deleting a host scans 42 MB. |
| `public.v2_workspaces` | `created_by_user_id` | `auth.users` | 104,769 | SET NULL | On the user-delete path (§7). |
| `public.automation_runs` | `organization_id` | `auth.organizations` | 58,574 | CASCADE | Org delete scans. |
| `public.automation_runs` | `automation_id,organization_id` | `automations` | 58,574 | CASCADE | |
| `public.chat_sessions` | `workspace_id` | `workspaces` | 72,490 | SET NULL | |
| `public.v2_projects` | `github_repository_id` | `github_repositories` | 56,547 | SET NULL | |

The remaining 29 are on tables under 10 MB (`auth.oauth_*`, `auth.invitations`,
`public.page_*`, `public.cloud_workspaces`, …) where the scan cost is noise.

`automation_runs.event_id` is the one worth tracking, because §3's deadline
depends on it existing.

---

<a name="5"></a>
## 5. Unused indexes — Moderate

```sql
select s.schemaname||'.'||s.relname as tbl, s.indexrelname as idx, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as size,
       i.indisunique as uniq
from pg_stat_all_indexes s join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname in ('public','auth','ingest') and s.idx_scan = 0
order by pg_relation_size(s.indexrelid) desc;
```

Non-unique, non-new, genuinely unused across the full 31-day window:

| Index | Table | Size | idx_scan (31 d) |
|---|---|---|---|
| `tasks_assignee_external_id_idx` | `public.tasks` | 76 MB | 0 |
| `tasks_external_project_name_idx` | `public.tasks` | 61 MB | 0 |
| `github_pull_requests_state_idx` | `public.github_pull_requests` | 23 MB | 0 |
| `apikeys_metadata_trgm_idx` | `auth.apikeys` | 504 kB | 0 |
| `automation_runs_inflight_resource_idx` | `public.automation_runs` | 144 kB | 0 |
| `automation_triggers_dispatcher_idx` | `public.automation_triggers` | 120 kB | 0 |
| `apikeys_configId_idx` | `auth.apikeys` | 32 kB | 0 |

Plus one that a bare `idx_scan = 0` filter misses, because 12 scans in 31 days is
not zero but is not use either:

| Index | Table | Size | idx_scan (31 d) |
|---|---|---|---|
| **`webhook_events_provider_status_idx`** | `ingest.webhook_events` | **1,082 MB** | **12** |

That last one is the largest single piece of dead weight. Cross-referenced: the
only occurrence of it anywhere in the repo is its own declaration at
`packages/db/src/schema/ingest.ts:44`. No query filters on `(provider, status)`.
For contrast, its neighbours on the same table:

```sql
select s.indexrelname, pg_size_pretty(pg_relation_size(s.indexrelid)) sz, s.idx_scan
from pg_stat_all_indexes s where s.schemaname='ingest' and s.relname='webhook_events'
order by pg_relation_size(s.indexrelid) desc;
```

| indexrelname | size | idx_scan |
|---|---|---|
| `webhook_events_provider_event_id_idx` | 26 GB | 109,420,619 |
| `webhook_events_pkey` | 4,501 MB | 128,756,549 |
| `webhook_events_received_at_idx` | 3,860 MB | 6,601 |
| `webhook_events_provider_status_idx` | **1,082 MB** | **12** |

`github_pull_requests_state_idx` has a code explanation: the only query filtering
on `state` (`packages/trpc/src/router/integration/github/github.ts:151`) always
pairs it with `repositoryId IN (…)`, so the planner uses the repository index
instead. On a column with two distinct values, ~95% of them `closed`, a standalone
index was never going to be selective enough to win.

---

<a name="6"></a>
## 6. `task_statuses.type` holds values its schema forbids — Moderate

`packages/db/src/schema/schema.ts:90` declares the column and documents its domain:

```ts
type: text().notNull(), // "backlog" | "unstarted" | "started" | "completed" | "canceled"
```

Five values. Production holds seven:

```sql
select type, count(*) from public.task_statuses group by 1 order by 2 desc;
```

| type | count |
|---|---|
| started | 92,685 |
| canceled | 75,370 |
| backlog | 72,152 |
| unstarted | 71,967 |
| completed | 71,836 |
| **duplicate** | **8,923** |
| **triage** | **6,825** |

**15,748 rows (4.0%) hold a value the comment says cannot exist.** `duplicate` and
`triage` are Linear `WorkflowState.type` values arriving through the Linear sync
and being stored verbatim. There is no CHECK constraint and no pgEnum on the
column, so nothing rejected them.

Note this column is *not* described by `taskStatusEnumValues` in
`packages/db/src/schema/enums.ts:4` (`backlog | todo | planning | working |
needs-feedback | ready-to-merge | completed | canceled`) — that union describes
Superset's own task status, a different concept. The mismatch here is between the
column and its own inline comment, and any TypeScript that narrows this column to
the five documented values will mis-handle 4% of rows.

---

<a name="7"></a>
## 7. `auth.users` deletion CASCADEs into 20 tables — Moderate

```sql
select case k.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' end as on_delete,
       pn.nspname||'.'||pc.relname as parent, n.nspname||'.'||c.relname as child, k.conname
from pg_constraint k
join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
join pg_class pc on pc.oid=k.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
where k.contype='f' and n.nspname in ('public','auth','ingest')
  and pc.relname in ('users','organizations','pages')
order by parent, on_delete, child;
```

Deleting one `auth.users` row CASCADEs to **20** tables and SET NULLs 11 more.
The CASCADE targets include organization-wide data, not just that user's own:

- `public.tasks` via `tasks_creator_id_users_id_fk` — **5.5M rows / 11 GB**.
  Every task the user ever created, across the whole organization, is deleted.
- `public.automations` via `automations_owner_user_id_users_id_fk`, which then
  CASCADEs a second hop into `automation_runs` and `automation_triggers`.
- `public.integration_connections`, `public.github_installations`,
  `public.chat_sessions`, `public.chat_attachments` — org-level infrastructure
  attached to whoever happened to connect it.

Following the multi-hop chain to its end: `users → automations → automation_runs`
is the deepest, at two hops.

**This appears to be mitigated, and the mitigation is the reason it is Moderate
rather than Urgent.** Commit `5f5eec59c` is titled *"fix(trpc,db): tombstone
deleted users instead of cascading their org's data"*, and a grep for
`.delete(users)` across `apps/` and `packages/` returns no hits — no application
code path deletes a user row. The CASCADEs are therefore latent rather than live.

What keeps it on the list: the constraints are still in place, so any manual
`DELETE FROM auth.users` run against production — a support script, a GDPR
erasure, a console session — silently destroys organization-wide data with no
confirmation step. The tombstone is a convention in application code, not an
invariant the database enforces.

`auth.organizations` CASCADEs to 12 tables (`tasks`, `v2_workspaces`, `pages`,
`projects`, `subscriptions`, …). That one reads as intended — deleting an
organization *should* remove its data — and is not flagged.

---

<a name="8"></a>
## 8. Redundant prefix indexes — Cosmetic

13 non-unique indexes whose column list is a strict leading prefix of another
index on the same table. Postgres can serve any query on the narrower one from the
wider one, so these are duplicated maintenance cost on every write.

```sql
with ix as (
  select i.indrelid, i.indexrelid, c2.relname as idxname, n.nspname||'.'||c.relname as tbl,
         i.indisunique,
         (select string_agg(a.attname,',' order by ord)
            from unnest(i.indkey::int2[]) with ordinality u(att,ord)
            join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.att) as cols,
         pg_relation_size(i.indexrelid) as sz
  from pg_index i
  join pg_class c on c.oid=i.indrelid join pg_class c2 on c2.oid=i.indexrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','auth','ingest') and i.indpred is null)
select a.tbl, a.idxname as redundant_idx, pg_size_pretty(a.sz) as size,
       b.idxname as covered_by, b.cols as covering_cols
from ix a join ix b on a.indrelid=b.indrelid and a.indexrelid<>b.indexrelid
 and b.cols like a.cols||',%' and not a.indisunique
order by a.sz desc;
```

| Table | Redundant index | Size | Covered by | idx_scan (31 d) |
|---|---|---|---|---|
| `public.tasks` | `tasks_organization_id_idx` | 83 MB | `tasks_external_unique (organization_id, external_provider, external_id)` | 1,019,458 |
| `public.github_pull_requests` | `github_pull_requests_repository_id_idx` | 23 MB | `…_repo_pr_unique (repository_id, pr_number)` | 196,202 |
| `public.task_statuses` | `task_statuses_organization_id_idx` | 6,160 kB | `…_org_external_unique` | 282,029 |
| `auth.team_members` | `team_members_team_id_idx` | 2,240 kB | `team_members_team_user_unique` | 85 |
| `auth.teams` | `teams_organization_id_idx` | 2,232 kB | `teams_org_slug_unique` | 243,149 |
| `public.v2_projects` | `v2_projects_organization_id_idx` | 1,024 kB | `v2_projects_org_slug_unique` | 817,073 |
| `public.v2_hosts` | `v2_hosts_organization_id_idx` | 592 kB | `v2_hosts_organization_id_machine_id_pk` | 5,693 |
| `public.v2_users_hosts` | `v2_users_hosts_organization_id_idx` | 584 kB | `…_organization_id_user_id_host_id_pk` | 19,922 |
| `public.user_identities` | `user_identities_org_provider_idx` | 136 kB | `user_identities_account_unique` | 186 |
| `public.projects` | `projects_organization_id_idx` | 56 kB | `projects_org_slug_unique` | 218,540 |
| `public.page_versions` | `page_versions_page_id_idx` | 8,192 B | `page_versions_page_id_version_unique` | 0 (new) |
| `public.v2_clients` | `v2_clients_organization_id_idx` | 8,192 B | `…_organization_id_user_id_machine_id_pk` | 34,034 |

~120 MB total. **Deliberately ranked cosmetic:** unlike §5 these are heavily
scanned, so they are doing real work — just work the wider index could also do,
more slowly per lookup because it is a bigger tree. This is a genuine trade, not
free space. `team_members_team_id_idx` (85 scans) and
`user_identities_org_provider_idx` (186 scans) are the two where the trade looks
clearly one-sided.

---

<a name="9"></a>
## 9. `github_pull_requests.state` documents an impossible value — Cosmetic

`packages/db/src/schema/github.ts:140`:

```ts
state: text().notNull(), // "open" | "closed" | "merged"
```

`merged` has never occurred. This is an exact count off the `state` index, not a
sample:

```sql
select count(*) from public.github_pull_requests where state = 'merged';   -- 0
```

Across 1.66M rows the column holds only `open` and `closed` (5% sample: 77,497
closed / 4,117 open).

This is a documentation defect, not a bug. GitHub's REST API sets
`pull_request.state` to `open` or `closed` only — a merged PR is `closed` with
`merged_at` set — and every writer stores it verbatim
(`apps/api/src/app/api/github/webhook/webhooks.ts:164,182`;
`apps/api/src/app/api/github/sync/route.ts:184,205`). The reader is already
correct: `packages/trpc/src/router/integration/github/github.ts:112` validates
`z.enum(["open","closed","all"])` and never offers `merged`.

The desktop components that branch on `pr.state === "merged"`
(`PRIcon.tsx:37`, `getPRFlowState.ts:104`, `PRStatusGroup.tsx:92`) read PR state
from the host-service's live GitHub GraphQL calls, where `PullRequestState` does
include `MERGED`. They are not reading this column, so nothing is broken today.

The footgun is forward-looking: the comment invites someone to write
`where state = 'merged'` against this table and get a silent zero-row result.

---

<a name="10"></a>
## 10. Constraint posture — Cosmetic

**CHECK constraints.** Three, in the entire database:

```sql
select n.nspname, count(*) filter (where k.contype='c') as checks,
       count(*) filter (where k.contype='f') as fks,
       count(*) filter (where k.contype='u') as uniques
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','auth','ingest') group by 1;
```

| schema | checks | fks | uniques |
|---|---|---|---|
| public | **3** | 73 | 14 |
| auth | **0** | 21 | 5 |
| ingest | **0** | 0 | 0 |

The three that exist are all recent and all good — they encode invariants that
would otherwise be code-only:

```
automation_triggers_kind_matches_config   CHECK ((config->>'kind') = kind::text)
page_comment_threads_anchor_matches_kind  CHECK ((anchor_kind = 'page') = (anchor IS NULL))
page_comments_agent_has_session           CHECK ((author_kind <> 'agent') OR (agent_session_id IS NOT NULL))
```

They are also the model for what is missing elsewhere — §6 is exactly the class of
drift a CHECK on `task_statuses.type` would have caught at write time.

Worth noting in mitigation: the schema does use native pgEnum widely — 18 enum
types across 31 columns (`integration_provider` alone on 11) — so most
constrained-domain columns are genuinely typed. The 15 `text` columns matching
enum-ish names are the exceptions, and most are defensible (`chat_attachments.
media_type` holds MIME types; `subscriptions.status` mirrors Stripe;
`github_installations.account_type` mirrors GitHub). Only §6 shows live drift.

**Tables with no primary key.** One:

```sql
select n.nspname||'.'||c.relname as tbl, to_char(c.reltuples,'FM999,999,999') as est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p') and n.nspname in ('public','auth','ingest','diag')
  and not exists (select 1 from pg_constraint k where k.conrelid=c.oid and k.contype='p')
  and not exists (select 1 from pg_inherits i where i.inhrelid=c.oid);
```

| tbl | est_rows | total |
|---|---|---|
| `diag.pgss_snapshot_2026_05_06` | 1,692 | 1,856 kB |

A dated one-off `pg_stat_statements` snapshot. No PK is fine for that; it is
3.5 months stale and looks like leftover debris rather than anything live.

---

<a name="11"></a>
## 11. Sequences and integer PK widths — nothing to report

Both halves of this category are clean, and the reason is structural: the schema
uses `uuid` primary keys throughout.

```sql
select schemaname||'.'||sequencename as seq, data_type, last_value, max_value,
       round(100.0*last_value/max_value,4) as pct_used
from pg_sequences where last_value is not null order by pct_used desc nulls last;
-- (0 rows)

select n.nspname||'.'||c.relname, a.attname, format_type(a.atttypid,a.atttypmod)
from pg_attribute a
join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
join pg_index i on i.indrelid=c.oid and i.indisprimary and a.attnum = any(i.indkey::int2[])
where n.nspname in ('public','auth','ingest')
  and a.atttypid in ('int4'::regtype,'int2'::regtype) and c.relkind='r';
-- (0 rows)
```

**No sequences exist at all**, so nothing can approach exhaustion. **No `int4` or
`int2` primary key column exists**, so there is no int4→int8 migration owed
anywhere. This category needs no further attention until the schema starts using
serial PKs, which it currently does not.

---

## New since last report

No baseline exists, so this section covers objects added in the last eight days —
the ones with the least review time. Schema changes in the window:

```
git log --oneline --since="8 days ago" -- packages/db/src/schema/ packages/db/drizzle/
ef0e6ba2a feat: introduce pages v1 (#6806)
0eb12e3e7 feat(ingest): accept Hookdeck-forwarded deliveries, reject stale Linear events (#6799)
77544ab74 chore(ingest): drop webhook_events.payload and retire its pruner (#6758)
75c641f14 perf(ingest): write webhook bodies to a day-partitioned table (#6749)
a2186002d chore(api): bound both event logs to a 7-day payload window (#6745)
```

| Object | Verdict |
|---|---|
| `pages`, `page_versions`, `page_comments`, `page_comment_threads`, `workspace_pages` (#6806) | **Clean.** Reviewed against all ten categories. UUID PKs on every table; `NOT NULL` on `slug`, `title`, `organization_id`; `pageVisibility` is a real pgEnum, not text; org FK CASCADEs, user FKs SET NULL (correct — a page should outlive its author); two of the database's three CHECK constraints are here. Indexes at `idx_scan = 0` only because the tables have no traffic yet. Unindexed FKs on `created_by_user_id` etc. are on 8–40 kB tables — irrelevant now, worth re-checking once they carry rows. |
| `ingest.webhook_payloads` + 17 partitions (#6749) | **Working as designed.** See [deliberate](#deliberate-and-correct-leave-alone). |
| `ALTER TABLE … DROP COLUMN payload` (#6758) | **Caused [§1](#1).** The split was right; the 419 GB it stranded was not reclaimed and cannot be by `DROP COLUMN` alone. |
| `enforce-retention` route (#6763) | **Caused [§2](#2).** Correct approach, under-provisioned by ~4×. |
| `public.cloud_workspaces` | **Provisional.** `reltuples = -1` (never analyzed, no rows). `provider` and `provider_sandbox_id` are `text` where `provider` looks enum-shaped, but with zero rows there is no drift to measure yet. Re-check next week. |

---

## What I'd actually do

Ranked by value per unit of risk. **None of this was done. All of it is a human
decision.**

1. **Decide whether to wait 38 days for §2 or intervene.** This is the only
   decision on the list that is time-sensitive in both directions. Doing nothing
   is defensible — the backlog does clear around 2026-10-01 *if* intake stays
   near 1.66M/day. The thing to actually watch is the intake rate, because at
   ~3.4M/day net drain reaches zero. Cheapest intervention by a wide margin is
   raising `TIME_BUDGET_MS` or the schedule frequency, neither of which touches
   the schema. Re-measure `rows_per_call` and `mean_exec_time` next week: if mean
   batch time has climbed above 35 s, the feedback loop in §2 is winning.
2. **Confirm the us-east-1 restore is scheduled before ~2026-09-14** (§3). This
   is a calendar check, not an engineering task, and it is the single cheapest
   item here. If the restore has slipped, the two index builds need planning now
   rather than under pressure in three weeks.
3. **Treat §1 as a consequence of §2, not a separate task.** The 419 GB frees
   itself as the backlog drains. A `VACUUM FULL` / `pg_repack` to return it to
   billed storage is a real option but takes `ACCESS EXCLUSIVE` on a table taking
   1.7M inserts/day — worth costing against the Neon bill, and worth deferring
   until after the drain, since nothing before ~2026-09-21 would reclaim the
   rows still inside the retention window anyway.
4. **`webhook_events_provider_status_idx`** (§5) — 1,082 MB, 12 scans in 31 days,
   zero code references. The clearest single win on the list, and the write-path
   saving on a table taking 1.7M inserts/day is the real prize, not the gigabyte.
5. **Add a CHECK or pgEnum to `task_statuses.type`** (§6) — but fix the comment
   first, or backfill the 15,748 `duplicate`/`triage` rows. Adding a constraint
   matching the current comment would fail validation against live data.
6. **Fix the `github_pull_requests.state` comment** (§9). One line. Prevents a
   future silent-zero-rows query.
7. **Leave §7 alone unless the tombstone convention is ever bypassed**, and treat
   §8 as genuinely optional.

## Deliberate and correct — leave alone

Carried forward to next week. **Do not re-litigate these** unless new evidence
actually changes.

- **`ingest.webhook_events` stays unpartitioned.** `packages/db/src/schema/
  ingest.ts:12-20` explains it: a unique index on a partitioned table must contain
  the partition key, so adding `received_at` to the `(provider, event_id)` dedup
  index would mean a redelivery no longer conflicts — silently disabling dedup.
  Verified: `webhook_events_provider_event_id_idx` is 26 GB with **109,420,619
  scans** in 31 days. It is doing exactly the job claimed. This is audit item 8
  and the team got it right before the audit asked.
- **`ingest.webhook_payloads` PK is `(webhook_event_id, received_at)`** — includes
  the partition key, as required. Safe here because the table is write-only and
  dedup happens upstream on `webhook_events`. Confirmed 1:1: the hour
  2026-08-24 12:00–13:00 holds exactly 110,060 rows in each table.
- **Partition maintenance is healthy.** 14 future partitions exist through
  2026-09-07, matching `days_ahead => 14`. `webhook_payloads_default` holds
  **0 rows** — the exact condition migration `0089` says to alert on.
- **`automation_events.payload` 7-day pruner works.** Boundary lands precisely on
  2026-08-17; everything older is nulled. (Row retention is a separate gap — §3.)
- **`automation_events.provider` is `text`, not `integration_provider`.**
  Documented at `schema.ts:918-919`: it must hold `webhook` and `superset`, which
  have no connection behind them. Deliberate.
- **`automation_events.webhook_event_id` is not a foreign key.** Documented at
  `schema.ts:946-948`: a FK would make `ingest` un-prunable. Deliberate, and
  §2 depends on it staying that way.
- **`auth.organizations` CASCADEs to 12 tables.** Deleting an organization should
  remove its data. Intended.
- **No sequences, no int4 PKs.** UUID PKs throughout (§11).

---

*Generated 2026-08-24 16:02 UTC against `br-billowing-dream-af839yib` (production).
Read-only session; `SET statement_timeout='60s'` and
`SET default_transaction_read_only=on` on every connection. The `ingest` schema
denies `readonly`, so `ingest.*` catalog and sample queries used `neondb_owner`
with `default_transaction_read_only=on` set before any other statement. No
`EXPLAIN ANALYZE` was run. Row counts on `ingest.webhook_events` and
`public.automation_events` are `TABLESAMPLE` estimates or plain-`EXPLAIN` planner
estimates where a `count(*)` would exceed the timeout; each is labelled inline.*
