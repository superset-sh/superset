# Linear integration overhaul: teams entity, per-team numbering, OAuth refresh, app-actor

Three workstreams bundled because they all touch the Linear integration code and read better as one cohesive design:

1. **Teams entity + per-team task numbering** — replaces the inconsistent `tasks.slug` column with stable `{teamKey}-{number}` identifiers backed by a teams table with an explicit linkage to Linear.
2. **OAuth token refresh** — fixes silent 401-after-24-hours that's currently breaking connections. Linear migrated to short-lived tokens on 2026-04-01; our code was written for the old long-lived model and was never updated.
3. **`actor=app` switch + connect/error UX** — preparation for submitting Superset to Linear's integration directory. Bundles cleanly here since we're already touching the connect route.

Ship order favours user-visible urgency: **OAuth refresh first** (workstream 2), then **teams + numbering + actor switch + UX** (workstreams 1 + 3 together, since they share files).

---

## Workstream 1: Teams entity + per-team numbering

### Context

`tasks.slug` is text + `unique(organizationId, slug)`. Two writers populate it inconsistently:

- **Local creation** (`packages/trpc/src/router/task/task.ts:207-220` via `generateBaseTaskSlug`/`generateUniqueTaskSlug` in `packages/shared/src/task-slug.ts`) → kebab-case-from-title with numeric suffix on collision. Agents produce 30+ char nonsense slugs.
- **Linear sync** (`apps/api/.../sync-task/route.ts:217`, `apps/api/.../initial-sync/utils.ts:183`, `apps/api/.../webhook/route.ts:173`) → overwrites `slug` with Linear's `issue.identifier` (`SUPER-237`).

Same column carries two semantically different things. Result: hybrid identifier space, hard to predict, hard to reference.

### Goals

- Replace `tasks.slug` with a stable, human-readable identifier in the form `{teamKey}-{number}` (e.g. `SUPER-103`).
- Per-team monotonic numbering allocated atomically.
- Identifier is canonical for both local-only and Linear-synced tasks. Linear's identifier (`ENG-42`) becomes metadata on `external_key`.
- Renaming a team's key keeps old links working via redirect.
- Linear teams link to our teams via an explicit admin-set linkage (one of our teams ↔ one Linear team). Issues from non-linked Linear teams are ignored.
- One default team per org for now; multi-team UI deferred.

### Non-goals (this workstream)

- Auto-mirroring Linear teams 1:1 in our data model. Linkage is admin-driven via a UI dropdown, not auto-discovered from webhooks/sync.
- Auto-detecting Linear team-key renames. Linear emits no Team webhook events; opportunistic sync via Issue payloads is deferred.
- Surfacing teams as a multi-team UI in org settings. One default team per org, configurable Linear-link only.

### Schema

#### `teams`

Stable team identity. No `key` column — keys are temporal and live in `team_keys`. Carries the Linear linkage directly, mirroring the `external_provider/id/key` pattern already used on `tasks` and `task_statuses`.

```ts
export const teams = pgTable("teams", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text().notNull(),
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
  unique("teams_org_external_unique").on(t.organizationId, t.externalProvider, t.externalId),
]);
```

`teams.externalKey` is Linear's team key (`ENG`) — distinct from `team_keys.key` (our team's identifier prefix, e.g. `SUPER`). They're independent: an admin can link our `SUPER` team to Linear's `ENG` team, and tasks in our team get identifiers like `SUPER-103` in our app and `ENG-42` in Linear, with `external_key` on the task storing `ENG-42`.

#### `team_keys`

Lifecycle of every key a team has ever used. Current key = `retired_at IS NULL`. Resolution of `SUPER-103` and `OLDPREFIX-103` (after a rename) both hit this table — no UNION across "current" and "history."

```ts
export const teamKeys = pgTable("team_keys", {
  id: uuid().primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  key: text().notNull(),
  effectiveAt: timestamp("effective_at").notNull().defaultNow(),
  retiredAt: timestamp("retired_at"),
}, (t) => [
  unique("team_keys_org_key_unique").on(t.organizationId, t.key),
  uniqueIndex("team_keys_team_id_current_unique")
    .on(t.teamId)
    .where(sql`${t.retiredAt} IS NULL`),
  index("team_keys_team_id_idx").on(t.teamId),
]);
```

Full `unique(organization_id, key)` (not partial): a key, once used in an org, is reserved forever. Prevents teamA renaming away from `FOO`, teamB later claiming `FOO`, and `FOO-7` becoming ambiguous.

#### `team_sequences`

Atomic per-team counter. One row per team. Separate table — keeps hot counter updates off the teams entity row.

```ts
export const teamSequences = pgTable("team_sequences", {
  teamId: uuid("team_id").primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull().default(0),
});
```

Allocation is one statement, atomic via row-level X-lock:

```ts
const [{ number }] = await tx
  .insert(teamSequences)
  .values({ teamId, lastNumber: 1 })
  .onConflictDoUpdate({
    target: teamSequences.teamId,
    set: { lastNumber: sql`${teamSequences.lastNumber} + 1` },
  })
  .returning({ number: teamSequences.lastNumber });
```

Surrounding tx rollback unwinds the counter — no gaps from failed inserts. (Postgres native sequences advance on rollback; row UPDATE is what we want here.)

#### `tasks` changes

Add `team_id` (FK), `number` (integer). Drop `slug` after one release. Keep `external_key` as Linear metadata.

```ts
{
  // … existing columns …
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
  number: integer().notNull(),
}
// indexes / constraints:
//   unique("tasks_team_number_unique").on(team_id, number)
//   index("tasks_team_id_idx").on(team_id)
//   partial unique on (organization_id, external_key) where external_key IS NOT NULL
//   keep tasks_external_unique(organization_id, external_provider, external_id)
//   drop tasks_org_slug_unique, tasks_slug_idx (after slug column drop)
```

`onDelete: "restrict"` on `team_id`: a task can't dangle without a team. Org delete still cascades through teams → tasks.

Partial unique on `external_key` lets us resolve `@task:ENG-42` mentions to a single task (see Read paths).

### Migration

Single Drizzle migration plus one deploy-time script. Backfill is uniform — every org gets one team, every task flattens into that team's number space.

```sql
-- 1. DDL: create teams, team_keys, team_sequences (per definitions above).

-- 2. For each org with any tasks, create a default team.
INSERT INTO teams (id, organization_id, name)
SELECT gen_random_uuid(), o.id, o.name
FROM auth.organizations o
WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.organization_id = o.id);

-- 3. (TS deploy script) Insert the initial team_keys row for each new team.
--    rawKey = upper(replace(org.slug, /[^A-Z0-9]/g, ''))
--    key    = rawKey.length > 0 ? rawKey : 'TASK'
--    INSERT INTO team_keys (team_id, organization_id, key) VALUES (...)

-- 4. (TS deploy script) For each org with a Linear connection AND a non-null
--    linearConfig.newTasksTeamId, populate the team's external linkage:
--      a) call client.team(newTasksTeamId) to get { id, key, name }
--      b) UPDATE teams SET external_provider='linear', external_id=$id, external_key=$key
--         WHERE id = $defaultTeamId
--    Orgs without newTasksTeamId set: leave unlinked, surface a "Link Linear team"
--    prompt next time they visit integrations page.

-- 5. Set tasks.team_id and tasks.number — flatten everything into the org's default team.
WITH numbered AS (
  SELECT t.id,
    (SELECT id FROM teams tm WHERE tm.organization_id = t.organization_id LIMIT 1) AS team_id,
    ROW_NUMBER() OVER (PARTITION BY t.organization_id ORDER BY t.created_at, t.id) AS num
  FROM tasks t
)
UPDATE tasks SET team_id = numbered.team_id, number = numbered.num
FROM numbered WHERE tasks.id = numbered.id;

-- 6. Seed team_sequences.
INSERT INTO team_sequences (team_id, last_number)
SELECT team_id, COALESCE(MAX(number), 0) FROM tasks GROUP BY team_id;

-- 7. NOT NULL + unique on tasks.
ALTER TABLE tasks ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN number SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_team_number_unique UNIQUE (team_id, number);

-- 8. Partial unique on external_key for mention-fallback resolution.
CREATE UNIQUE INDEX tasks_org_external_key_unique
  ON tasks (organization_id, external_key)
  WHERE external_key IS NOT NULL;

-- 9. Keep slug column + tasks_org_slug_unique for one release.
--    Dual-write `${currentTeamKey}-${number}` so shipped CLI/renderer keep working.
--    Drop in a follow-up migration after SDK consumers migrate.
```

Backfill notes:

- **Linear-synced tasks lose their Linear-shaped identifier as the canonical key.** A task that was `ENG-42` in our slug column gets renumbered to (e.g.) `SUPER-103`. The Linear identifier is preserved in `external_key`. UI surfaces both as `SUPER-103 · ENG-42`.
- **Pre-existing tasks from non-linked Linear teams stay in our DB but stop receiving updates.** They become orphans. Surface as a one-time notification to admins ("X issues from Linear team `DESIGN` are no longer syncing — keep or delete?"). The actual cleanup UI is a follow-up.
- **Org-slug-derived team key**: empty/non-alphanumeric slugs fall back to `TASK`. The deploy script handles regex sanitization; SQL alone would be ugly.

### Read paths

#### Identifier resolution

`task.byIdOrKey` (renamed from `byIdOrSlug`) accepts a UUID or a key like `SUPER-103`:

```
input = "SUPER-103" or UUID

1. UUID? → tasks.id lookup.
2. Match /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/i:
   a. SELECT t.* FROM tasks t
      JOIN team_keys tk ON tk.team_id = t.team_id
      WHERE tk.organization_id = $org AND tk.key = $prefix AND t.number = $number;
      → if hit and tk.retired_at IS NULL, return.
      → if hit and tk.retired_at IS NOT NULL, return with redirected: true plus
        the canonical identifier.
   b. If no match, fallback: SELECT * FROM tasks
      WHERE organization_id = $org AND external_key = $input;
      → handles old `@task:ENG-42` mentions where ENG-42 is Linear's identifier.
3. Else: not found.
```

Single query for the common case. `team_keys` consulted whether the matched key is current or retired — no UNION.

URL `/tasks/$taskId`: same logic. On redirect (`tk.retired_at IS NOT NULL`), client calls `navigate({ replace: true })` to the canonical key.

#### Display projection

```ts
db.select({
  task: tasks,
  teamKey: teamKeys.key,
})
.from(tasks)
.innerJoin(teamKeys, and(
  eq(teamKeys.teamId, tasks.teamId),
  isNull(teamKeys.retiredAt),
))
```

`identifier = teamKey + '-' + task.number`. Computed in the projection step, not stored. Ship as `Task.identifier` on the SDK and in tRPC return shapes. `Task.slug` stays for one release as a deprecated alias = `identifier`.

### Write paths

#### Local task creation

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
      .insert(teamSequences)
      .values({ teamId, lastNumber: 1 })
      .onConflictDoUpdate({
        target: teamSequences.teamId,
        set: { lastNumber: sql`${teamSequences.lastNumber} + 1` },
      })
      .returning({ number: teamSequences.lastNumber });

    const [task] = await tx.insert(tasks).values({
      organizationId, teamId, number, ...input,
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
- If none, INSERT one + initial `team_keys` row + `team_sequences` row, all in tx.
- Returns the team UUID.

Lazy creation keeps orgs without tasks from getting empty default teams.

#### Linear sync — outbound (local task → Linear issue)

`apps/api/.../sync-task/route.ts`:

The local task already has its canonical identifier (`SUPER-103`) from creation. The QStash job pushes it to the **linked Linear team** and writes the Linear identifier back into `external_key`. **No change to `team_id` or `number` after the Linear call.** Our identifier is stable; Linear's is metadata.

```ts
const task = await db.query.tasks.findFirst({
  where: eq(tasks.id, taskId),
  with: { team: true },
});

if (task.team.externalProvider !== "linear" || !task.team.externalId) {
  // Task's team isn't linked to Linear — outbound sync is a no-op
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

#### Linear sync — inbound (Linear webhook → our task)

`apps/api/.../webhook/route.ts`:

Filter inbound by linkage. Issues from Linear teams not linked to any Superset team are skipped:

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

const [{ number }] = /* same atomic increment, scoped to linkedTeam.id */;

await tx.insert(tasks).values({
  organizationId: connection.organizationId,
  teamId: linkedTeam.id,
  number,
  title: issue.title,
  // … other fields …
  externalProvider: "linear",
  externalId: issue.id,
  externalKey: issue.identifier,
  externalUrl: issue.url,
}).onConflictDoUpdate({
  target: [tasks.organizationId, tasks.externalProvider, tasks.externalId],
  set: { /* same fields, BUT do NOT change team_id or number on conflict */ },
});
```

Critical: the `onConflictDoUpdate.set` clause must NOT touch `team_id` or `number`. Once a task has them, they're stable for life. Re-running the webhook is idempotent for identifier.

#### Initial sync

`apps/api/.../initial-sync/route.ts`:

`syncWorkflowStates` loop is unchanged — that handles `taskStatuses`. For tasks: only fetch issues for the linked Linear team(s):

```ts
const linkedTeams = await db.query.teams.findMany({
  where: and(eq(teams.organizationId, organizationId), eq(teams.externalProvider, "linear")),
});

for (const ourTeam of linkedTeams) {
  const issues = await fetchIssuesForTeam(client, ourTeam.externalId);
  // map and insert with teamId: ourTeam.id, batched number allocation
}
```

`mapIssueToTask` (`apps/api/.../initial-sync/utils.ts:154`) drops `slug: issue.identifier`. Tasks are inserted without a number; the loop assigns numbers from the team sequence in batches:

```ts
const [{ lastNumber: end }] = await tx
  .insert(teamSequences)
  .values({ teamId: ourTeam.id, lastNumber: issues.length })
  .onConflictDoUpdate({
    target: teamSequences.teamId,
    set: { lastNumber: sql`${teamSequences.lastNumber} + ${issues.length}` },
  })
  .returning({ lastNumber: teamSequences.lastNumber });
const start = end - issues.length + 1;
// issues[i] gets number = start + i
```

One round-trip for the whole batch.

#### Linear disconnect

`packages/trpc/src/router/integration/linear/linear.ts:32-119`:

Today: deletes `tasks WHERE externalProvider='linear'` and `taskStatuses WHERE externalProvider='linear'`, remaps statuses, deletes the connection.

Add: clear the team's external linkage (`UPDATE teams SET external_provider=NULL, external_id=NULL, external_key=NULL`) but keep the team and its keys. The org's default team and its number sequence persist regardless of integration state. Linear-synced tasks are still deleted; their numbers are not reused (matches Linear's own behavior re: deleted issue numbers).

### Mention/search fallback for `external_key`

Pre-migration `@task:ENG-42` mentions worked because `slug = 'ENG-42'`. Post-migration, `ENG-42` no longer matches `team_keys` (the team's key is `SUPER`).

Resolution falls back to `external_key` (step 2b in the resolver). Partial unique index `(organization_id, external_key) WHERE external_key IS NOT NULL` guarantees uniqueness.

UI display of Linear-synced tasks shows both: `SUPER-103 · ENG-42` (canonical · external). Search indexes both.

---

## Workstream 2: OAuth token refresh (urgent)

### What's broken

Linear migrated all OAuth apps to short-lived (24h) access tokens with rotating refresh tokens on **2026-04-01**. Our code was written for the old long-lived model and was never updated. Specifically:

1. **Refresh token never stored.** `apps/api/.../linear/callback/route.ts:76-77` types the response as `{ access_token, expires_in? }` — `refresh_token` isn't even read. `integrationConnections.refreshToken` column exists in the schema (`packages/db/src/schema/schema.ts:188`) but is never populated for Linear.
2. **Expiration never checked.** `getLinearClient` (`packages/trpc/src/router/integration/linear/utils.ts:38-53`) reads the row and constructs `new LinearClient({ accessToken: connection.accessToken })`. Doesn't look at `tokenExpiresAt`. Doesn't refresh.
3. **No refresh logic anywhere.**
4. **No connection-level error state.** When a token 401s, the error gets written to per-task `syncError`. The connection row still says "Connected." UI gives no signal.

Result: any connection re-authed since 2026-04-01 silently breaks within 24h. This matches the symptoms users are reporting.

### Fix

#### Schema

Add a connection-broken signal so the UI can surface "Reconnect Linear":

```ts
// integrationConnections — add:
disconnectedAt: timestamp("disconnected_at"),  // set when refresh returns invalid_grant or admin disconnects
disconnectReason: text("disconnect_reason"),   // "invalid_grant" | "user_revoked" | "admin_disconnected"
```

#### Callback writes the full token triple

`apps/api/.../linear/callback/route.ts`:

```ts
const tokenData: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
} = await tokenResponse.json();

const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

await db.insert(integrationConnections).values({
  // … existing fields …
  accessToken: tokenData.access_token,
  refreshToken: tokenData.refresh_token,    // NEW — was never stored
  tokenExpiresAt,
  disconnectedAt: null,
  disconnectReason: null,
}).onConflictDoUpdate({
  target: [integrationConnections.organizationId, integrationConnections.provider],
  set: {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiresAt,
    disconnectedAt: null,
    disconnectReason: null,
    // … etc
  },
});
```

#### Refresh helper (single-flight via Postgres advisory lock)

New file `apps/api/src/lib/integrations/linear/refresh-token.ts`:

```ts
const REFRESH_LOCK_NAMESPACE = 0x4c494e52; // "LINR" — arbitrary, just needs to be stable

export async function refreshLinearToken(connectionId: string): Promise<void> {
  await dbWs.transaction(async (tx) => {
    // Single-flight: parallel refreshes will race and both invalidate each other,
    // because Linear rotates refresh tokens. Advisory lock serializes per connection.
    const lockKey = hashStringToInt(connectionId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_NAMESPACE}, ${lockKey})`);

    const conn = await tx.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, connectionId),
    });
    if (!conn?.refreshToken) {
      throw new Error("No refresh token");
    }

    // Re-check expiry under lock — another process may have just refreshed.
    if (conn.tokenExpiresAt && conn.tokenExpiresAt > new Date(Date.now() + 60_000)) {
      return; // still valid for >60s, someone else refreshed
    }

    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken,
        client_id: env.LINEAR_CLIENT_ID,
        client_secret: env.LINEAR_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (body?.error === "invalid_grant") {
        // Refresh token expired (inactivity) or user revoked the app.
        await tx.update(integrationConnections).set({
          disconnectedAt: new Date(),
          disconnectReason: "invalid_grant",
        }).where(eq(integrationConnections.id, connectionId));
      }
      throw new Error(`Linear token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    await tx.update(integrationConnections).set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,    // rotated; old one is now dead
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    }).where(eq(integrationConnections.id, connectionId));
  });
}
```

#### `getLinearClient` refreshes proactively

`packages/trpc/src/router/integration/linear/utils.ts`:

```ts
export async function getLinearClient(organizationId: string): Promise<LinearClient | null> {
  const connection = await db.query.integrationConnections.findFirst({
    where: and(
      eq(integrationConnections.organizationId, organizationId),
      eq(integrationConnections.provider, "linear"),
    ),
  });

  if (!connection || connection.disconnectedAt) return null;

  // Refresh if expired or expiring within 5 minutes.
  const expiresIn = connection.tokenExpiresAt
    ? connection.tokenExpiresAt.getTime() - Date.now()
    : Infinity;

  if (expiresIn < 5 * 60 * 1000) {
    await refreshLinearToken(connection.id);
    // Re-fetch to get the fresh access token written by refreshLinearToken.
    const refreshed = await db.query.integrationConnections.findFirst({
      where: eq(integrationConnections.id, connection.id),
    });
    if (!refreshed || refreshed.disconnectedAt) return null;
    return new LinearClient({ accessToken: refreshed.accessToken });
  }

  return new LinearClient({ accessToken: connection.accessToken });
}
```

#### 401 fallback in API call sites

The Linear SDK throws errors with status info. Wrap call sites that hit Linear (sync-task route, initial-sync, getTeams in tRPC) so a 401 attempts one refresh-then-retry before propagating:

```ts
async function callLinear<T>(orgId: string, fn: (client: LinearClient) => Promise<T>): Promise<T> {
  let client = await getLinearClient(orgId);
  if (!client) throw new Error("Linear not connected");

  try {
    return await fn(client);
  } catch (e) {
    if (isLinearAuthError(e)) {
      const conn = await db.query.integrationConnections.findFirst({/* … */});
      if (conn) await refreshLinearToken(conn.id);
      client = await getLinearClient(orgId);
      if (!client) throw new Error("Linear connection broken");
      return await fn(client);
    }
    throw e;
  }
}
```

#### One-time migration of legacy long-lived tokens

Linear provides a [migration endpoint](https://linear.app/developers/oauth-2-0-authentication) to upgrade pre-rotation long-lived tokens to the new (access + refresh) pair. Backfill script in `packages/scripts/`:

```ts
// For each connection where refreshToken IS NULL:
//   POST to Linear's migration endpoint with the existing long-lived access_token
//   Receive { access_token, refresh_token, expires_in }
//   Atomically update the connection
//   On error: mark disconnected (token may already be dead)
```

Run once at deploy time. Logs each connection's outcome.

#### UI: surface broken connections

Integrations page (`apps/web/...integrations/linear/page.tsx`): if `disconnectedAt IS NOT NULL`, replace the "Connected" state with a "Reconnect Linear" CTA that re-runs the OAuth flow. Show `disconnectReason` as supporting copy.

### Why ship this first

Token expiry is actively breaking users right now. The team-entity migration is more invasive but less urgent. Ordering:

1. **Workstream 2 in its own PR**, fast turnaround. Schema changes are additive (`disconnectedAt`, `disconnectReason`, populate `refreshToken`). Backfill script runs at deploy.
2. **Workstream 1 + 3 together** in a follow-up PR.

---

## Workstream 3: `actor=app` switch + connect/error UX

### `actor=app`

`apps/api/.../linear/connect/route.ts:50` — change the OAuth scope params to include `actor=app`. Issues created/updated by Superset will then appear as authored by the Superset OAuth app instead of by whoever connected. Standard for listed integrations (Slack, GitHub, Devin all do this).

```ts
linearAuthUrl.searchParams.set("scope", "read,write,issues:create");
linearAuthUrl.searchParams.set("actor", "app");  // NEW
```

One-line change. No data migration. Existing tokens keep working with their old actor; only newly authored issues after re-auth show "Superset" as author. Worth re-auth-ing once after rollout for consistency, but not required.

### Integrations UI revamp

`apps/web/src/app/(dashboard-legacy)/integrations/linear/`:

Today's UI:
- Connect button → OAuth
- `TeamSelector` dropdown → "Where to create new tasks" → writes `linearConfig.newTasksTeamId`
- `ConnectionControls` → disconnect button
- `ErrorHandler` → reads `?error=` query param

After:
- Connect button → OAuth (with `actor=app`)
- **"Link Linear team to Superset" picker** → writes `teams.external_provider/id/key` for the org's default team (replaces the `newTasksTeamId` mutation entirely)
- **Connection status panel** → shows `disconnectedAt`/`disconnectReason` from workstream 2, with "Reconnect" CTA when broken
- **Connect-flow consent copy** → "Issues from the Linear team you link will be visible to all members of your Superset organization" (documents the visibility-broadening risk for private Linear teams without engineering around it)
- **Orphaned-issues notice** → if there are tasks with `external_provider='linear'` but no longer matching the linked team's `externalId`, show "X issues from previously-linked teams are no longer syncing — keep or delete?" (UI for actually cleaning up is a follow-up)

`linearConfig.newTasksTeamId` is dropped from the `LinearConfig` type. The `updateConfig` tRPC mutation is removed. Replaced by a `linkTeam` mutation that takes `(superseTeamId, linearTeamId, linearTeamKey, linearTeamName)` and writes the linkage.

---

## Surface area (combined)

| Area | Files | Notes |
|---|---|---|
| Schema | `packages/db/src/schema/{schema,relations,types}.ts` + 2 migrations + 1 deploy script | new tables, tasks alter, connection-broken fields, drop `LinearConfig.newTasksTeamId` |
| OAuth refresh | `apps/api/src/lib/integrations/linear/refresh-token.ts` (new) + `apps/api/.../linear/callback/route.ts` + `packages/trpc/src/router/integration/linear/utils.ts` + `packages/scripts/migrate-linear-tokens.ts` (new) | core refresh logic + 1-time migration |
| 401 retry wrapper | `apps/api/.../linear/jobs/{sync-task,initial-sync}/*` + `packages/trpc/.../linear/linear.ts` (getTeams) | call-site wrapping |
| Connect route | `apps/api/.../linear/connect/route.ts` | add `actor=app` |
| tRPC tasks | `packages/trpc/src/router/task/{task,schema}.ts` | rewrite createTask, byIdOrKey, drop bySlug |
| tRPC integrations | `packages/trpc/src/router/integration/linear/linear.ts` | replace `updateConfig` with `linkTeam`, disconnect tweak |
| Linear API routes | `apps/api/.../linear/{webhook,jobs/sync-task,jobs/initial-sync}/*` | drop slug writes, switch to team_id+number, filter by linkage |
| MCP tools | `packages/mcp/src/tools/tasks/*` (5 files) + `packages/mcp-v2/src/tools/tasks/*` | input descriptions, slug→identifier |
| SDK | `packages/sdk/src/resources/tasks.ts` | add `identifier`, deprecate `slug` |
| Desktop UI | TasksTable, KanbanCard, TaskDetailHeader, TaskActionMenu, RunInWorkspacePopover, IssueLinkCommand, LinkedTaskChip, ChatInputFooter, $taskId/page.tsx | display + nav |
| Mention parser | `apps/desktop/.../parseUserMentions/parseUserMentions.ts` | rename output field; logic unchanged |
| Web integrations UI | `apps/web/.../integrations/linear/{page.tsx, components/*}` | reskin TeamSelector → LinearTeamLinker, add disconnected state, consent copy |
| local-db | `packages/local-db/src/schema/schema.ts` + sqlite migration | parallel teams/team_keys/team_sequences mirror |
| Agent launch | `packages/shared/src/agent-launch.ts` | `task.slug` → `task.identifier` for prompt filenames + workspace names |
| Tests | delete `task-slug.test.ts`; new tests for sequence allocation, identifier resolution, retired-key redirect, external_key fallback, refresh single-flight, 401 retry | |

Estimated 1.5k–2k LOC across both PRs.

---

## Phases

### PR 1 — Workstream 2 (OAuth refresh, urgent)

1. Schema additions (`refreshToken` populated, `disconnectedAt`, `disconnectReason`).
2. Callback updated to store refresh token + expiry.
3. `refreshLinearToken` helper with advisory-lock single-flight.
4. `getLinearClient` proactive refresh.
5. 401 retry wrapper at call sites.
6. Deploy-time backfill script for legacy long-lived tokens.
7. UI: surface disconnected state with "Reconnect" CTA.

Independently shippable. No dependency on workstream 1.

### PR 2 — Workstreams 1 + 3 (teams + numbering + actor=app + UI revamp)

1. Schema migration (teams, team_keys, team_sequences, tasks alter) + deploy script.
2. Backend writers + readers switch to identifier. tRPC, MCP tools, SDK adds `identifier` as canonical. `slug` still dual-written.
3. Linear sync routes filter by linkage; outbound uses `team.externalId`.
4. `actor=app` switch in connect route.
5. Web integrations UI revamp.
6. Desktop UI + agent-launch switch to identifier.

### PR 3 — Cleanup (follow-up after one release)

1. Drop `tasks.slug` column.
2. Drop SDK `slug` deprecation alias.

---

## Open decisions (defaulted, flag if wrong)

1. **`@task:ENG-42` fallback via `external_key`**: yes, with partial unique index.
2. **PR titles + branches use our identifier (`SUPER-N`)**, not Linear's. Linear users see different identifiers between our app and Linear's UI — `external_key` is the bridge.
3. **`slug` deprecated for one release**, dual-written, then dropped.
4. **Periodic Linear team poll** for opportunistic key sync: deferred.
5. **Team key derivation on org creation**: uppercase + sanitize org slug, fallback to `TASK` if empty.
6. **No multi-team UI for now**: single default team auto-created lazily on first task.
7. **`actor=app`** for new auths; pre-existing tokens keep their old actor until re-auth.
8. **Orphaned-issue cleanup** on link change: notify only, defer the actual delete UI.

---

## Out of scope / follow-ups

- Multi-team UI (create/rename/archive teams in org settings).
- Per-team Linear linkage at scale (multiple Superset teams each linking to different Linear teams).
- Team key rename UI (with redirect-history notification to users).
- Periodic Linear teams poll for opportunistic detection of Linear-side renames.
- Drop `tasks.slug` column (separate migration after SDK rollout).
- Cleanup UI for orphaned Linear-synced tasks (post-link-change).
- GitHub integration analog (`#123` style identifiers — would use the same `external_key` fallback mechanism).
- Linear integration directory submission (separate workstream — depends on this work landing first).
