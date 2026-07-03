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
- `mergeWorkspacePresence.ts` (pure, 7 tests): local rows win existence; other hosts' cloud rows appended; **identity reconciles both ways** — newer cloud renames adopted into local SQLite, newer local renames pushed to a stale cloud mirror, and never-locally-edited rows always adopt cloud (pre-flip local names are branch placeholders; LWW would clobber real names).
- `cloud_delete_outbox` (host-service): failed rollback cloud-deletes retried on boot + hourly. Deliberately an outbox, not a "delete cloud rows missing locally" sweep — dev and prod hosts share a machine-derived `hostId`, a sweep would nuke each other's presence.

**4. Removed** — `@electric-sql/client` + `@tanstack/electric-db-collection` deps (both apps), `NEXT_PUBLIC_ELECTRIC_URL` env/CSP/vite hooks.

## Reproduce / verify

```bash
# Unit
bun test apps/desktop/src/.../CollectionsProvider/mergeWorkspacePresence.test.ts   # 7 pass
bun test packages/host-service/src/runtime/cloud-delete-outbox/                    # 4 pass
bun test packages/host-service/src/db/workspace-identity.test.ts                   # 2 pass
bun run --filter=@superset/trpc test                                               # incl. masking

# Live (signed-in dev app)
RENDERER_REMOTE_DEBUG_PORT=9222 bun dev
bun run apps/desktop/scripts/cdp-smoke-integrations.ts   # masked integrations path
```

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
2. **`mergeWorkspacePresence` rules** — the only place that can destroy identity data. The backfill rule (`updatedAt === createdAt` → cloud wins) is the subtle one.
3. **Migration 0008** — regenerated after the main merge (main took 0006/0007). All nullable ADD COLUMNs; verify the journal is drizzle-generated, not hand-edited.
4. **Failure semantics in `fetchWorkspaces`** — throw (keep snapshot) vs empty (wipe): local side throws when nothing cached, cloud side degrades to cache/empty.
5. **Poll intervals** — 5s/3s per client per org; sanity-check API load expectations.

## Not in this PR

- Electric infra teardown (`plans/20260702-electric-infra-teardown.md`) — needs a clean `bun setup` run to merge.
- Offline create/delete (`plans/20260702-local-first-workspace-lifecycle.md`) — lifecycle writes still require cloud.
