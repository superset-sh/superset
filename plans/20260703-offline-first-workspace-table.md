# Design: offline-first workspaces (host-owned `v2_workspaces`)

Decision record from the 2026-07-03/04 walkthroughs with Kiet. Execution: `20260703-1914-...-execplan.md`. End-state map: `offline-first-workspace-table-reference.md`.

**Goal:** a workspace (a git worktree on one machine) must be creatable, renamable, deletable, and renderable with zero cloud availability.

## Why it wasn't offline-first

Cloud Postgres (`v2_workspaces`) was the canonical registry: every write was a synchronous cloud round-trip, the cloud minted UUIDs, delete UX blocked on an Electric sync round-trip, and rename had two divergent write paths (renderer→cloud, host→cloud). host.db's row was too thin to render from (no name/type/taskId).

## Cloud usage inventory (what actually needed the table)

Notably: **apps/api and apps/mobile had zero references**; `chat_sessions.v2WorkspaceId` and `taskId` are write-only tags never read cloud-side.

| Consumer | Need | Deprecation |
|---|---|---|
| Desktop renderer (Electric shape, ~25 `useLiveQuery` sites) | live org list | host fan-out hook |
| apps/web `/workspaces` pages (orphaned, no nav links) | list/create; id→hostId | delete both |
| Automations (`verifyWorkspaceInOrg`) | derive hostId/projectId for relay routing | denormalize at create |
| `chat_sessions.v2WorkspaceId` FK | valid FK target (never read) | drop FK → uuid tag |
| Authz (`list` joins `v2_users_hosts`; Electric scopes by org only) | org + per-user host scoping | relay already enforces both |
| PostHog capture, is-main check, MCP/CLI/SDK list | analytics; cleanup guard; pin lookup | host-side (R3); local `type`; host fan-out |

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Source of truth | Host-service owns workspaces outright; no cloud reads remain |
| 2 | Cross-host visibility | Each client fans out to hosts itself (local direct, remote via relay) — client owns what it sees; a host serves only what it has; no aggregator, so mobile/web/CLI consume hosts the same way |
| 3 | Automations | Denormalize `hostId`/`projectId` on the pin at create; host 404s stale pins at run time (same semantics as today — dispatch never read the table) |
| 4 | Renderer read path | Fan-out hook + per-host IndexedDB last-seen cache; live `workspace:changed` events; no TanStack collection; nothing v1 touched |
| 5 | MCP/CLI/SDK | Cloud list endpoint deleted; clients query hosts directly over relay |
| 6 | apps/web pages | Delete both (orphaned) |
| 7 | Host authorization | Org membership in the JWT — parity with today's Electric scoping; relay additionally enforces per-user host access |
| 8 | Rollout | Staged R1→R3 with read-through fallback; legacy cloud path lives until old-client usage is negligible (adoption-gated, not dated) |

Revisions: D2/D4 briefly moved fan-out into the host-service (`peer_workspaces` cache) on 2026-07-04 to stay v2-scoped; reverted the same day in the re-walkthrough — client-owned fan-out won.

## Forced moves (consequences, not decisions)

Host mints UUIDs; host.db gains `name/type/taskId/createdByUserId/timestamps` + one-main-per-project index; `chat_sessions.v2WorkspaceId` FK becomes a plain uuid tag; delete confirms locally; main-workspace sweep and is-main check go local; renderer rename unifies through host-service.

**Scope guard:** v2-only. Legacy v1 `workspaces` table/shape/collection and `packages/local-db` are untouched (separate sunset).
