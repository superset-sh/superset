# Offline-first workspaces: move `v2_workspaces` authority to host-service local table

Audit of current state + design decisions. Goal: a workspace should be creatable,
renamable, deletable, and renderable with zero cloud availability, because the thing
it represents (a git worktree on this machine) is entirely local.

## Current state (audited 2026-07-03)

### The three "workspace" tables

| Table | Store | Role |
|---|---|---|
| `v2_workspaces` | Neon (`packages/db/src/schema/schema.ts:531`) | **Canonical registry.** Org-scoped, one row per worktree/main workspace on any host. |
| `workspaces` (host.db) | Per-org SQLite (`packages/host-service/src/db/schema.ts:165`) | Partial mirror: cloud id → `worktreePath`, branch, headSha, PR link. **No name/type/taskId/timestamps** — cannot render a sidebar from it. |
| `workspaces` (local.db) | `packages/local-db` | v1 world (desktop main). Sunset; out of scope except as precedent. |

### Data flow today

- **Read (desktop renderer):** Electric shape `v2_workspaces` (org-scoped WHERE via
  `apps/electric-proxy/src/where.ts:70`) → TanStack DB collection
  (`apps/desktop/.../CollectionsProvider/collections.ts:472`) → persisted to
  `~/.superset/tanstack-db.sqlite`. Reads are already offline-capable (cache-first).
- **Create:** renderer optimistic insert → collection `onInsert` → host-service
  `workspaces.create` → `registerCloudAndLocal`
  (`packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts:439`):
  worktree created locally, then **inline cloud `v2Workspace.create`** (cloud mints the
  UUID), then host.db insert. Cloud down ⇒ create fails and worktree is rolled back.
- **Rename/update:** two paths — renderer → **cloud API directly**
  (`v2Workspace.update`, bypasses host-service), and AI rename → host-service → cloud
  `updateNameFromHost`. host.db is patched separately.
- **Delete:** renderer → host-service cleanup saga → cloud `v2Workspace.delete`; UI
  blocks on `waitForWorkspaceDeleted` until Electric drops the row.
- **Write confirmation:** optimistic state held until the mutation's Postgres `txid`
  replays over Electric (30s timeout).

### Why it's not offline-first

1. Every workspace **write** requires a synchronous cloud round-trip; the cloud mints
   workspace IDs, so offline create is structurally impossible.
2. host.db's workspace row is too thin to serve as a read model (no name/type/taskId).
3. Delete UX literally waits for a cloud→Electric round-trip.
4. Rename has two divergent write paths (renderer→cloud vs host→cloud), so any
   local-first change must unify them or fix both.

### Constraints that keep the cloud table alive

- **Multi-host visibility:** the sidebar/org list shows workspaces from *other* hosts
  (`useAccessibleV2Workspaces`); a local table only knows its own host.
- **Cloud FKs:** `chat_sessions.v2WorkspaceId`, `automation_runs.v2WorkspaceId`, and
  the one-main-per-host partial unique index all live in Neon.
- **apps/web** reads workspaces via plain tRPC (`v2Workspace.list/getFromHost`).
- So "move to local" realistically means **local authority + cloud projection**, not
  cloud removal.

## Cloud usage inventory (what actually needs `v2_workspaces`)

Every consumer of the cloud table, and what it truly needs. Notably: **apps/api and
apps/mobile have zero references**; nothing in the cloud ever *reads*
`chat_sessions.v2WorkspaceId` or `v2Workspaces.taskId` — those are write-only tags
consumed client-side over Electric.

| # | Consumer | Actual need | Deprecation path |
|---|---|---|---|
| 1 | Desktop renderer (Electric shape + ~25 `useLiveQuery` sites) | live org-wide workspace list | replace with host-backed collection + fan-out (Decisions 2, D-read) |
| 2 | apps/web `/workspaces` list+create (`page.tsx:78,179`) | per-user list; create. **Orphaned — no nav links into it** | delete or re-point at relay fan-out |
| 3 | apps/web `/workspaces/[id]` web terminal (`page.tsx:77`) | only `id → hostId` routing | carry hostId in URL, or drop |
| 4 | Automations (`automation.ts:83`, `dispatch.ts:104`) | verify workspace in org; derive `projectId`/`hostId` for relay routing | denormalize hostId/projectId onto automation row at create; or query host at dispatch |
| 5 | `chat_sessions.v2WorkspaceId` FK (`schema.ts:683`) | valid FK target on insert (never read in cloud) | drop FK → plain uuid tag |
| 6 | `v2Workspaces.taskId` (`setTask`, create/update) | write-only linkage, consumed on desktop via Electric | moves into host table; taskId = plain uuid → cloud task |
| 7 | Authz: `list` joins `v2_users_hosts`; electric-proxy scopes shape by org only | org membership + per-user host scoping | host/relay must enforce; note Electric today is org-scoped only, host scoping is already client-side |
| 8 | PostHog `workspace_created/deleted` (`v2-workspace.ts:256,611`) | analytics | capture from host-service instead |
| 9 | host-service `is-main-workspace.ts:57` (cloud `getFromHost` for `type`) | is-main check before cleanup | reads local table once `type` is local |
| 10 | MCP `workspaces_list`, CLI `--workspace`, SDK automation types | find workspace ids to pin automations | route through host fan-out or automation-create-time resolution |

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Source of truth | **Host-service owns workspaces outright.** No cloud `v2_workspaces` usage remains; all querying moves to the host service. |
| 2 | Cross-host visibility | **Renderer fans out to each known host** (local direct, remote via relay) and merges, caching the last-seen list per host. Offline remote hosts show the cached list. |
| 3 | Automations | **Denormalize at create + host rejects stale pins.** Client sends `hostId`/`projectId` alongside a pinned `v2WorkspaceId`; cloud stores without validating (`verifyWorkspaceInOrg` deleted). Dispatch already routes off the denormalized `targetHostId` and never reads `v2_workspaces`; the host naturally 404s on unknown workspace ids at run time — same stale-pin semantics as today, but attributable. |

### Decision 3 rationale (current-state walkthrough)

- The only cloud read of `v2_workspaces` in the automation world is
  `verifyWorkspaceInOrg` at automation create/update (`automation.ts:216-234`),
  used to validate the pin and derive `targetHostId`/`v2ProjectId`.
- Dispatch (`dispatch.ts:42`) never reads the workspace table: host resolution uses
  `v2Hosts`/`v2_users_hosts`; a pinned `v2WorkspaceId` is used verbatim
  (`dispatch.ts:104`); project-only automations mint a workspace on the host over
  relay (`dispatch.ts:227`).
- The stale-pin failure mode (workspace deleted after automation created) already
  exists today and lands as `dispatch_failed` — cloud validation never protected
  run time.

| 4 | Renderer read path | **Local mirror db, no TanStack collection.** The desktop maintains a merged local db of last-seen workspaces (fed by per-host fan-out queries + new `workspace:changed` events on the host `/events` bus); the renderer reads that db. Consumers migrate off `useLiveQuery(collections.v2Workspaces)`. |
| 5 | MCP / CLI / SDK | **No cloud list endpoint.** `v2Workspace.list` is deleted; external clients resolve connected hosts (from `v2_hosts`) and query each host directly over relay for its workspaces. |
| 6 | apps/web pages | **Delete both** `/workspaces` pages (list+create and the web terminal). They are orphaned — nothing links to them. |
| 7 | Host authorization | **Org membership only.** A host serves its workspace list to any caller whose JWT carries the host's organizationId — parity with today's Electric shape (which is org-scoped; `users_hosts` filtering was already client-side). No cloud lookup in the read path. |
| 8 | Rollout | **Staged with read-through fallback.** R1: host.db schema expands, host backfills full fields from cloud, dual-write. R2: desktop reads flip to local mirror; if a row isn't backfilled yet, read falls back to cloud and seeds the backfill. R3: cloud writes stop; router/shape/proxy WHERE/pages deleted. |

### Decision 4 grounding (existing renderer patterns surveyed)

- Per-host react-query tRPC exists (`packages/workspace-client`), **in-memory only** —
  no host response survives restart today.
- Fan-out template exists: sidebar ports hook
  (`useDashboardSidebarPortsData.ts:65-102`) does per-host `useQueries` + WS event
  cache patching + polling fallback.
- `/events` bus has **no `workspace:*` lifecycle events** — must be added regardless
  (`packages/host-service/src/events/types.ts`).
- v1 proves IPC-tRPC subscriptions from a main-process SQLite work
  (`AuthProvider.tsx:58`), and idb-keyval react-query persistence exists as precedent
  (`ElectronTRPCProvider.tsx:31-84`).

## Forced moves (consequences, not decisions)

- Host mints workspace UUIDs (cloud no longer generates ids).
- `host.db.workspaces` gains `name`, `type`, `taskId`, `createdByUserId`,
  `createdAt`/`updatedAt`; one-main-per-project partial unique index moves local.
- `chat_sessions.v2WorkspaceId` FK drops to a plain uuid tag (never read cloud-side).
- PostHog `workspace_created`/`workspace_deleted` capture moves to host-service.
- Cleanup's is-main check (`is-main-workspace.ts:57`) reads the local table.
- Delete UX confirms locally instead of `waitForWorkspaceDeleted` over Electric.
- Main-workspace sweep / `ensure-main-workspace` become purely local.
- Renderer rename path unifies through host-service (today it hits the cloud API
  directly).
