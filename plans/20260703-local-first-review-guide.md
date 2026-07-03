# Electric removal + local-first workspaces — review guide (PR #5396)

One-page map of everything in the PR: what changed, why, how to reproduce, where to focus review.

## The change in one paragraph

ElectricSQL is fully removed from desktop and mobile. Workspaces (`v2_workspaces`) are now **local-first**: the host-service SQLite is the source of truth and the cloud row is just cross-machine presence. Every other org-scoped collection polls a new generic tRPC endpoint (`sync.pull`) instead of streaming Electric shapes. The Electric infra (proxy app, docker, Caddy, CI job) is now dead weight — torn down in a separate PR.

## Data paths, before → after

| Data | Before | After |
|---|---|---|
| `v2_workspaces` | Electric shape stream from cloud | Local host-service SQLite (authoritative), merged with cloud presence, 3s poll |
| 24 org-scoped tables (tasks, members, hosts, chat sessions, …) | Electric shape streams | `sync.pull` tRPC, 5s poll |
| `api_keys`, `integration_connections` | Electric (leaked columns to proxy) | Masked tRPC queries — `key`, `accessToken`, `refreshToken` never leave the server |
| Mobile (6 collections) | Electric | Same `sync.pull`, session auth |

TanStack DB collections and the persisted SQLite cache stay; only the sync source changed (`electricCollectionOptions` → `queryCollectionOptions`, `schemaVersion` bumped so caches rebuild).

## The pieces

**1. `sync.pull`** — `packages/trpc/src/router/sync/sync.ts`
Single endpoint, `{table, organizationId}` in, full org-scoped state out. Membership check (FORBIDDEN for non-members), per-table org scoping, column masking for secrets. Tests in `sync.test.ts` (masking tests are mutation-proven: adding `key` to the select makes them fail).

**2. Desktop collections** — `.../CollectionsProvider/collections.ts`
All collections rebuilt on `queryCollectionOptions` + `refetchInterval`. Mutation handlers kept, minus Electric txid matching (polling picks up writes on the next tick).

**3. Workspaces local-first**
- `packages/host-service/src/db/schema.ts` + migration `0008`: workspace identity columns (`name`, `type`, `organizationId`, `taskId`, `createdByUserId`) + `updatedAt`, all nullable ADD COLUMNs (safe on any existing DB); `busy_timeout` pragma added.
- Host router: `localList` (source of truth, legacy nulls coalesced), `updateLocal` (identity edits, stamps `updatedAt`), `cloudList` kept for the v1 import modal.
- Renderer `fetchWorkspaces`: local list + cloud presence fetched in parallel; cloud comes **directly from the renderer** (session auth) so remote-machine workspaces survive a dead local host; per-org last-good caches so a transient failure never wipes rows.
- `mergeWorkspacePresence.ts` (pure, 8 tests): local rows win existence; cloud rows without a local row render as presence; **identity reconciles both ways** — newer cloud renames adopted into local SQLite, newer local renames pushed to a stale cloud mirror, and never-locally-edited rows always adopt cloud (pre-flip local names are branch placeholders; LWW would clobber real names). Masking is exact: only ids with a pending `delete` in the presence outbox (via `workspace.pendingCloudDeletes`) are hidden — masking on own `hostId` would hide every workspace of another host-service profile on the same machine (dev vs prod share the machine-derived hostId) or after a local DB reset.
- **Local-first lifecycle**: `workspaces.create` commits the local row + worktree with no cloud call (id generated host-side; cloud create is idempotent on it) and `workspaceCleanup.destroy` commits on the local row delete — both mirror presence best-effort into `cloud_presence_outbox` (op create|delete, latest local action wins), drained on boot + hourly. Create and delete now work offline. Deliberately an outbox, not a "delete cloud rows missing locally" sweep — dev and prod hosts share a machine-derived `hostId`, a sweep would nuke each other's presence.
- Known quirk (pre-existing adopt semantics, not new): `ensureMainWorkspace` adopts the existing cloud main for host+project, so two profiles on one machine share the main workspace id — one cloud row, each profile with its own local row/path. The shared row's `branch` reflects whichever profile ensured it last; each app renders its own local row, so only other-machine presence viewers see it.

**4. Dev bootstrap** — `.superset/lib/setup/{steps,main}.sh`
Workspace setup no longer copies prod `~/.superset` DBs (host.db / local.db) into `superset-dev-data/` — the host-service migrates fresh per-org DBs on boot, decoupling dev from prod migration state (a stale prod copy is how the "duplicate column" boot crash happened). Auth-token seeding stays. Consequence: first workspace create in a fresh dev workspace fails `PRECONDITION_FAILED "Project is not set up on this host"` until the project is linked once via "set up on this device" (`project.setup`).

**5. Removed** — `@electric-sql/client` + `@tanstack/electric-db-collection` deps (both apps), `NEXT_PUBLIC_ELECTRIC_URL` env/CSP/vite hooks.

## Reproduce / verify

```bash
# Unit
bun test apps/desktop/src/.../CollectionsProvider/mergeWorkspacePresence.test.ts   # 8 pass
bun test packages/host-service/src/runtime/cloud-presence-outbox/                  # 7 pass
bun test packages/host-service/src/db/workspace-identity.test.ts                   # 2 pass
bun run --filter=@superset/trpc test                                               # incl. masking

# Live (signed-in dev app)
RENDERER_REMOTE_DEBUG_PORT=9222 bun dev
bun run apps/desktop/scripts/cdp-smoke-integrations.ts   # masked integrations path
```

Headless lifecycle check (no UI needed) — drive the dev host-service directly; the
bearer token is in `superset-dev-data/host/<org>/manifest.json` (endpoint too):

```bash
H=<endpoint>/trpc; A="Authorization: Bearer <authToken>"
curl -H "$A" $H/workspace.localList                        # local source of truth
curl -H "$A" $H/workspace.pendingCloudDeletes              # the exact presence mask
curl -X POST -H "$A" -H 'Content-Type: application/json' $H/workspaces.create \
  -d '{"json":{"projectId":"<id>","name":"smoke","branch":"smoke/e2e"}}'
curl -X POST -H "$A" -H 'Content-Type: application/json' $H/workspaceCleanup.destroy \
  -d '{"json":{"workspaceId":"<id>","deleteBranch":true}}'
```

Verified 2026-07-03 against the live dev stack: unlinked-project create fails clean
(`PRECONDITION_FAILED`), `project.setup` import links + ensures main, create commits
locally and mirrors (empty outbox, `createdByUserId` backfilled), destroy returns
`cloudDeleted/worktreeRemoved/branchDeleted` all true with zero residue.

Manual checks in the running app:
1. **No Electric traffic**: DevTools network — zero `/v1/shape` requests.
2. **Local-first read**: workspaces list renders from `workspace.localList` (host-service log) even with Wi-Fi off.
3. **Cross-machine rename converges**: rename a workspace via the cloud endpoint only (simulates another machine), watch the local SQLite row adopt it within ~2 polls:
   ```bash
   sqlite3 <host.db> "SELECT name, updated_at FROM workspaces WHERE id='<id>';"
   ```
   Reverse direction: update the local row's `name` + `updated_at` directly in sqlite, confirm cloud `v2Workspace.list` shows it a poll later.
4. **Freshness**: changes made elsewhere appear within 5s (3s for workspaces) — this is the polling trade-off, was instant with Electric.

## Review focus (ranked)

1. **Secret masking** in `sync.pull` — the security boundary. Check every table case selects explicit columns where secrets exist.
2. **`mergeWorkspacePresence` rules** — the only place that can hide or destroy identity data. Two subtle ones: the backfill rule (`updatedAt === createdAt` → cloud wins) and the presence mask (only outbox-pending delete ids — anything keyed on `hostId` hides another profile's or a reset machine's workspaces; that regression shipped briefly and is fixed in this PR).
3. **Migration 0008** — regenerated after the main merge (main took 0006/0007). All nullable ADD COLUMNs; verify the journal is drizzle-generated, not hand-edited.
4. **Failure semantics in `fetchWorkspaces`** — throw (keep snapshot) vs empty (wipe): local side throws when nothing cached, cloud side degrades to cache/empty.
5. **Poll intervals** — 5s/3s per client per org; sanity-check API load expectations.

## Not in this PR

- Electric infra teardown (`plans/20260702-electric-infra-teardown.md`) — needs a clean `bun setup` run to merge.

