# Move workspace authority from Neon `v2_workspaces` to the host-service local table (offline-first)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template. The design decisions it implements were made in `plans/20260703-offline-first-workspace-table.md` (the design audit); this plan restates everything needed, so the audit is background reading, not a dependency.

## Purpose / Big Picture

A "workspace" in Superset v2 is a git worktree on a specific machine, wrapped with a name, a branch, and terminal/agent sessions. Today the canonical record of every workspace lives in a cloud Postgres table (`v2_workspaces` in Neon), even though the thing it describes is entirely local to one machine. Consequence: creating, renaming, or deleting a workspace requires a synchronous round-trip to the cloud, and the cloud mints the workspace's UUID — so with no internet you cannot create a workspace at all, and deletes block the UI waiting for a cloud sync round-trip.

After this plan is implemented, the host-service (a per-organization daemon that runs on the user's machine and already owns the git worktrees) owns the workspace records outright in its local SQLite database. Creating, renaming, listing, and deleting workspaces works with zero cloud availability. The desktop app reads workspaces directly from host-services instead of a cloud sync stream. The cloud table, its tRPC router, its Electric sync shape, and the orphaned `apps/web` workspace pages are deleted.

Observable outcome at the end: disconnect the machine from the network, launch the desktop app, and create a new workspace — it appears in the sidebar, gets a worktree on disk, opens a terminal, and can be renamed and destroyed, all offline. Reconnect, and workspaces on other machines ("hosts") reappear in the sidebar via direct host-to-host queries.

## Decisions already made (summary)

These were decided in the design walkthrough and are not up for re-litigation here:

1. Host-service owns workspaces outright; no cloud `v2_workspaces` usage remains.
2. Cross-host visibility: each client fans out to hosts itself (local host directly, remote via relay) and merges. Rationale: the client owns what it sees; a host serves only what it has; no client depends on a host-service aggregator, so mobile/web/CLI can consume hosts the same way. (A brief 2026-07-04 revision moved fan-out into the local host-service with a `peer_workspaces` cache; Kiet reverted it the same day during the decision re-walkthrough.)
3. Automations denormalize `hostId`/`projectId` onto the automation row at create time (the cloud-side `verifyWorkspaceInOrg` check is deleted); a host rejects runs for workspace ids it doesn't have.
4. The desktop renderer reads workspaces through a fan-out hook: parallel per-host `workspace.list` queries merged client-side, live-updated by `workspace:changed` events, with per-host query caches persisted to IndexedDB so remote machines' last-seen lists survive restarts. Not a TanStack DB collection; nothing v1 (`packages/local-db`) is touched. The local host needs no cache — its daemon is on the same machine, so own-machine workspaces are always live, even offline.
5. The cloud list endpoint is deleted; MCP/CLI/SDK clients resolve connected hosts and query each host directly.
6. Both `apps/web` `/workspaces` pages are deleted (they are orphaned — nothing links to them).
7. A host serves its workspace list to any caller whose JWT carries the host's organizationId (parity with today's Electric shape scoping). No cloud lookup in the host's read path.
8. Staged rollout with read-through fallback: R1 host backfill + dual-write, R2 desktop reads flip to the fan-out hook (falling back to still-synced cloud rows no host returned), R3 cloud surface deleted. The legacy cloud path stays fully operational until telemetry shows old-client usage is negligible — the R3 gate is adoption, not a date.

## Context and Orientation

This is a Bun + Turborepo monorepo. The apps and packages touched by this plan:

- `packages/db` — Drizzle ORM schema for the cloud Neon Postgres database. The table being retired is `v2_workspaces` (`packages/db/src/schema/schema.ts:531`): columns `id, organizationId, projectId, hostId, name, branch, type ('main'|'worktree'), createdByUserId, taskId, createdAt, updatedAt`, with a partial unique index enforcing one `type='main'` workspace per (projectId, hostId).
- `packages/trpc` — cloud API routers served by `apps/api`. The workspace router is `packages/trpc/src/router/v2-workspace/v2-workspace.ts` (create, list, getFromHost, setTask, update, updateNameFromHost, delete, deleteMainForHost). The automation router (`packages/trpc/src/router/automation/automation.ts`) reads `v2_workspaces` in `verifyWorkspaceInOrg` (line ~83); automation dispatch (`dispatch.ts`) never reads it.
- `packages/host-service` — the per-org daemon. It exposes a tRPC API over HTTP (`/trpc`) and WebSockets (`/events`, `/terminal/*`) on a local port; the Electron app spawns one per organization (`apps/desktop/src/main/lib/host-service-coordinator.ts`). Its own SQLite database ("host.db", one file per org at `~/.superset/host/<orgId>/host.db`, opened in `packages/host-service/src/db/db.ts`) already has a thin `workspaces` table (`packages/host-service/src/db/schema.ts:165`) mapping cloud workspace id → `worktreePath`, `branch`, `headSha`, PR linkage. Migrations live in `packages/host-service/drizzle` and are generated with `bunx drizzle-kit generate` (never hand-edit generated files, per AGENTS.md).
- `packages/local-db` — the v1-era desktop-main SQLite database (`~/.superset/local.db`). **Explicitly untouched by this plan** (the v1 world is sunset); listed only so a reader doesn't confuse it with host.db.
- `apps/desktop` — Electron app. Two tRPC transports exist renderer-side: (a) Electron IPC-tRPC to the main process (`apps/desktop/src/renderer/lib/trpc-client.ts`, `electron-trpc.ts` — supports live subscriptions, e.g. `auth.onTokenChanged.useSubscription` in `AuthProvider.tsx:58`), and (b) HTTP tRPC to host-services (`packages/workspace-client`, `apps/desktop/src/renderer/lib/host-service-client.ts`). The renderer currently reads workspaces from an Electric-synced TanStack DB collection `collections.v2Workspaces` (`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts:472`), consumed by roughly 25 `useLiveQuery` call sites (sidebar, routing, command palette, notifications, automations pages).
- `apps/electric-proxy` — Cloudflare Worker gatekeeping Electric SQL sync; the `v2_workspaces` shape is org-scoped in `src/where.ts:70`.
- `apps/web` — has two orphaned pages under `apps/web/src/app/workspaces/` to delete.
- `packages/mcp-v2`, `packages/cli`, `packages/sdk` — external clients that call `v2Workspace.list` / pass `v2WorkspaceId` for automations.

Terms used below:

- "Host" — a machine running a host-service daemon, registered in the cloud `v2_hosts` table (which stays cloud-owned; only workspaces move).
- "Relay" — the cloud tunnel that routes HTTP/WS to a host by routing key `buildHostRoutingKey(orgId, hostId)`; remote host URLs look like `${relayUrl}/hosts/<routingKey>`.
- "Electric" — Electric SQL, the Postgres→client sync engine feeding the renderer's TanStack DB collections. Its per-table subscriptions are called "shapes".
- "`/events` bus" — host-service's WebSocket event stream (`packages/host-service/src/events/`), currently emitting `git:changed`, `port:changed`, `agent:lifecycle`, `terminal:lifecycle`, `fs:events`. There are no workspace lifecycle events today; this plan adds them.
- "Fan-out hook" — the new renderer hook that queries every known host's `workspace.list` in parallel and merges the results; "IndexedDB" — the browser's built-in local database, used here to persist each remote host's last-seen list across restarts.

Key current-state facts the plan relies on (verified in the audit):

- Workspace create flows renderer → host-service `workspaces.create` → `registerCloudAndLocal` (`packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts:439`), which creates the worktree, then calls cloud `v2Workspace.create` (cloud mints the UUID), then inserts the thin local row. Cloud unreachable ⇒ create fails, worktree rolled back.
- Renderer rename/update calls the cloud API directly (`v2Workspace.update`), bypassing host-service — this path must be unified through the host.
- Deletes run through host-service's cleanup saga, which calls cloud `v2Workspace.delete`; the UI waits for the Electric shape to drop the row (`waitForWorkspaceDeleted`).
- Nothing cloud-side ever reads `chat_sessions.v2WorkspaceId` or `v2Workspaces.taskId`; they're write-only tags consumed client-side. `apps/api` routes and `apps/mobile` have zero references to v2 workspaces.
- The sidebar ports hook (`useDashboardSidebarPortsData.ts:65-102`) is the existing template for "query N hosts in parallel, merge, patch from WS events".
- PostHog `workspace_created` / `workspace_deleted` events are captured inside the cloud router today (`v2-workspace.ts:256, 611`) and must move to host-service.

## Assumptions

- The relay forwards an `Authorization: Bearer <JWT>` header to the host unchanged, and the host can validate that JWT and read an `organizationIds` claim from it. Automation dispatch already sends a minted user JWT through the relay (`dispatch.ts:90-97`), so some host-side acceptance path exists — Milestone 1 starts by verifying exactly how (`PskHostAuthProvider` vs a JWT provider) and extending it if needed. If the host cannot validate JWTs today, add a JWT validation path to the host auth provider using the same JWKS/config the cloud uses (`SUPERSET_AUTH_CONFIG_PATH` is already provided to the host).
- Old desktop builds keep working through R1 and R2 because the cloud router and Electric shape survive until R3.
- Neon migrations follow the AGENTS.md DB rules: schema changes in `packages/db/src/schema/`, generated with `bunx drizzle-kit generate` on a Neon branch, and the user runs/coordinates the actual migration — never run one autonomously.

## Open Questions

- How does a host authenticate relay-forwarded JWTs today? (Impacts Milestone 1; Decision Log placeholder D-auth.) Resolve by reading `packages/host-service/src/auth/` and the relay code before writing the list endpoint.
- Should the R2 read-through fallback consume the still-live Electric collection (renderer-side merge) or a cloud call from the host-service? Plan prescribes renderer-side merge with the existing collection since it's already synced and persisted (Decision Log D-fallback); revisit if consumer code gets tangled.

## Progress

- [x] (2026-07-04) Milestone 1 (R1): host.db owns full workspace rows — schema migration 0008 (name/type/taskId/createdByUserId/updatedAt/cloudSyncedAt + one-main-per-project partial index + `workspace_cloud_deletes` tombstones); `workspace:changed` on the `/events` bus; local-first writes with host-minted UUIDs across create/adopt/ensure-main/AI-rename/destroy/project-remove; cloud dual-write via `pushWorkspaceCreateToCloud` with per-row LWW name merge; 60s reconciler; startup backfill; `workspace.list`/`workspace.update` endpoints; is-main check reads local `type`. Typecheck, lint, and the full host-service suite (751 pass / 0 fail) are green.
- [x] (2026-07-05) M1 offline drill, executed against the real dev desktop over CDP: backfill verified on boot (39/39 rows populated, 0 unbackfilled); with the dev API killed, `workspaces.create` succeeded (host-minted id, txid null, worktree + branch on disk, `workspace:changed created` observed on `/events`, `cloud_synced_at` NULL); API restored → reconciler pushed within ~25s and the workspace appeared in the renderer sidebar via cloud→Electric (CDP DOM assert + screenshot); API killed again → `workspaceCleanup.destroy` succeeded offline (`cloudDeleted:false`, "Cloud delete deferred" warning, row gone, tombstone queued, worktree+branch removed, `deleted` event observed); API restored → tombstone drained in ~50s and the workspace disappeared from the renderer (CDP assert). Milestone 1 acceptance is fully met.
- [x] (2026-07-04) Milestone 2 (R1, cloud side): client-minted id acceptance already existed on `create`; automation create/update now accept a fully denormalized pin (`v2WorkspaceId`+`targetHostId`+`v2ProjectId` → no `verifyWorkspaceInOrg`, legacy branch kept for old clients until R3). PostHog capture move DEFERRED to R3 (see Decision Log) — cloud capture keeps working through dual-write with no double-counting.
- [ ] Milestone 3 (R2): renderer fan-out layer — per-host queries, `workspace:changed` subscriptions, IndexedDB persistence
- [ ] Milestone 4 (R2): renderer consumers flip to the fan-out hook; writes unify through host; cloud read-through fallback
- [ ] Milestone 5 (R2): MCP/CLI/SDK query hosts directly
- [ ] Milestone 6 (R3): delete the cloud surface (router, shape, proxy case, Electric collection, web pages, FK, table)

## Surprises & Discoveries

- Observation: No host-side JWT validation is needed at all (D-auth resolved better than assumed).
  Evidence: the relay verifies the caller's JWT and org membership (`apps/relay/src/access.ts:31`, plus a cached `host.checkAccess`), and the tunnel client rewrites the Authorization header to the host's own PSK before forwarding (`packages/host-service/src/tunnel/tunnel-client.ts:247,282`). `protectedProcedure` was already the right gate for both local and relay callers.
- Observation: Cloud `v2Workspace.create` already accepted a client-supplied `id` (used as an optimistic-UI idempotency key), so Milestone 2's id work was pre-existing.
  Evidence: `packages/trpc/src/router/v2-workspace/v2-workspace.ts:199`.
- Observation: Dual-write has a two-writer hazard on `name`/`taskId`: renderer renames still write the cloud directly in R1, so a host push could clobber a newer cloud-side rename.
  Evidence: handled with per-row last-write-wins in `pushWorkspaceCreateToCloud` — branch is always host-truth; name/taskId go to whichever side has the newer `updatedAt` (clock-skew-tolerant enough for the transitional era; gone in R3).
- Observation: `ensureMainWorkspaceStrict` no longer fails the create-project saga on cloud unavailability — the local main row commits and the reconciler pushes later. The saga's own cloud project commit still gates the fully-offline case.
- Observation: Destroy semantics changed shape: the local row delete is the commit point (broadcast + tombstone), cloud delete degrades to a warning, and a sqlite row-delete failure is now a hard error instead of a warning. Offline deletes replay via `workspace_cloud_deletes` tombstones. Six test files were updated to pin the new contract (`workspace-cleanup.test.ts`, `workspace-cleanup.integration`, `workspace-create-delete.integration`, `workspace-create-pr.integration`, `bug-hunt-2/4`).
- Observation: PR-runtime branch-rename detection writes the local row directly without events; flagged cloud-dirty for the reconciler, but R2's live view will want a `workspace:changed` emit there too (noted for Milestone 3/4).
- Observation: In the dev environment, a few backfilled `main` rows stay permanently cloud-dirty because their local project no longer exists in the cloud org ("Project not found in this organization"); the reconciler correctly logs and retries each pass without crashing. Harmless-but-noisy — R2 could add a permanent-rejection classifier that stops retrying rows the cloud rejects with BAD_REQUEST/NOT_FOUND.
  Evidence: dev drill 2026-07-05, three pre-existing stale rows in the dev org's host.db.

## Decision Log

- Decision: SUPERSEDED (2026-07-04) — the mirror was originally a `host_workspaces` table in `packages/local-db` read over Electron IPC-tRPC, with the renderer supplying the host set to a main-process syncer. Kiet directed the plan to be v2-scoped only; `packages/local-db` and the main-process plumbing are v1-era surface.
- Decision: SUPERSEDED (2026-07-04, same day) — the host-side `peer_workspaces` cache + `workspace.listAll` aggregation was reverted during the full decision re-walkthrough.
- Decision: The renderer performs the fan-out itself: parallel `workspace.list` queries per known host, merged in a hook, live-updated by per-host `workspace:changed` subscriptions, with the per-host query caches persisted to IndexedDB (idb-keyval, precedent in `ElectronTRPCProvider.tsx:31-84`) so remote hosts' last-seen lists survive restarts. No host-side peer replication of any kind.
  Rationale (Kiet): the client owns what it sees and a host-service serves only what it has; with no aggregation layer, other clients (mobile, web, CLI) can consume hosts the same way without depending on a host-service being up as an aggregator. The local host is always reachable offline, so persistence only affects visibility of other machines.
  Date/Author: 2026-07-04 / Kiet via decision re-walkthrough.
- Decision: Host backfill iterates its existing local rows and calls cloud `v2Workspace.getFromHost` per id to fetch the missing fields (name/type/taskId/createdByUserId/timestamps).
  Rationale: getFromHost is org-scoped and already used by the host; per-id iteration avoids adding a new cloud endpoint that would be deleted two releases later. Rows missing locally entirely are covered by the R2 read-through fallback.
  Date/Author: 2026-07-03 / plan authoring.
- Decision: Cloud `v2Workspace.create` gains an optional client-supplied `id` (uuid) in R1 so the host can mint ids locally and dual-write the same id to the cloud.
  Rationale: offline create requires local id minting; during dual-write both stores must agree on the id. Additive and backward compatible (old clients omit it).
  Date/Author: 2026-07-03 / plan authoring.
- Decision: D-auth RESOLVED (2026-07-04) — no host-side change: the relay already enforces JWT org membership + host access before forwarding, and the tunnel rewrites Authorization to the host PSK, so `protectedProcedure` covers local and relay callers alike.
  Date/Author: 2026-07-04 / implementation (Milestone 1).
- Decision: PostHog `workspace_created`/`workspace_deleted` capture stays cloud-side until R3 (instead of M2's planned host-side capture with a gated cloud capture).
  Rationale: deletes carry no marker distinguishing self-capturing hosts, so dual-capture would double-count them; dual-write means the cloud router still observes every create (possibly late, via reconcile) and delete (via tombstone replay), so events keep flowing with zero double-counting. Capture moves into host-service in R3 when the cloud router is deleted.
  Date/Author: 2026-07-04 / implementation (Milestone 2).
- Decision: D-fallback — R2 read-through fallback merges the still-synced Electric `v2Workspaces` collection renderer-side rather than adding a main-process cloud client.
  Rationale: the collection is already persisted offline and being deleted in R3 anyway; the merge lives in one hook and is deleted with it.
  Date/Author: 2026-07-03 / plan authoring (revisit if hook complexity grows).

## Outcomes & Retrospective

(to be written at closeout)

## Plan of Work

The work is three releases. Cloud/API changes always deploy before desktop releases that call them (existing team convention). Each milestone below is independently shippable and verifiable.

### Milestone 1 (R1): host.db owns full workspace rows

Scope: make the host's `workspaces` table a complete, authoritative record, kept in sync with the cloud by dual-write, and expose it.

1. Schema. In `packages/host-service/src/db/schema.ts`, extend the `workspaces` table with `name` (text, not null, default ""), `type` (text `'main' | 'worktree'`, not null, default `'worktree'`), `taskId` (text, nullable — a uuid pointing at the cloud `tasks` table, no FK), `createdByUserId` (text, nullable), `createdAt` / `updatedAt` (integer epoch-ms, not null, defaulted). Add a partial unique index `workspaces_one_main_per_project` on `(project_id)` where `type = 'main'` (host.db is per-org-per-machine, so projectId alone is the right key — this replicates the cloud's one-main-per-host invariant). Generate the migration: `cd packages/host-service && bunx drizzle-kit generate --name="workspace_full_fields"`. Never hand-edit files under `packages/host-service/drizzle/`.
2. Backfill. New module `packages/host-service/src/runtime/workspace-backfill.ts`: on startup (register next to `runMainWorkspaceSweep` in `app.ts:148`), for each local workspace row whose `name` is empty/default, call `ctx.api.v2Workspace.getFromHost` and patch the local row with name/type/taskId/createdByUserId/createdAt/updatedAt. Idempotent (skips filled rows), tolerant of cloud unavailability (logs and retries next startup). Mark completion in `hostSettings` so steady-state startups skip the sweep.
3. Local-first writes with cloud dual-write. Invert `registerCloudAndLocal` (`workspace-creation.ts:439`): mint the UUID host-side (`crypto.randomUUID()`), insert the full local row first, emit the workspace event (step 4), then push to cloud `v2Workspace.create` with the explicit id, best-effort. A cloud push failure no longer rolls back the worktree or the local row; it marks the row `cloudSyncedAt = null` (add that nullable column in the same migration) and a small startup/interval reconcile loop retries unsynced creates/updates/deletes. Apply the same local-first pattern to rename (`ai-workspace-names.ts`, and the new `workspaces.update` endpoint in step 5), delete (`workspace-cleanup.ts:369` — local row deleted immediately, cloud delete queued), main-workspace ensure (`ensure-main-workspace.ts`), and adoption (`adopt-existing-worktree.ts`).
4. Lifecycle events. In `packages/host-service/src/events/types.ts` add a server→client event `workspace:changed` with payload `{ kind: 'created' | 'updated' | 'deleted', workspace: <full local row> }` (for `deleted`, id-only is acceptable). Emit from every local write path in step 3 via the EventBus (`packages/host-service/src/events/event-bus.ts`), broadcast to all clients of the host (not filtered by workspaceId — list consumers subscribe host-wide).
5. Read/write endpoints. In `packages/host-service/src/trpc/router/workspace/workspace.ts` add `workspace.list` returning all full local rows plus `worktreeExists` per row, and `workspace.update` (rename / set-task) writing locally per step 3. Change `is-main-workspace.ts:57` to read the local `type` column instead of calling the cloud.
6. Authorization. Resolve open question D-auth: confirm/implement that requests arriving with a Bearer JWT (relay path) are accepted iff the JWT's organizationIds contains the host's `ORGANIZATION_ID`; PSK auth (local desktop path) is unchanged. Apply to `workspace.list`/`workspace.update` like every other `protectedProcedure`.

What exists at the end: a host answers `workspace.list` with complete rows, works through create/rename/delete with the network cable pulled, and emits `workspace:changed` events. The cloud table still receives every write (dual-write), so old desktop builds are unaffected.

Acceptance:

    cd packages/host-service && bun run build && bun run typecheck
    # unit tests for backfill + reconcile modules:
    bun test packages/host-service
    # Manual: start desktop dev, create a workspace with Wi-Fi off,
    # observe local row via: sqlite3 ~/.superset/host/<orgId>/host.db 'select id,name,type,cloud_synced_at from workspaces'
    # Re-enable network, observe cloud_synced_at populate after reconcile.

### Milestone 2 (R1, cloud side): id acceptance, automation denormalization, analytics

1. In `packages/trpc/src/router/v2-workspace/v2-workspace.ts`, `create` accepts optional `id: z.string().uuid()`; insert uses it when present (keep `onConflictDoNothing` idempotency).
2. Automations: `createAutomationSchema`/update schema accept explicit `targetHostId` and `v2ProjectId` alongside `v2WorkspaceId`; when all are supplied, skip `verifyWorkspaceInOrg` (delete the function in R3 once all clients send them). `verifyProjectInOrg`/`verifyHostAccess` checks stay. Dispatch is untouched — it already routes off the denormalized `targetHostId` and uses `automation.v2WorkspaceId` verbatim.
3. PostHog: host-service captures `workspace_created` / `workspace_deleted` (same properties as `v2-workspace.ts:256-273, 611-622`, sourced from local rows). Cloud-side captures are removed in R3 (dual-capture during R1/R2 would double-count, so gate the cloud capture off when the create carries a client-supplied id — that marks a host that captures for itself).

Acceptance: `bun run typecheck && bun test packages/trpc`; create a workspace from a new host build and verify exactly one `workspace_created` PostHog event.

### Milestone 3 (R2): renderer fan-out layer with persistent per-host cache

All work in this milestone lives in the renderer and `packages/workspace-client` — no new host-service or Electron-main surface, nothing v1.

1. Persistence. Attach an IndexedDB persister (idb-keyval; the repo precedent is `apps/desktop/src/renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider.tsx:31-84`) to the per-host `QueryClient`s created in `packages/workspace-client/src/providers/WorkspaceClientProvider/WorkspaceClientProvider.tsx`, whitelisted to workspace-list query keys, keyed per host URL. Each remote host's last-seen list now survives app restarts.
2. Fan-out hook. New hook `apps/desktop/src/renderer/hooks/host-workspaces/useHostWorkspaces/`: derive one query target per known host — the host set comes from the `v2Hosts` Electric collection (hosts stay cloud-owned) plus the local coordinator's `activeHostUrl`; the sidebar ports hook (`useDashboardSidebarPortsData.ts:65-102`) is the exact template. Run parallel `useQueries` against each host's `workspace.list`, merge rows tagged with `hostId` and reachability, and subscribe per host to `workspace:changed` on the existing `/events` client (`useWorkspaceEvent` / `packages/workspace-client/src/lib/eventBus.ts`), patching or invalidating the matching query. Unreachable hosts render their persisted last-seen rows.
3. Read-through fallback (Decision D-fallback). Inside the same hook, merge in any row present in the still-synced Electric `collections.v2Workspaces` whose id no host returned — this covers org hosts still on pre-R1 builds (no `workspace.list` yet) and rows the backfill hasn't reached. Honor the AGENTS.md cache-first rule: existing rows always render; readiness gates only the empty state.

What exists at the end: a hook that returns the live merged workspace list across all hosts, offline-correct for the local host (its daemon is on-machine) and last-seen for remote hosts. Nothing consumes it yet.

Acceptance:

    bun test apps/desktop/src/renderer/hooks/host-workspaces
    # Manual: run desktop dev with a second host in the org; create/rename/delete on it and watch
    # the hook's output update live. Take the peer offline and relaunch the app: its rows still
    # render from IndexedDB, flagged unreachable.

### Milestone 4 (R2): renderer consumers flip to the fan-out hook; writes unify through the host

1. Migrate the ~25 `useLiveQuery(… collections.v2Workspaces …)` call sites to Milestone 3's `useHostWorkspaces` (sidebar data, layout guards, top bar, command palette, notifications, automations pages, `useAccessibleV2Workspaces`, `useNavigateAwayFromWorkspace`, `sidebarMutations`). The hook returns rows shaped like today's `SelectV2Workspace` plus `worktreePath`/`hostReachable`, so most call sites change mechanically. Joins against `v2Hosts`/`v2Projects` collections move into the consuming hooks (the ports hook at `useDashboardSidebarPortsData.ts` is the template for mixing collection reads with host-backed reads).
2. Writes. Create already goes renderer → host `workspaces.create`; keep it, but confirmation now comes from the local host (the optimistic entry in `useWorkspaceCreates` resolves when the `workspace:changed` event delivers the row) instead of Electric txid matching. Rename/update: replace direct cloud `v2Workspace.update` calls in `useOptimisticCollectionActions` with host `workspace.update`. Delete: replace `waitForWorkspaceDeleted` (Electric) with waiting for the `workspace:changed` deletion event.
3. Delete the `onInsert`/`onUpdate` mutation handlers from the Electric `v2Workspaces` collection definition (it becomes read-only fallback data until R3 removes it).

What exists at the end: the desktop renders, creates, renames, and destroys workspaces entirely against host data — full offline operation for the local host; remote hosts render from the last-seen IndexedDB cache.

Acceptance:

    bun run typecheck && bun run lint && bun test apps/desktop
    # Manual offline drill: Wi-Fi off → launch app → sidebar populated from the local host-service →
    # create workspace → appears immediately, worktree exists → rename → destroy.
    # Wi-Fi on → second machine's workspaces reappear and live-update.

### Milestone 5 (R2): external clients query hosts directly

Rewrite `packages/mcp-v2/src/tools/workspaces/list.ts` to resolve hosts (cloud `v2Host.list`, which stays) and query each online host's `workspace.list` over the relay with the caller's JWT, merging results; same for the CLI's `--workspace` resolution and the SDK surface (document that listings reflect online hosts only). MCP/CLI automation create/update now send `targetHostId`/`v2ProjectId` explicitly (from the picked workspace row, which carries both). Acceptance: `bun test packages/mcp-v2 packages/cli packages/sdk`, plus a manual MCP `workspaces_list` call returning rows sourced from a live host.

### Milestone 6 (R3): delete the cloud surface

Gate: ship only when desktop adoption of the R2 build is high (PostHog desktop-version dashboard) — old builds lose workspace lists the moment the shape empties.

1. Host-service: remove the cloud dual-write/reconcile paths and the `cloudSyncedAt` bookkeeping; remove `ctx.api.v2Workspace.*` usage everywhere (`workspaces.ts`, `ensure-main-workspace.ts`, `adopt-existing-worktree.ts`, `workspace-cleanup.ts`, `ai-workspace-names.ts`).
2. Desktop: remove the Electric `v2Workspaces` collection definition and the read-through fallback merge in `useHostWorkspaces`. (The legacy v1 `workspaces` collection is out of scope — it belongs to the v1 sunset, not this plan.)
3. Cloud: delete `packages/trpc/src/router/v2-workspace/` and its router registration; delete `verifyWorkspaceInOrg` (automation schemas now require `targetHostId`+`v2ProjectId` when pinning); remove only the `v2_workspaces` case from `apps/electric-proxy/src/where.ts` (the legacy `workspaces` case stays); delete both `apps/web/src/app/workspaces/` pages.
4. Neon schema: in `packages/db/src/schema/`, drop the `chat_sessions.v2WorkspaceId` foreign-key reference (column becomes a plain uuid tag), drop the `v2WorkspacesRelations` and inverse relations, then drop the `v2_workspaces` table. Generate with `bunx drizzle-kit generate --name="drop_v2_workspaces"` on a Neon branch per AGENTS.md DB rules, and hand the migration to the user to run — do not run it autonomously. Sequence the FK drop before the table drop in the same migration.
5. Sweep: `rg -n "v2Workspace|v2_workspaces|v2Workspaces" --hidden -g '!*.sql' -g '!node_modules'` must return only historical migrations, `automation` columns (`v2WorkspaceId` tags, which stay), and this plan.

Acceptance: full CI (`bun run typecheck && bun run lint && bun test && bun build`), the grep sweep above, and the Milestone 4 offline drill re-run on the R3 build.

## Concrete Steps

Work happens in this monorepo root (`bun install` already done). Per-milestone commands are listed in each milestone's Acceptance block. Universal validation before every push (AGENTS.md rule 7 — CI fails on Biome warnings):

    bun run lint:fix && bun run lint   # must exit 0 with no output
    bun run typecheck
    bun test

Migration generation commands (never hand-edit generated drizzle files):

    cd packages/host-service && bunx drizzle-kit generate --name="workspace_full_fields"
    # R3 Neon migration is generated on a Neon branch and RUN BY THE USER, not the agent.

## Validation and Acceptance

The single end-to-end acceptance story, run after Milestone 4 and again after Milestone 6:

    # 1. Turn off networking on the machine.
    # 2. bun dev → launch the desktop app.
    # 3. Sidebar shows all previously-seen workspaces (local host live, remote hosts cached).
    # 4. Create a workspace: appears instantly, `git worktree list` shows the new worktree,
    #    a terminal opens inside it.
    # 5. Rename it; destroy another one — both complete without any spinner waiting on sync.
    # 6. Re-enable networking: (R1/R2 only) cloud rows reconcile; a second machine's
    #    workspaces reappear and live-update when changed remotely.

Each milestone also carries its own `bun test` / `typecheck` / manual sqlite3-inspection acceptance, listed inline above.

## Idempotence and Recovery

- Host backfill and the cloud reconcile loop are written to be re-runnable: they skip already-filled/synced rows and tolerate cloud downtime.
- The R1 dual-write means either store can be rebuilt from the other until R3; if host.db is lost in R1/R2, the backfill plus read-through fallback restore it.
- Milestones 1–5 are individually revertable by normal git revert; nothing destructive happens until Milestone 6's Neon migration, which is why it's user-run and gated on adoption.
- If Milestone 4 regresses the renderer, the Electric collection is still syncing (it's only deleted in R3), so reverting the renderer commit fully restores the old read path.

## Interfaces and Dependencies

New/changed interfaces that must exist (names are prescriptive):

    // packages/host-service — trpc/router/workspace/workspace.ts
    workspace.list:   protectedProcedure.query() => Array<HostWorkspace & { worktreeExists: boolean }>
    workspace.update: protectedProcedure.input({ workspaceId, name?, taskId? }).mutation()

    // packages/host-service — events/types.ts
    { type: "workspace:changed",
      payload: { kind: "created" | "updated" | "deleted", workspace: HostWorkspace } }

    // packages/trpc — v2-workspace create input (R1, removed in R3)
    create.input: { ...existing, id?: string /* uuid, client-minted */ }

    // apps/desktop — renderer/hooks/host-workspaces/useHostWorkspaces (R2)
    useHostWorkspaces(): {
      workspaces: Array<SelectV2WorkspaceShape & { worktreePath?: string;
                                                   hostReachable: boolean }>
      isReady: boolean
    }

    // packages/workspace-client — WorkspaceClientProvider (R2)
    // per-host QueryClient gains an IndexedDB persister whitelisted to
    // workspace-list query keys (idb-keyval)

No new third-party libraries are required; every mechanism (drizzle SQLite migrations, per-host HTTP tRPC clients, `/events` WebSockets, reconnect backoff) already exists in the repo and is named above as the template to copy.

---

Revision note (2026-07-04, first pass): Rescoped to v2-only at Kiet's direction. The desktop-side mirror (new table in `packages/local-db`, Electron-main syncer, IPC-tRPC surface) was replaced by a `peer_workspaces` cache inside the local host-service's host.db. Legacy v1 surfaces (v1 `workspaces` Neon table, its Electric shape/collection, `packages/local-db`) became explicitly out of scope.

Revision note (2026-07-04, second pass — full decision re-walkthrough with Kiet): The host-side `peer_workspaces` cache/aggregation was reverted. Final read path: the renderer fans out per-host `workspace.list` queries itself, merged in `useHostWorkspaces`, live-updated by per-host `workspace:changed` subscriptions, with per-host query caches persisted to IndexedDB. Rationale: the client owns what it sees; a host serves only what it has; no client depends on a host-service aggregator (keeps mobile/web/CLI viable consumers). Decision 8 clarified: the legacy cloud path stays operational until old-client usage is negligible — the R3 gate is adoption, not a date. Milestones 3–4, Decision Log, Interfaces, and Concrete Steps updated accordingly.
