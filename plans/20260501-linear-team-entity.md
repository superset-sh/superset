# Linear integration overhaul: teams entity + per-team numbering

Single workstream: replace the inconsistent `tasks.slug` column with stable `{teamKey}-{number}` identifiers backed by a teams table with an explicit Linear linkage.

> **Note:** This doc previously bundled two other workstreams.
> - *OAuth token refresh* shipped in migration `0042_linear_disconnect_state.sql` (`refreshToken`, `tokenExpiresAt`, `disconnectedAt`, `disconnectReason` are live on `integrationConnections`).
> - *`actor=app` switch + integrations UI revamp* is now a follow-up PR; tracked at the end of this doc.

---

## Context

`tasks.slug` is `text NOT NULL` + `unique(organizationId, slug)`. Two writers populate it inconsistently:

- **Local creation** (`packages/trpc/src/router/task/task.ts:208-220` via `generateBaseTaskSlug`/`generateUniqueTaskSlug` in `packages/shared/src/task-slug.ts`) → kebab-case-from-title with numeric suffix on collision. Agents produce 30+ char nonsense slugs.
- **Linear sync** (`apps/api/.../sync-task/route.ts:217`, `apps/api/.../initial-sync/utils.ts:183`, `apps/api/.../webhook/route.ts:173`) → overwrites `slug` with Linear's `issue.identifier` (`SUPER-237`).

Same column carries two semantically different things. Hybrid identifier space, hard to predict, hard to reference.

## Goals

- Replace `tasks.slug` with a stable, human-readable identifier in the form `{teamKey}-{number}` (e.g. `SUPER-103`).
- Per-team monotonic numbering allocated atomically.
- Identifier is canonical for both local-only and Linear-synced tasks. Linear's identifier (`ENG-42`) becomes metadata on `external_key`.
- Linear teams link to our teams via an explicit admin-set linkage (one of our teams ↔ one Linear team). Issues from non-linked Linear teams are ignored.
- One default team per org for now; multi-team UI deferred.
- Disconnect/reconnect preserves identifiers (soft delete, not hard delete).

## Non-goals

- Multi-team UI (create/rename/archive teams in org settings).
- Team-key rename history with redirecting old links. Rename UI is deferred; when it ships, add a `team_keys` history table then.
- Auto-mirroring Linear teams 1:1. Linkage is admin-driven via UI dropdown.
- Auto-detecting Linear team-key renames. Linear emits no Team webhook events.

---

## Schema

Single new table. Counter lives on the row, not in a satellite.

### `teams`

```ts
export const teams = pgTable("teams", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text().notNull(),
  key: text().notNull(),                // e.g. "SUPER" — identifier prefix
  lastTaskNumber: integer("last_task_number").notNull().default(0),
  archivedAt: timestamp("archived_at"),

  // Linkage to an external integration's team (Linear team UUID).
  // Set via the integrations UI dropdown. Null = unlinked, no external sync.
  externalProvider: integrationProvider("external_provider"),
  externalId: text("external_id"),       // Linear team UUID
  externalKey: text("external_key"),     // Linear's team key, e.g. "ENG" — denormalized for display

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("teams_organization_id_idx").on(t.organizationId),
  unique("teams_org_key_unique").on(t.organizationId, t.key),
  unique("teams_org_external_unique").on(t.organizationId, t.externalProvider, t.externalId),
]);
```

`teams.key` is our prefix (`SUPER`); `teams.externalKey` is Linear's prefix (`ENG`). Independent: admin can link our `SUPER` to Linear's `ENG`; tasks show as `SUPER-103` in our app and `ENG-42` in Linear, with `ENG-42` stored on the task's `external_key`.

**Counter discipline:** `lastTaskNumber` is the source of truth. Never recompute from `MAX(tasks.number)` — hard-deleting the highest-numbered task would silently reuse numbers on next allocation. Always trust the stored value.

### `tasks` changes

Add `team_id` (FK) and `number` (integer). Keep `slug` dual-written for one release. Keep `external_key` as Linear metadata.

```ts
{
  // … existing columns …
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  number: integer().notNull(),
}
// indexes / constraints:
//   unique("tasks_team_number_unique").on(team_id, number)
//   index("tasks_team_id_idx").on(team_id)
//   partial unique on (organization_id, external_key) where external_key IS NOT NULL
//   keep tasks_external_unique(organization_id, external_provider, external_id)
//   drop tasks_org_slug_unique, tasks_slug_idx (after slug column drop in PR3)
```

`onDelete: "cascade"` on `team_id`: deleting a team drops its tasks. (No `restrict` — keeps org-cascade deterministic.)

Partial unique on `external_key` lets us resolve `@task:ENG-42` mentions and old URLs to a single task (see Read paths).

### `task_statuses` change

Add `deletedAt timestamp` so disconnect can soft-delete statuses for symmetry with tasks (and with Linear, which preserves them):

```ts
{
  // … existing columns …
  deletedAt: timestamp("deleted_at"),
}
```

All status read paths add `isNull(deletedAt)` filters.

---

## Migration

Single Drizzle migration + one deploy-time TS script. Every org gets a default team; every task flattens into that team's number space.

```sql
-- 1. DDL: create teams, add tasks.team_id + tasks.number, add task_statuses.deleted_at.

-- 2. For each org with any tasks, create a default team.
--    Done in TS to handle key derivation cleanly:
--      rawKey = upper(replace(org.slug, /[^A-Z0-9]/g, ''))
--      key    = rawKey.length > 0 ? rawKey : 'TASK'
--    INSERT INTO teams (id, organization_id, name, key) VALUES (...)

-- 3. For each org with a Linear connection AND non-null linearConfig.newTasksTeamId,
--    populate the team's external linkage:
--      a) call client.team(newTasksTeamId) to get { id, key, name }
--      b) UPDATE teams SET external_provider='linear', external_id=$id, external_key=$key
--         WHERE id = $defaultTeamId
--    Orgs without newTasksTeamId set: leave unlinked. Surface a "Link Linear team"
--    prompt next time they visit the integrations page (follow-up PR).

-- 4. Set tasks.team_id and tasks.number — flatten everything into the org's default team.
WITH numbered AS (
  SELECT t.id,
    (SELECT id FROM teams tm WHERE tm.organization_id = t.organization_id LIMIT 1) AS team_id,
    ROW_NUMBER() OVER (PARTITION BY t.organization_id ORDER BY t.created_at, t.id) AS num
  FROM tasks t
)
UPDATE tasks SET team_id = numbered.team_id, number = numbered.num
FROM numbered WHERE tasks.id = numbered.id;

-- 5. Seed teams.last_task_number.
UPDATE teams SET last_task_number = sub.max_num
FROM (SELECT team_id, MAX(number) AS max_num FROM tasks GROUP BY team_id) sub
WHERE teams.id = sub.team_id;

-- 6. NOT NULL + unique on tasks.
ALTER TABLE tasks ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN number SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_team_number_unique UNIQUE (team_id, number);

-- 7. Partial unique on external_key for mention/legacy-URL fallback resolution.
CREATE UNIQUE INDEX tasks_org_external_key_unique
  ON tasks (organization_id, external_key)
  WHERE external_key IS NOT NULL;

-- 8. Keep slug column + tasks_org_slug_unique for one release.
--    Dual-write `${currentTeamKey}-${number}` so shipped CLI/SDK consumers keep
--    deserializing. NOT a backwards-compat path for URLs — see "Dual-write slug"
--    note below. Drop in PR3 after SDK consumers migrate.
```

### Backfill notes

- **Linear-synced tasks lose their Linear-shaped identifier as the canonical key.** A task that was `ENG-42` in our slug column gets renumbered to (e.g.) `SUPER-103`. The Linear identifier is preserved in `external_key`. UI surfaces both as `SUPER-103 · ENG-42`.
- **Pre-existing tasks from non-linked Linear teams stay in our DB but stop receiving updates.** They become orphans. Surface a one-time notification ("X issues from Linear team `DESIGN` are no longer syncing — keep or delete?"). Cleanup UI is a follow-up.
- **Org-slug-derived team key:** empty/non-alphanumeric slugs fall back to `TASK`. Regex sanitization happens in the TS deploy script.

### Dual-write slug caveat

The migration keeps `tasks.slug` dual-written as `${currentTeamKey}-${number}` for one release. **This exists only to keep shipped SDK/CLI/desktop clients deserializing without crashing.** It is NOT a URL-backcompat path: a pre-migration task that was `ENG-42` in `slug` becomes `SUPER-103` in `slug` (and in `external_key=ENG-42`). Old `/tasks/ENG-42` URLs resolve via the `external_key` fallback in step 2b of the resolver, not via the slug column.

---

## Read paths

### Identifier resolution

`task.byIdOrKey` (renamed from `byIdOrSlug`) accepts a UUID or a key like `SUPER-103`:

```text
input = "SUPER-103" or UUID

1. UUID? → tasks.id lookup.
2. Match /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/i:
   a. SELECT t.* FROM tasks t
      JOIN teams tm ON tm.id = t.team_id
      WHERE tm.organization_id = $org
        AND tm.key = $prefix
        AND t.number = $number
        AND t.deleted_at IS NULL;
   b. If no match, fallback: SELECT * FROM tasks
      WHERE organization_id = $org AND external_key = $input AND deleted_at IS NULL;
      → handles old `@task:ENG-42` mentions and legacy `/tasks/ENG-42` URLs.
3. Else: not found.
```

Single JOIN. No retired-key UNION (we don't track key history in this PR).

`task.bySlug` and `task.byIdOrSlug` stay as deprecated aliases for one release, both routing to the new resolver. Drop in PR3.

### Display projection

```ts
db.select({
  task: tasks,
  teamKey: teams.key,
})
.from(tasks)
.innerJoin(teams, eq(teams.id, tasks.teamId))
```

`identifier = teamKey + '-' + task.number`. Computed in the projection step, not stored. Ship as `Task.identifier` on the SDK and in tRPC return shapes. `Task.slug` stays for one release as a deprecated alias = `identifier`.

---

## Write paths

### Local task creation

`packages/trpc/src/router/task/task.ts` (`createTask`):

```ts
async function createTask(ctx, input) {
  const organizationId = await requireActiveOrgMembership(ctx);

  return dbWs.transaction(async (tx) => {
    const teamId = await resolveDefaultTeam(tx, organizationId);
    const statusId = input.statusId
      ? await getScopedStatusId(tx, organizationId, input.statusId, ...)
      : await seedDefaultStatuses(organizationId, tx);
    const assigneeId = input.assigneeId
      ? await getScopedAssigneeId(tx, organizationId, input.assigneeId, ...)
      : null;

    const [{ number }] = await tx
      .update(teams)
      .set({ lastTaskNumber: sql`${teams.lastTaskNumber} + 1` })
      .where(eq(teams.id, teamId))
      .returning({ number: teams.lastTaskNumber });

    const [task] = await tx.insert(tasks).values({
      organizationId, teamId, number,
      slug: `${currentTeamKey}-${number}`,  // dual-write for one release
      ...input,
    }).returning();

    const txid = await getCurrentTxid(tx);
    return { task, txid };
  }).then(async (result) => {
    if (result.task) syncTask(result.task.id);
    return result;
  });
}
```

Deleted:
- `packages/shared/src/task-slug.ts` (entire file + test)
- `TASK_SLUG_RETRY_LIMIT` retry loop and `isConstraintError` helper
- Pre-insert `existingSlugs` SELECT

`resolveDefaultTeam(tx, organizationId)`:
- Query for an existing non-archived team in the org.
- If none, INSERT one (derived key, `lastTaskNumber = 0`) in the same tx.
- Returns `{ teamId, teamKey }`.

Lazy creation keeps orgs without tasks from getting empty default teams.

### MCP batch create-task

`packages/mcp/src/tools/tasks/create-task/create-task.ts:81-147` does its own batch slug generation. Replace with the same batched counter pattern — one UPDATE allocates `n` numbers:

```ts
const [{ end }] = await tx
  .update(teams)
  .set({ lastTaskNumber: sql`${teams.lastTaskNumber} + ${batch.length}` })
  .where(eq(teams.id, teamId))
  .returning({ end: teams.lastTaskNumber });
const start = end - batch.length + 1;
// batch[i] gets number = start + i
```

One round-trip for the whole batch.

### Linear sync — outbound (local task → Linear issue)

`apps/api/.../sync-task/route.ts`:

The local task already has its canonical identifier (`SUPER-103`) from creation. The QStash job pushes it to the linked Linear team and writes the Linear identifier back into `external_key`. **No change to `team_id` or `number` after the Linear call.** Our identifier is stable; Linear's is metadata.

```ts
const task = await db.query.tasks.findFirst({
  where: eq(tasks.id, taskId),
  with: { team: true },
});

if (task.team.externalProvider !== "linear" || !task.team.externalId) {
  // Task's team isn't linked to Linear — outbound sync is a no-op.
  return;
}

// push to Linear using task.team.externalId as teamId
// on success:
await db.update(tasks).set({
  externalProvider: "linear",
  externalId: issue.id,
  externalKey: issue.identifier,
  externalUrl: issue.url,
  lastSyncedAt: new Date(),
  syncError: null,
}).where(eq(tasks.id, task.id));
```

Drop the `slug: issue.identifier` line from the existing code. `linearConfig.newTasksTeamId` becomes redundant — the linked team IS the target.

### Linear sync — inbound (webhook → our task)

`apps/api/.../webhook/route.ts`:

Filter by linkage; allocate number from the linked team:

```ts
const linkedTeam = await db.query.teams.findFirst({
  where: and(
    eq(teams.organizationId, connection.organizationId),
    eq(teams.externalProvider, "linear"),
    eq(teams.externalId, payload.data.team.id),
  ),
});

if (!linkedTeam) {
  await markEventSkipped(webhookEvent.id, "team_not_linked");
  return Response.json({ success: true, skipped: true });
}

// Allocate a number ONLY when inserting a new task. UPSERT must not re-allocate
// on conflict.
await tx.insert(tasks).values({
  organizationId: connection.organizationId,
  teamId: linkedTeam.id,
  number: /* fresh from teams.lastTaskNumber + 1 */,
  title: issue.title,
  // … other fields …
  externalProvider: "linear",
  externalId: issue.id,
  externalKey: issue.identifier,
  externalUrl: issue.url,
  deletedAt: null,                     // un-delete if previously soft-deleted (reconnect)
}).onConflictDoUpdate({
  target: [tasks.organizationId, tasks.externalProvider, tasks.externalId],
  set: {
    /* update title, status, etc. — but NOT team_id, NOT number */
    deletedAt: null,
  },
});
```

**Critical invariant:** the `onConflictDoUpdate.set` clause must NOT touch `team_id` or `number`. Once a task has them, they're stable for life. Re-running the webhook is idempotent for identifier. Reconnect after disconnect un-deletes (`deletedAt: null`) while preserving the original `SUPER-103`.

For the allocation: do an insert-first try with an optimistic `lastTaskNumber + 1`, and only call `UPDATE teams SET lastTaskNumber + 1` if the insert was a fresh insert (not a conflict update). Equivalently: run the counter UPDATE inside the same tx but use the `INSERT ... RETURNING (xmax = 0) AS inserted` trick to skip the counter advance when the row already existed.

### Initial sync

`apps/api/.../initial-sync/route.ts`:

Only fetch issues for the linked Linear team:

```ts
const linkedTeams = await db.query.teams.findMany({
  where: and(eq(teams.organizationId, organizationId), eq(teams.externalProvider, "linear")),
});

for (const ourTeam of linkedTeams) {
  const issues = await fetchIssuesForTeam(client, ourTeam.externalId);
  // For each issue, UPSERT on (orgId, 'linear', issue.id). For genuinely new rows,
  // allocate from a batched lastTaskNumber bump. For conflict-updates (already
  // synced before, or post-disconnect re-sync), just flip deletedAt to null and
  // refresh fields.
}
```

`mapIssueToTask` (`apps/api/.../initial-sync/utils.ts:154`) drops `slug: issue.identifier`. Counter advance is one statement per batch (see MCP example).

### Linear disconnect — soft delete

`packages/trpc/src/router/integration/linear/linear.ts:32-119`:

Today: hard-deletes `tasks WHERE externalProvider='linear'` and `taskStatuses WHERE externalProvider='linear'`, remaps statuses, deletes the connection.

After:

```ts
// Bulk soft-delete tasks
await tx.update(tasks)
  .set({ deletedAt: now })
  .where(and(
    eq(tasks.organizationId, organizationId),
    eq(tasks.externalProvider, "linear"),
    isNull(tasks.deletedAt),
  ));

// Bulk soft-delete statuses
await tx.update(taskStatuses)
  .set({ deletedAt: now })
  .where(and(
    eq(taskStatuses.organizationId, organizationId),
    eq(taskStatuses.externalProvider, "linear"),
    isNull(taskStatuses.deletedAt),
  ));

// Clear team linkage, keep the team + counter
await tx.update(teams)
  .set({ externalProvider: null, externalId: null, externalKey: null })
  .where(and(
    eq(teams.organizationId, organizationId),
    eq(teams.externalProvider, "linear"),
  ));

// Delete the connection row (existing behavior)
```

The status remap dance from the current code goes away — reconnect just UPSERTs and flips `deletedAt = null`, preserving original `task.statusId` references.

### Webhook delete event

Linear's issue-deleted webhook should soft-delete (not hard-delete) for the same reason. Restoring an issue in Linear → next sync flips `deletedAt = null`. No special undelete code path.

### Mention/search fallback for `external_key`

Pre-migration `@task:ENG-42` mentions worked because `slug = 'ENG-42'`. Post-migration, `ENG-42` no longer matches any team's key (the team's key is `SUPER`). Resolution falls back to `external_key` (step 2b in the resolver). Partial unique index `(organization_id, external_key) WHERE external_key IS NOT NULL` guarantees uniqueness. UI display of Linear-synced tasks shows both: `SUPER-103 · ENG-42` (canonical · external). Search indexes both.

---

## Surface area

| Area | Files | Notes |
|---|---|---|
| Schema | `packages/db/src/schema/{schema,relations,types}.ts` + 1 migration + 1 deploy script | new `teams`, `tasks.team_id` + `number`, `task_statuses.deleted_at`, drop `LinearConfig.newTasksTeamId` |
| tRPC tasks | `packages/trpc/src/router/task/{task,schema}.ts` | rewrite createTask, byIdOrKey, deprecate bySlug + byIdOrSlug |
| tRPC integrations | `packages/trpc/src/router/integration/linear/linear.ts` | replace `updateConfig` with `linkTeam`, bulk soft-delete on disconnect |
| Linear API routes | `apps/api/.../linear/{webhook,jobs/sync-task,jobs/initial-sync}/*` | drop slug writes, switch to team_id+number, filter by linkage, UPSERT with `deletedAt: null` |
| Slack work-objects | `apps/api/src/app/api/integrations/slack/events/utils/work-objects/work-objects.ts` | replace `${WEB_URL}/tasks/${task.slug}` and `display_id: task.slug` with `identifier` (server-rendered Slack cards) |
| MCP tools | `packages/mcp/src/tools/tasks/*` (5 files) + `packages/mcp-v2/src/tools/tasks/*` | input descriptions, slug→identifier, batch counter allocation in create-task |
| SDK | `packages/sdk/src/resources/tasks.ts` | add `identifier`, deprecate `slug` |
| Desktop UI | TasksTable, KanbanCard, TaskDetailHeader, TaskActionMenu, RunInWorkspacePopover, IssueLinkCommand, LinkedTaskChip, ChatInputFooter, $taskId/page.tsx | display + nav switch to `identifier` |
| Mention parser | `apps/desktop/.../parseUserMentions/parseUserMentions.ts` | rename output field; logic unchanged |
| Agent launch | `packages/shared/src/agent-launch.ts` | `task.slug` → `task.identifier` for prompt filenames + workspace names |
| Tests | delete `task-slug.test.ts` + composer test refs; new tests for counter allocation, identifier resolution, external_key fallback, soft-delete/reconnect roundtrip | |

Estimated ~1k LOC.

---

## Phases

### PR 1 — this doc (teams + numbering + soft delete)

1. Schema migration + deploy script (key derivation, Linear team backfill).
2. tRPC tasks: rewrite createTask, new `byIdOrKey` resolver, deprecated aliases for `bySlug`/`byIdOrSlug`.
3. Linear API routes: drop slug writes, filter inbound by linkage, UPSERT with `deletedAt: null`.
4. Linear disconnect: bulk soft-delete tasks + statuses.
5. Slack work-objects: switch URL + display_id to `identifier`.
6. MCP, SDK, desktop UI, agent-launch all switch to `identifier`. `slug` still dual-written.

### PR 2 — `actor=app` switch + integrations UI revamp

1. `apps/api/.../linear/connect/route.ts`: add `actor=app` to OAuth scope params.
2. `apps/web/.../integrations/linear/`: replace `TeamSelector` with a `LinearTeamLinker` that writes `teams.external_provider/id/key`; surface `disconnectedAt`/`disconnectReason` (already in schema from migration 0042); add consent copy.
3. Drop `linearConfig.newTasksTeamId` from `LinearConfig`. Remove `updateConfig` mutation in favor of `linkTeam`.

Depends on PR 1 landing.

### PR 3 — cleanup (follow-up after one release)

1. Drop `tasks.slug` column + `tasks_org_slug_unique` + `tasks_slug_idx`.
2. Drop SDK `slug` deprecation alias.
3. Drop `task.bySlug` + `task.byIdOrSlug` aliases.

---

## Open decisions (defaulted, flag if wrong)

1. **`@task:ENG-42` and legacy `/tasks/ENG-42` URLs**: resolve via `external_key` fallback with partial unique index. Default: yes.
2. **PR titles + branches use our identifier (`SUPER-N`)**, not Linear's. Linear users see different identifiers between our app and Linear's UI — `external_key` is the bridge.
3. **`slug` dual-written for one release**, then dropped.
4. **Team key derivation on org creation**: uppercase + sanitize org slug, fallback to `TASK` if empty.
5. **Counter discipline**: stored on `teams.lastTaskNumber`, never recomputed from `MAX(tasks.number)`. Hard-deleting the highest-numbered task would silently reuse — don't.
6. **No multi-team UI for now**: single default team auto-created lazily on first task.
7. **Soft delete everywhere on Linear sync paths** (tasks, statuses, webhook delete). Hard delete only on org cascade.
8. **Orphaned-issue cleanup** on link change (tasks from previously-linked Linear teams): notify only, defer the actual delete UI.

---

## Out of scope / follow-ups

- Multi-team UI (create/rename/archive teams in org settings).
- Per-team Linear linkage at scale (multiple Superset teams each linking to different Linear teams).
- Team-key rename history (`team_keys` table + redirect-on-resolve). Add when rename UI lands.
- Periodic Linear teams poll for opportunistic detection of Linear-side renames.
- Drop `tasks.slug` column (PR 3).
- Cleanup UI for orphaned Linear-synced tasks (post-link-change).
- GitHub integration analog (`#123` style identifiers — would use the same `external_key` fallback mechanism).
- Linear integration directory submission (depends on PR 2 landing first).
