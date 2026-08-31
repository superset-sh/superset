# Workspace lifecycle tracking: PR opened/merged/closed first, workspace states over time

Living doc — keep `Progress` and `Decision Log` current. Follows AGENTS.md conventions.

## Goal

We want to track workspace states over time. First concrete slice: pull requests. Today we know *that* a workspace's PR is merged, never *when* — GitHub returns `created_at` / `merged_at` / `closed_at` on every fetch we already make, and we discard them.

After this change:

- The host durably records each PR's `openedAt` / `mergedAt` / `closedAt` (fetched with the user's own `gh` login — no GitHub App required).
- Workspaces link to PRs many-to-many, and links survive merge + branch deletion.
- Lifecycle events sync to a **general cloud `workspace_events` table** — one timeline per workspace that powers a future analytics tab and grows to other workspace metadata (created, deleted, agent activity, …) without new tables.

## Locked decisions (from /decide walkthrough, 2026-07-27)

| # | Decision | Choice |
|---|---|---|
| 1 | Storage depth | Current-state timestamps on the PR row **plus** append-only event history |
| 2 | Workspace↔PR link | Full many-to-many link table; UI picks the display PR (open > merged > closed, newest wins) |
| 3 | Where data lives | Host fetches via `gh` (no GitHub App dependency), keeps local copy, syncs events to a cloud table for the analytics tab |
| 4 | CI check timing | Later, separate project |
| 5 | Naming | `openedAt` / `mergedAt` / `closedAt` (row `createdAt`/`updatedAt` stay bookkeeping-only) |
| 6 | History shape | One general **workspace events** timeline; PR events are just the first event types |

## Current state (30 seconds)

- **Store:** host-service SQLite `pull_requests` table (`packages/host-service/src/db/schema.ts:105-149`), unique on `(provider, owner, repo, prNumber)`. Workspaces link via a single `workspaces.pullRequestId` FK.
- **Refresh:** `PullRequestRuntimeManager` (`packages/host-service/src/runtime/pull-requests/pull-requests.ts`) — git-watcher-driven + 5-min sweeps. Fetchers in `utils/github-query/github-query.ts` (gh CLI primary, Octokit fallback).
- **Renderer:** polls `pullRequests.getByWorkspaces` every 10s → `PullRequestStateSnapshot`.
- **Gaps:** `merged_at` fetched but discarded (`github-query.ts:47-53`); `openedAt` exists nowhere; the single PR link is torn down after merge when the branch is deleted (`performProjectRefresh`, `pull-requests.ts:662-702`); no event history anywhere; cloud PR data requires the GitHub App.

## Data model

Host SQLite (`packages/host-service/src/db/schema.ts`):

    pull_requests            + opened_at, merged_at, closed_at   (nullable integer, epoch ms)
    workspace_pull_requests    NEW: workspace_id, pull_request_id, linked_at, unlinked_at (null = active)
                               unique (workspace_id, pull_request_id); replaces workspaces.pull_request_id
    workspace_events           NEW (outbox): id, workspace_id, event_type, occurred_at, payload (json),
                               created_at, synced_at (null = pending cloud push)

Cloud Postgres (`packages/db/src/schema/`):

    workspace_events           NEW: id (host-generated, PK — makes sync idempotent), organization_id (FK),
                               host_id, workspace_id (plain text — cloud v2_workspaces is deprecated, no FK),
                               event_type, occurred_at, payload (jsonb), created_at

Initial `event_type` values: `pr_opened`, `pr_merged`, `pr_closed`, `pr_reopened`, `pr_linked`, `pr_unlinked`, `workspace_created`, `workspace_deleted`. Payload carries PR identity (repo, number, url, title). New types slot in with no schema change.

## Milestones

### M1 — Capture PR timestamps locally (host-service only)

1. Schema: add `openedAt` / `mergedAt` / `closedAt` to `pullRequests`; `cd packages/host-service && bunx drizzle-kit generate --name=pull_request_lifecycle` (never hand-edit `drizzle/`; applies automatically at DB open).
2. `utils/github-query/types.ts`: add `createdAt: string`, `mergedAt: string | null`, `closedAt: string | null` to `GitHubPullRequestNode`; thread `created_at`/`merged_at`/`closed_at` through both gh-CLI and Octokit variants in `github-query.ts` (REST already returns them).
3. `upsertPullRequestRow` (`pull-requests.ts:830-904`): write all three as epoch ms. **Plain overwrite, no coalesce** — reopen must null `closedAt`.
4. Tests: round-trip + reopen case in `pull-requests.test.ts`.

Done when: `sqlite3 host.db 'select pr_number, opened_at, merged_at, closed_at from pull_requests'` shows real GitHub timestamps after a refresh.

### M2 — Many-to-many workspace↔PR links

Additive-then-subtractive migration off the single FK:

1. Add `workspace_pull_requests` table; backfill one active row per existing `workspaces.pullRequestId`.
2. Rework link assignment/teardown in `performProjectRefresh` (`pull-requests.ts:662-702`): new PR match → insert link (re-activate if it exists); branch gone / headSha drift → set `unlinkedAt` instead of deleting; merged links are never unlinked. A workspace can hold several links; history is never lost.
3. Display rule as a shared helper (host-side, exported through the snapshot): active links first, then open > merged > closed, newest `linkedAt` wins. All read paths (`getPullRequestsByWorkspaces`, `git.getPullRequest`) resolve the display PR through it.
4. Keep writing `workspaces.pullRequestId` (mirror of the display PR) during transition; drop the column in a follow-up once no reader remains.
5. Tests: merge → branch delete → link stays; reused branch gets a second link with correct display winner; backfill idempotence.

Done when: a workspace whose PR merged yesterday still resolves it (with `mergedAt`) after any refresh, and a reused branch shows the new open PR while keeping the merged one in history.

### M3 — Event emission + cloud sync

1. Host: emit rows into the local `workspace_events` outbox wherever state changes are detected — `upsertPullRequestRow` diffs old vs new (`state` transitions → `pr_opened`/`pr_merged`/`pr_closed`/`pr_reopened`, using GitHub timestamps as `occurredAt`), link changes in M2 → `pr_linked`/`pr_unlinked`, `insertLocalWorkspace`/`deleteLocalWorkspace` → `workspace_created`/`workspace_deleted`.
2. Cloud: add `workspace_events` to `packages/db/src/schema/` — **cloud migration via the `db-migrations` skill (Neon branch; user runs `drizzle-kit generate`)**.
3. Sync: new cloud tRPC mutation `workspaceEvents.ingestFromHost` (JWT-from-host auth, same pattern as `v2Workspace.updateNameFromHost` in `packages/trpc/src/router/v2-workspace/`); host pushes pending outbox rows in batches, marks `syncedAt` on ack. Host-generated event ids + upsert-on-id make retries idempotent. Offline hosts just accumulate outbox rows.
4. Read path: Electric shape for `workspace_events` scoped by `organizationId` (register in `apps/electric-proxy` allowlist; add collection in `CollectionsProvider/collections.ts`). This is what the analytics tab — and mobile — will read. The tab itself is a separate project.

Done when: merging a PR produces a `pr_merged` row visible in cloud Postgres within one refresh cycle, and re-running the sync creates no duplicates.

### M4 — Renderer exposure

1. Add `openedAt`/`mergedAt`/`closedAt` + display-PR resolution to `PullRequestStateSnapshot` (`pull-requests.ts:195-203`) and `git.getPullRequest` (`src/trpc/router/git/git.ts:607-664`).
2. Extend `DashboardSidebarWorkspacePullRequest` (`.../useDashboardSidebarData/types.ts:10-25`); show "Merged 2h ago" in `DashboardSidebarWorkspaceHoverCardContent` + `V2WorkspacePrHoverCardContent`. Minimal UI — the analytics tab is a follow-up project reading M3's events.

Done when: hovering a merged workspace in the sidebar shows when it merged.

## Validation

- `cd packages/host-service && bun test src/runtime/pull-requests`
- Root: `bun run typecheck && bun run lint` (zero warnings — CI fails on warnings) and `bun test`.
- Behavioral (M4): `bun dev`, hover a merged workspace's sidebar row → "Merged \<relative time\>". (M2): delete the merged branch, manual refresh via `PRStatusGroup` → still merged.
- (M3): `select event_type, occurred_at from workspace_events` on the Neon branch shows events after a merge; kill and restart the host mid-sync → no duplicate rows.

## Safety / rollback

All schema changes are additive; host migrations auto-apply at DB open and throw rather than serve a half-migrated DB. `workspaces.pullRequestId` keeps working through M2's transition (dropped only in a follow-up). Event sync is an outbox with idempotent ids — safe to retry, safe to disable (rows accumulate locally). Backfill of timestamps is organic via the next refresh. Rollback = stop reading new columns/tables; they're inert unread.

## Out of scope

CI check timing (later, separate project) · analytics tab UI (reads M3's events, separate project) · draft→ready timestamps (needs timeline API) · v1 desktop legacy path (sunset) · Electric `v2_workspaces` (deprecated) · `tasks.prUrl` bridging · GitHub App webhook path (unchanged; `gh`-based capture works without it).

## Progress

- [x] (2026-07-27) Discovery: mapped all three PR data paths + workspace persistence model.
- [x] (2026-07-27) /decide walkthrough: six decisions locked (table above).
- [x] (2026-07-28) Plan rewritten around locked decisions; PR opened for the plan.
- [ ] M1 local timestamp capture.
- [ ] M2 many-to-many links.
- [ ] M3 event emission + cloud sync.
- [ ] M4 renderer exposure.

## Decision Log

- 2026-07-27 — Snapshot + event history; many-to-many links; host-fetched (`gh`) with cloud `workspace_events` sync for analytics; CI timing deferred; `openedAt`/`mergedAt`/`closedAt`; general event timeline over PR-specific tables. (Kiet via /decide walkthrough.)
- 2026-07-28 — Cloud `workspace_events.workspace_id` is plain text (no FK): cloud `v2_workspaces` is deprecated/R3-removal, and events must outlive workspace deletion for analytics.
