# Local-First by Data Ownership

**Date:** 2026-06-28 · **Scope:** `apps/desktop`, `apps/mobile`, `packages/trpc`, `packages/local-db`

## Idea

Stop mirroring the whole org to every device. Classify each table by owner and use a different mechanism per class. Sync surface drops from ~24 tables to ~6.

| Class | Owner | Mechanism |
| ----- | ----- | --------- |
| **Local** | device | local SQLite / localStorage, no sync |
| **Reference** | server | `apiClient.x.list.query()` + TanStack Query cache; refetch while the screen is open, no live mirror |
| **Shared** | collaboration | real sync engine |

We already have the stores (local-db + cloud-mirror collections); this just moves the boundary.

## Classification

> *(proposal)* = needs product confirmation.

| Table | Class | Why |
| ----- | ----- | --- |
| worktrees, settings, browser_history, sidebar/sections, terminal presets, prefs, workspace local state | **Local** | device/UI state |
| `v2_workspaces` (the row) | **Local**, presence → **Shared** | a workspace is a worktree on this disk |
| organizations, members, users, invitations, teams | **Reference** | server-owned identity, read-mostly |
| subscriptions, apikeys | **Reference** | settings/billing screens only |
| integration_connections, github_repos, github_prs | **Reference** | server-side cache of external state |
| `v2_projects` *(proposal)* | **Reference** | shared repo metadata, mostly read |
| automations, automation_runs *(proposal)* | **Reference** | server-run; Shared only if live status wanted |
| `v2_hosts`, `v2_clients`, `v2_users_hosts`, `device_presence` | **Shared** | cross-machine coordination |
| `tasks`, `task_statuses` | **Shared** | tasks are a team feature |
| chat_sessions, agent_commands *(proposal)* | **Reference or Shared** | depends on product intent |

## Promotion

`v2_workspaces` starts local (instant, offline). A "Share" action pushes its presence into the Shared set. Most workspaces never promote, so sync cost scales with sharing, not data volume.

The promotion unit is **per-workspace** — one `shared` flag, reversible. Projects are repos, already Reference; they aren't promoted. Project-level sharing, if wanted, is just a default that sets new workspaces' `shared` flag — sugar over the same flag, not a second mechanism.

## Sequencing

1. **Demote Reference tables → TanStack Query.** Removes most poll load. Lowest risk, biggest payoff.
2. **Make `v2_workspaces` local-authoritative.** Keep current sync as the shared-presence path.
3. **Add promote action** for workspaces.
4. **Tune the Shared engine** (revision keys / pub-sub → SSE) for the small remaining surface.

Each step ships independently behind a flag.

Reference tables never need a live mirror: query on navigate and refetch while the screen is open (view-time polling). No Reference table needs to stay Shared for liveness.

## Deferred

Multi-device roaming (a user's own data on a second machine): minor, handle separately. It's just the Shared engine scoped per-user instead of per-org.
