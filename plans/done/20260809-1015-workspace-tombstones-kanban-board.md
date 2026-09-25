# Workspace tombstones (soft delete) + Kanban board view for the v2 workspaces page

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template. It spans `packages/host-service` and `apps/desktop`, so it lives in the root `plans/` folder.


## Purpose / Big Picture

Today, deleting a Superset workspace erases every trace of it: the row in the host's local database is hard-deleted and nothing remembers the workspace existed. Also, the workspaces page is a flat table with only a text search, a project dropdown, and a device selector — there is no way to see work by state ("what's my agent doing", "what's in review", "what merged this week").

After this plan:

1. Deleting a workspace archives its database row instead of erasing it (`archivedAt` + `archiveReason`), so merged and deleted workspaces remain visible as history. (Sessions were originally exempt; that exemption was reversed during review — see the Decision Log. Milestone/validation text below predates the reversal.)
2. The workspaces page gains a board ↔ list toggle. The board is a Linear-style kanban grouped by derived status (Idle, Working, Needs attention, Needs review, Merged, Deleted), read-only (no drag in v1), with a "Show archived: none / past week / past month / all" display option defaulting to past week.
3. Filters become URL-synced multi-select dropdowns (search, project, device, PR state, agent status) shared by both layouts.

Observable outcome: run `bun dev`, open the desktop app, go to the Workspaces page, flip the new board toggle, and see workspace cards in status columns. Delete a workspace and watch its card move to the Deleted column instead of vanishing. Restart the app — it is still there.


## Assumptions

- The event bus wire format keeps working unchanged for archive: archiving broadcasts the existing `eventType: "deleted"` (workspace: null) so every current consumer (sidebar, list patcher, CLI) behaves as before without migration. Confirm during Milestone 2; if a consumer needs the archived snapshot, revisit.
- The renderer's `useHostWorkspaces` event patcher upserts on `"updated"` events for rows it does not have (needed by un-archive). Verify in Milestone 2; if it drops unknown ids, broadcast `"created"` instead.
- Board card contents (which properties render) are an implementer choice within the listed set; no further product sign-off needed.


## Open Questions

None blocking. Two implementer-resolvable items are called out inline: the un-archive broadcast event type (see Assumptions) and whether `workspace.get`-style single-row lookups should treat archived rows as not-found (Milestone 2 consumer audit decides per call site; default: archived = not found for any flow that opens/attaches/mutates).


## Progress

- [x] (2026-08-09) Milestone 1: host.db schema — `archivedAt`/`archiveReason` on `workspaces`, `mergedAt` on `pullRequests` (migration `0020_overrated_dreaming_celestial.sql`, generated via `bun run generate`), `archiveLocalWorkspace`/`unarchiveLocalWorkspace`, default archived-exclusion + `includeArchived` on `workspace.list`, integration tests.
- [x] (2026-08-09) Milestone 2: destroy pipeline archive commit point (moved to step 1.5 — see Decision Log), failure un-archive, `runArchivedWorkspaceReconcile` startup sweep, consumer audit (adopt/search/list/backfill/watcher/PR sweeps exclude archived), unit + integration tests updated.
- [x] (2026-08-09) Milestone 3: renderer data layer — host PR state adopted (5-valued incl. `queued`, cloud Electric PR join deleted), host-wide agent status via `terminalAgents.list`, archived rows via a separate query key in `useHostWorkspacesSource`, `DeletingWorkspacesProvider` deleted.
- [x] (2026-08-09) Milestone 4: board view — `V2WorkspacesBoard` (read-only columns Idle/Working/Needs attention/Needs review/Merged/Deleted), `deriveBoardColumn` util + tests, ghosted archived cards, board↔list toggle + show-archived window dropdown in the header.
- [x] (2026-08-09) Milestone 5: URL-synced filters — `validateSearch` on `/v2-workspaces` (`q`, `device`, `projects` incl. `__sessions__`, `pr`, `agent`, `view`, `archived`), multi-select dropdowns for projects/PR state/agent status, store hydrates from URL once then drives it (replace).


## Surprises & Discoveries

- Observation: `workspaces` has no unique index on `worktreePath` or `branch` — only the partial `workspaces_one_main_per_project` (and `main` workspaces cannot be deleted).
  Evidence: `packages/host-service/src/db/schema.ts:242-253`. Consequence: archived rows can keep their full metadata without colliding with re-created workspaces at the same path/branch.
- Observation: the host already computes the full 5-valued PR state but the workspaces page discards it and re-derives a 4-valued state from a cloud Electric join.
  Evidence: `getPullRequestsByWorkspaces` returns `{ state, reviewDecision, checksStatus, checks }` (`packages/host-service/src/runtime/pull-requests/pull-requests.ts:254-300`) while `useAccessibleV2Workspaces.ts:500-512` keeps only `number`.
- Observation: a tombstone's `worktreePath` can be legitimately reused by a re-created workspace on the same branch, so the startup reconciler must never touch a path a live row owns — otherwise it would rm a healthy worktree.
  Evidence: guard + tests in `packages/host-service/src/runtime/archived-workspace-reconcile.ts` (`selectStranded`).
- Observation: `workspaces.projectId` has `onDelete: "cascade"`, so removing a project also drops that project's tombstones. Accepted: removing a project intentionally removes its workspace history.
  Evidence: comment at the `project.remove` worktree sweep in `packages/host-service/src/trpc/router/project/project.ts`.
- Observation: dropping the cloud Electric PR join removed `additions`/`deletions`/`updatedAt` from the PR hover card — the host store doesn't track them. Accepted as the price of local-first PR state; can return if the host fetch starts carrying diff stats.
  Evidence: `V2WorkspacePrHoverCardContent.tsx` no longer renders the +/- counts.


## Decision Log

All decisions below were made with Kiet in a walkthrough on 2026-08-09.

- Decision: Delete becomes a soft delete (tombstone); sessions are exempt and keep hard delete.
  Rationale: Merged/deleted history should be visible on the board; sessions are ephemeral scratch spaces with no cloud mirror and no PR linkage, so history has little value there.
- Decision: Soft-delete in place — `archivedAt` + `archiveReason` columns on host.db `workspaces`; all consumers updated to exclude archived rows by default (rejected: separate snapshot table; renderer-local tombstones).
  Rationale: Single source of truth. The blast radius is acceptable because no unique index collides (see Surprises) and host-service reads funnel through a small store layer.
- Decision: `archiveReason` is `"merged" | "deleted"` — `"merged"` when the linked PR's state is `merged` at destroy time. Add `mergedAt` to host.db `pullRequests`.
  Rationale: Merged and deleted are different outcomes; cleaning up a merged workspace must not read as data loss. `mergedAt` anchors "merged in the last week" windows.
- Decision: Mark-first commit point — set `archivedAt` right after preflight passes, un-archive on any destroy failure, and add a startup reconciler that finishes physical cleanup for archived rows whose worktree still exists. Delete the renderer's `DeletingWorkspacesProvider`.
  Rationale: The archive flag becomes a durable delete-intent record: crash-safe deletes, cross-device visibility during deletion (the provider was renderer-memory only), and one less provider.
- Decision: Keep archived rows forever — no purge, no retention window.
  Rationale: Rows are small metadata; visibility is bounded by the show-archived display window instead.
- Decision: No drag-and-drop in v1; cards navigate on click.
  Rationale: Board columns are derived state (you cannot drag a PR to merged); drag can be added per-column later once one has a real action.
- Decision: Filters are URL-synced multi-select dropdowns (search, project incl. Sessions, device, PR state, agent status), following the pull-requests page pattern (rejected for v1: full Linear pill/operator system).
  Rationale: Covers real filtering needs on infrastructure the repo already has; pills can layer on later.
- Decision: Archived visibility is a display dropdown "Show archived: none / past week / past month / all", default past week.
  Rationale: Linear's project-view model; keeps terminal columns bounded under keep-forever retention while making recent history visible by default.
- Decision: The board ships as a view-mode toggle on the existing page; the list stays and remains the default.
  Rationale: Kiet's explicit call ("make it a toggle"); matches Linear's board-is-a-layout model and the tasks page precedent.
- Decision: The archive commit point moved from step 0.5 (right after preflight) to step 1.5 (right after the teardown script) during implementation.
  Rationale: a blocking teardown failure re-opens the delete dialog with a force-retry, and that dialog is mounted under the workspace's row. Archiving before teardown would drop the row (and unmount the dialog) mid-prompt, losing the failure UX. Teardown is the slow, failure-prone interactive step; the physical steps after it are fast and rare to fail, and their failures un-archive + toast.
  Date/Author: 2026-08-09, implementation.
- Decision: Archived tombstones reach the renderer through a separate react-query key (`host-service/workspaces/archived/...`) inside `useHostWorkspacesSource`, never through the shared live list cache.
  Rationale: the live list cache is persisted to IndexedDB snapshots and patched by `workspace:changed` events that treat archive as delete; letting tombstones in would leak them into the sidebar and snapshots.
  Date/Author: 2026-08-09, implementation.
- Decision: `V2WorkspaceRow` keeps its delete dialog mounted via a "mounted once opened" latch instead of the deleted provider's `deleting` flag.
  Rationale: preserves the teardown-failure re-open path without any global in-flight registry.
  Date/Author: 2026-08-09, implementation.
- Decision: REVERSAL of the session exemption — sessions tombstone on delete too (reason always "deleted"; no PR link exists).
  Rationale: Kiet, post-review: "they're essentially workspaces with a little missing data". Also simplifies the pipeline (no per-type branch at the commit point) and gives sessions Deleted-column history. Safe because `claimedSessionNames` counts tombstones, so a tombstone's folder path is never reused and the reconciler's live-path guard holds.
  Date/Author: 2026-08-09, Kiet.


## Outcomes & Retrospective

Shipped 2026-08-09 in a single PR, all five milestones. Against the original purpose: deleting a workspace now archives instead of erasing (sessions still hard-delete), and the workspaces page has a board layout with Merged/Deleted history columns and URL-shareable filters.

Validation: root typecheck clean, Biome lint exits 0, host-service suite 1072 pass / 0 fail, desktop suite 2630 pass / 0 fail. End-to-end CDP verification on the dev app: created two scratch workspaces, destroyed them through the real pipeline, and watched them land in the board's Deleted and Merged columns live (reasons `deleted`/`merged` confirmed in host.db); a full reload restored board view + active filters from the URL alone; migration `0020` applied cleanly on host-service boot. Screenshots in `~/Desktop/superset-board-cdp/`.

Deviations from the draft plan (all in the Decision Log): the archive commit point moved after the teardown script to preserve the force-retry dialog UX; archived rows flow through a dedicated query key rather than the shared live cache; the reconciler gained a path-reuse guard; the PR hover card lost cloud-only diff stats (+/- counts) when the Electric join was removed.

Known follow-ups (not blockers): drag-and-drop semantics (deliberately out of v1), a board group-by picker (columns are fixed to status), surfacing `merged in the last N days` windows for live merged workspaces using the new `mergedAt`, and saved views.


## Context and Orientation

Superset is a Bun + Turbo monorepo. Two parts matter here:

- `packages/host-service` — a long-running local daemon ("host service") that owns workspaces on a machine. Its source of truth is a local SQLite database ("host.db") whose Drizzle schema lives in `packages/host-service/src/db/schema.ts`. The desktop app talks to it over tRPC (typed RPC over HTTP/WebSocket).
- `apps/desktop` — the Electron desktop app. The v2 workspaces page lives at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces/` (route `/v2-workspaces`). The v1 page under `.../workspaces/` is being sunset — do not touch it.

Terms used below:

- *Workspace*: an isolated git worktree (or, for `type: "session"`, a standalone repo under `~/.superset/sessions`) tracked as one row in host.db `workspaces` (`schema.ts:200-254`). `type` is `"main" | "worktree" | "session"`; `projectId` is null exactly for sessions; `main` workspaces cannot be deleted (`workspace-cleanup.ts:218-221`).
- *Destroy pipeline*: `destroyWorkspace` / `runDestroy` in `packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts`. Phases (doc comment at `:140-172`): 0 preflight dirty-check → 1 teardown script → 2a terminals → 2b worktree removal → 3 local row delete (the commit point, `:396-400`, calling `deleteLocalWorkspace`) plus best-effort legacy cloud delete → 4 optional branch delete → 5 caches. Sessions take an `rm -rf` branch guarded by `isInsideSessionsRoot` (`:315-339`).
- *Store layer*: `packages/host-service/src/workspaces/local-workspace-store.ts` — `getLocalWorkspace`, `updateLocalWorkspace`, `deleteLocalWorkspace` (`:201-216`; deletes the row, broadcasts `eventType: "deleted"` with `workspace: null` on the event bus, tracks a telemetry event).
- *PR state*: host.db `pullRequests` (`schema.ts:123-167`) stores `state`, `isDraft`, `reviewDecision`, `checksStatus` — no `mergedAt`. `mapPullRequestState` (`packages/host-service/src/runtime/pull-requests/utils/pull-request-mappers/pull-request-mappers.ts:7-37`) produces `"open" | "draft" | "merged" | "closed" | "queued"`. `getPullRequestsByWorkspaces` (`.../pull-requests/pull-requests.ts:254-300`) already returns this per workspace.
- *Agent status*: `PaneStatus = "idle" | "working" | "permission" | "review" | "failed"` with a priority reducer in `apps/desktop/src/shared/tabs-types.ts:27-50`. The existing per-workspace hook (`useTerminalAgentBindings`) issues one query per workspace — a board must instead use the host-wide `terminalAgents.list` procedure (`packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts:46`).
- *Workspaces page data layer*: `useAccessibleV2Workspaces` (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces.ts`, ~712 lines) merges host rows (via `workspace.list` per host), PR numbers (per-host `pullRequests.getByWorkspaces` polled every 10s, but only `number` is kept — `:500-512`), a cloud Electric join for PR state (`:514-556`), and zustand filters (`stores/v2WorkspacesFilterStore/`). Sessions surface as a `"Sessions"` pseudo-group (`V2WorkspacesList.tsx:99-105`).
- *Board template*: the tasks page already has a Linear-styled dnd-kit board: `.../_dashboard/tasks/components/TasksView/components/TasksBoardView/` (`TasksBoardView.tsx`, `components/KanbanColumn/`, `components/KanbanCard/`) and a board/table view-mode switch in `TasksView.tsx:367-385`.
- *URL-synced filters precedent*: `.../_dashboard/pull-requests/layout.tsx:3-26` (`validateSearch` on the TanStack Router route) + `.../pull-requests/stores/pullRequestsFilterStore/`.
- *`DeletingWorkspacesProvider`*: `.../_dashboard/providers/DeletingWorkspacesProvider/DeletingWorkspacesProvider.tsx` — an in-memory "delete in flight" set that renders rows at 50% opacity (`V2WorkspaceRow.tsx:312-313,434-455`). It is deleted by this plan (replaced by the durable `archivedAt` mark).

Database migration rule (AGENTS.md): never hand-edit anything under a `drizzle/` folder and never run migrations yourself. Modify only the schema TypeScript, then ask Kiet to run `drizzle-kit generate` (host-service migrations live in `packages/host-service/drizzle/`, latest `0019`). Host-service tests use the `*.node-test.ts` convention.


## Plan of Work

### Milestone 1: Schema and store primitives (host-service)

In `packages/host-service/src/db/schema.ts`, add to `workspaces`: `archivedAt: integer("archived_at")` (null = live) and `archiveReason: text("archive_reason").$type<"merged" | "deleted">()` (null when live), plus an index on `archivedAt` for the default-exclusion filter. Add to `pullRequests`: `mergedAt: integer("merged_at")` (null unless merged). Ask Kiet to run `drizzle-kit generate` (should produce migration `0020`); do not write SQL by hand.

Populate `mergedAt` where PR refresh maps GitHub data into `pullRequests` rows (follow the write path from `packages/host-service/src/runtime/pull-requests/pull-requests.ts` into its upsert): when the mapped state is `merged`, set `mergedAt` from the provider's merged timestamp if the fetch payload carries one, else `Date.now()` at first observation; never null it back out.

In `local-workspace-store.ts`, add:

    export function archiveLocalWorkspace(ctx, id, reason: "merged" | "deleted"): void
    export function unarchiveLocalWorkspace(ctx, id): void

`archiveLocalWorkspace` sets `archivedAt: Date.now()`, `archiveReason: reason`, `updatedAt`, broadcasts the existing `eventType: "deleted"` shape (workspace: null) so current consumers drop the row exactly as before, and emits the `workspace_deleted` telemetry event (add a property distinguishing archive from hard delete). `unarchiveLocalWorkspace` nulls both columns and broadcasts `"created"` with the row snapshot so list patchers re-add the row. Both are idempotent.

Make list reads exclude archived rows by default: find every read of the `workspaces` table in host-service (grep `from(workspaces)` and `select().from` in `packages/host-service/src`) and add `isNull(workspaces.archivedAt)` to each, *except* where a call site explicitly opts in. Extend the `workspace.list` tRPC input with `includeArchived: z.boolean().default(false)`; when true, archived rows are included and the response row must carry `archivedAt` and `archiveReason` so the renderer can window and column them.

Acceptance: `cd packages/host-service && bun run typecheck` clean; new unit test proves `workspace.list` excludes an archived row by default and includes it with `includeArchived: true`.

### Milestone 2: Destroy pipeline rework + reconciler (host-service)

In `runDestroy` (`workspace-cleanup.ts`), for non-session workspaces only:

1. After the main-workspace guard and step 0 preflight pass, compute the reason — load the linked `pullRequests` row via `local.pullRequestId`; reason = `"merged"` if its state maps to merged, else `"deleted"` — and call `archiveLocalWorkspace`. This is the new commit point: the workspace disappears from default lists immediately, on every device.
2. Wrap the remaining phases so that any thrown error (blocking teardown failure, worktree-removal failure, repo-open failure) calls `unarchiveLocalWorkspace` before rethrowing — the workspace comes back live and retryable, preserving today's typed-error contract with the renderer (CONFLICT / PRECONDITION_FAILED semantics unchanged).
3. Replace the step-3 `deleteLocalWorkspace(ctx, input.workspaceId)` call: for sessions keep `deleteLocalWorkspace` (hard delete, unchanged); for everything else the row is already archived, so step 3 becomes only the best-effort legacy cloud delete. Keep queueing into `workspaceCloudDeletes` behavior as-is if present on the failure path.
4. The `destroysInFlight` set stays — it still guards concurrent destroys.

Startup reconciler: add a sweep (alongside existing startup sweeps in host-service; follow the pattern of the name-backfill sweep referenced at `schema.ts:224-226`) that finds archived rows whose `worktreePath` still exists on disk — these are crash-interrupted deletes — and re-runs `destroyWorkspace` for them with `force: true, teardownMode: "best-effort"`, tolerating failures with a warning log. Rationale: the user's intent was durably recorded by `archivedAt`; best-effort teardown avoids blocking on a broken teardown script forever.

Consumer audit: with default exclusion in place from Milestone 1, walk every host-service call site that loads a single workspace by id (attach terminal, open, PR refresh sweep, cloud reconciler, backfill sweeps) and decide archived semantics per site. Default rule: any flow that opens, attaches, mutates, or syncs treats archived as not-found/skip; only the board read path opts in. Record anything surprising in Surprises & Discoveries.

Tests (`*.node-test.ts` + the integration-test pattern of `packages/host-service/test/session-create-delete.integration.test.ts`): destroy archives with reason `"deleted"`; destroy of a workspace whose linked PR is merged archives with reason `"merged"`; blocking teardown failure leaves the row live (un-archived); session destroy still hard-deletes the row; reconciler finishes cleanup for an archived row with a surviving worktree directory.

Acceptance: `cd packages/host-service && bun test` passes including the new tests.

### Milestone 3: Renderer data layer (apps/desktop)

All in `useAccessibleV2Workspaces` unless noted:

1. Adopt host PR state: extend what `:500-512` keeps from `pullRequests.getByWorkspaces` to the full payload (`state` — 5-valued including `queued` — `reviewDecision`, `checksStatus`, `checks`, `title`, `url`). Delete the cloud Electric `githubPullRequests` join (`:514-556`) and the repo-id resolution it required; widen `V2WorkspacePrState` to include `"queued"` and update `PRIcon` call sites (icon colors for `queued` already exist).
2. Agent status: fetch per-host via the host-wide `terminalAgents.list` procedure (one query per host, not per workspace), derive a per-workspace `PaneStatus` with the existing `STATUS_PRIORITY` reducer from `apps/desktop/src/shared/tabs-types.ts`, and expose it on `AccessibleV2Workspace`.
3. Archived rows: the page's `workspace.list` calls pass `includeArchived: true`; expose `archivedAt`/`archiveReason` on `AccessibleV2Workspace`. The existing list layout filters archived rows out unconditionally; the board applies the show-archived window.
4. Delete `DeletingWorkspacesProvider` and its render plumbing in `V2WorkspaceRow.tsx:312-313,434-455` — the archive broadcast now removes the row from default views the moment the destroy commits, and the destroy mutation's pending state covers the sub-second in-flight window.

Acceptance: list page behaves exactly as before (no archived rows, PR pills now sourced from the host — verify a `queued` PR shows the amber icon); `cd apps/desktop && bun run typecheck` clean.

### Milestone 4: Board view (apps/desktop)

Copy the tasks-board structure into `.../v2-workspaces/components/V2WorkspacesBoard/` (folder-per-component convention from AGENTS.md): a columns container plus `components/BoardColumn/` and `components/BoardCard/`, based on `TasksBoardView`'s `KanbanColumn`/`KanbanCard` but with no `DndContext` (no drag in v1; cards are buttons that navigate to the workspace, same target as today's row click).

Fixed column order and derivation precedence (first match wins), computed in a pure co-located util `deriveBoardColumn/` with a unit test:

    1. archiveReason === "deleted"                    → Deleted
    2. archiveReason === "merged"                     → Merged
    3. live PR state === "merged"                     → Merged
    4. agent status permission or failed              → Needs attention
    5. agent status working                           → Working
    6. agent status review, or PR open/draft/queued   → Needs review
    7. otherwise                                      → Idle

Rendered order: Idle · Working · Needs attention · Needs review · Merged · Deleted. Columns show a header with name + count. Sessions appear as normal cards (they can never reach Merged/Deleted — no PRs, hard delete). Cards show: workspace name, project icon + name (resolve icons via the shared `resolveProjectIconUrl` helper — never inline `repoOwner`; sessions show a session marker), branch, PR pill (`PRIcon` + `#number` + `ChecksDot`, reusing `V2WorkspaceRow`'s pill pieces), agent-status chip, host name, relative created time. Archived cards render ghosted (reduced opacity) with actions disabled.

View toggle: a board/list segmented control in `V2WorkspacesHeader`, modeled on `TasksView.tsx:367-385`. Show-archived dropdown ("none / past week / past month / all", default past week) lives next to it and scopes rows where `archivedAt != null` by `archivedAt >= now - window`; it only affects the board.

Both the view mode and the archived window persist in the URL (Milestone 5's `validateSearch`); until Milestone 5 lands they may live in the existing zustand filter store.

Acceptance: `bun dev`, open Workspaces, toggle to board — cards appear in correct columns; delete a workspace and its card moves to Deleted (ghosted) without a full refresh; restart the app and the Deleted card is still there; set "Show archived: none" and Merged shows only live merged workspaces while Deleted empties.

### Milestone 5: URL-synced filters (apps/desktop)

Replace `v2WorkspacesFilterStore`'s scalar fields with the pull-requests pattern: `validateSearch` on the `/v2-workspaces` route (`page.tsx` / its layout) defining `q` (string), `projects` (string array; sentinel `"__sessions__"` for sessions — it already exists as the group key in `V2WorkspacesList.tsx:291`), `device` (existing semantics — it selects which host is queried, keep that behavior), `prStates` (array over the 5 states), `agentStatuses` (array over `PaneStatus`), `view` (`"list" | "board"`), `archived` (`"none" | "week" | "month" | "all"`). Render them as multi-select dropdowns in `V2WorkspacesHeader` next to the existing search input, applied identically in both layouts (except `archived`, board-only). Keep the plain substring search behavior from `useAccessibleV2Workspaces.ts:112-127`.

Acceptance: apply filters, copy the URL, reopen it — identical filtered view; filters apply in both layouts.


## Concrete Steps

Work from the repo root. Per milestone:

    bun run typecheck          # no errors
    bun run lint               # must exit 0 — CI fails on warnings too
    bun run lint:fix           # run after edits, before push
    cd packages/host-service && bun test    # milestones 1-2
    cd apps/desktop && bun test             # milestones 3-5

Migration (Milestone 1): after editing `packages/host-service/src/db/schema.ts`, stop and ask Kiet to run `drizzle-kit generate` for host-service; never create or edit files in `packages/host-service/drizzle/` yourself.

Manual verification (Milestone 4): `bun dev`, then in the desktop app create a scratch workspace, delete it from the workspaces page, and confirm the board's Deleted column gains a ghosted card while the list layout no longer shows the row.


## Validation and Acceptance

End-to-end acceptance, in order:

1. Host: `workspace.list` hides archived rows by default; `includeArchived: true` returns them with `archivedAt`/`archiveReason` (unit test).
2. Destroy: archives non-sessions (reason merged/deleted per PR state), hard-deletes sessions, un-archives on teardown failure, and the startup reconciler cleans a crash-interrupted delete (integration tests).
3. Desktop list page: unchanged behavior, PR pills sourced from host state (queued renders amber).
4. Board: columns per the precedence table; delete moves a card to Deleted live; archived cards survive app restart; show-archived window scopes Merged/Deleted.
5. Filters: URL round-trip reproduces the exact view.

Run `bun run typecheck`, `bun run lint` (exit 0), and the package test suites at every milestone boundary.


## Idempotence and Recovery

Schema changes are additive (two nullable columns + one index; one nullable column on `pullRequests`) — re-running generation is safe and no backfill is needed (all existing rows are live). `archiveLocalWorkspace`/`unarchiveLocalWorkspace` are idempotent updates. The destroy pipeline keeps its retry contract: any failure un-archives, so a retry starts from a live row; a crash after marking is repaired by the startup reconciler, which is itself safe to re-run (it no-ops once the worktree is gone). Renderer milestones are pure UI and revert cleanly with git.


## Interfaces and Dependencies

Host-service (all in existing files):

    // schema.ts (workspaces)
    archivedAt: integer("archived_at"),                                  // null = live
    archiveReason: text("archive_reason").$type<"merged" | "deleted">(), // null = live
    // schema.ts (pullRequests)
    mergedAt: integer("merged_at"),

    // local-workspace-store.ts
    archiveLocalWorkspace(ctx, id, reason): void
    unarchiveLocalWorkspace(ctx, id): void

    // workspace.list input
    includeArchived: z.boolean().default(false)

Desktop: `AccessibleV2Workspace` gains `prState` (5-valued), `agentStatus: PaneStatus | null`, `archivedAt: number | null`, `archiveReason: "merged" | "deleted" | null`. New components under `.../v2-workspaces/components/V2WorkspacesBoard/`. No new dependencies — dnd-kit is not needed (no drag), TanStack Router `validateSearch` and the existing shadcn `Select`/dropdown primitives cover the rest.
