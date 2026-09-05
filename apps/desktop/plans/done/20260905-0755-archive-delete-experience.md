# Replace the v2 workspace "Delete" close action with a reversible "Archive"

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

Today the only way to get a v2 workspace out of the way is "Delete": a modal with an irreversible destroy and an "Also delete local branch" checkbox. PostHog rage-click analysis shows that checkbox is the single worst hotspot in the app. After this change, every "close" affordance on a v2 workspace (the sidebar row's hover button, the sidebar context menu, the Close Workspace hotkey, the command palette, the Workspaces page menus, and bulk selection) **archives** the workspace instead: the row leaves the sidebar instantly, a toast offers Undo for eight seconds, nothing on disk or in the terminals is touched, and a new **Archived** view on the Workspaces page lists everything that was put away with Unarchive and Delete actions. Permanent deletion still exists, but it now lives in a calm, deliberate place.

You can see it working by running the desktop app from this worktree, hovering a sidebar workspace row, clicking the archive icon, watching the row vanish and the toast appear, clicking Undo, and watching the row come back with its terminals still running. Switching the Workspaces page to the Archived view shows archived rows with Unarchive and Delete.

## Assumptions

- The desktop app in this worktree is run against this worktree's own host-service build; never attach to Avi's running app.
- The host-service sqlite migration harness (`bun:sqlite` + drizzle `migrate()`) used by existing tests works for new tests without changes.
- Sonner's `toast(..., { id })` deduplicates by id and `toast.dismiss(id)` removes it (both already used in the renderer).

## Open Questions

None blocking. Product forks were settled in the brief (two rounds of live review). If a genuine fork appears during implementation it is recorded here first and asked through `ask_user`.

## Progress

- [x] (2026-09-05 07:55Z) Discovery: read prior branch `archive-workspace-experience` (plan, diff, uncommitted fix), PR #6011 context, and every file the brief anchors on in current `main`.
- [x] (2026-09-05 08:10Z) Plan written, including the terminal status audit table below.
- [x] (2026-09-05 08:40Z) Milestone 1: host-service archive state + archive/unarchive data plane + tests.
- [x] (2026-09-05 09:30Z) Milestone 2: terminal suspend (`killSessionRuntime`, `suspendSessionAndWait`, `markTerminalSessionSuspended`, `planTerminalAttach`) + reaper `planArchivedSuspends` + tests.
- [x] (2026-09-05 10:00Z) Milestone 3: renderer data plane (archive fields on rows, `workspaces`/`archivedWorkspaces` split, explicit event mapping, host-target and delete-dialog fallbacks) + tests.
- [x] (2026-09-05 11:00Z) Milestone 4: `useArchiveWorkspaceFlow`, `useArchiveWorkspaceIntent` queue + `ArchiveWorkspaceMount`, and every entry point (sidebar button, sidebar menu, hotkey, palette archive + nav, page menu, bulk toolbar + bulk menu).
- [x] (2026-09-05 11:45Z) Milestone 5: `V2WorkspacesArchived` + `ArchivedWorkspaceRow`, header Archived toggle with count, Display hidden in that mode, "History" rename, `WorkspaceArchivedState` deep link, `parseV2WorkspacesSearch` extracted and tested.
- [x] (2026-09-05 12:10Z) i18n: 24 new messages translated in all 16 non-English locales (384 entries); `bun run check:i18n` exits 0.
- [x] (2026-09-05 12:20Z) Gates: host-service `bun test` (all new suites green; the 3 known environment-only failures remain), desktop `bun test` (3523 pass; the known env-sensitive LeaderboardRank failure remains), root `bun run lint` clean, root `bun run typecheck` clean after the mobile fix below.
- [x] (2026-09-05 17:00Z) Dev instance of this worktree booted with the refreshed `.env`; archive → undo round trip exercised live over CDP (80 → 79 → 80 sidebar rows, toast with Undo and the view link), Archived view rendered with a real archived row.
- [x] (2026-09-05 18:20Z) Code review: eight angle reviewers plus the orchestrator's own pass (44 raw findings, 7 verified by the orchestrator) and their fixes committed as "fix: address review findings on the archive experience"; outcomes tabled on the review page and in Surprises below.
- [x] (2026-09-05 18:40Z) A third, fresh-context reviewer (plan + diff only) reproduced the top findings and added one: the project-delete dialog counted only live worktrees; fixed, and the Workspaces-page Archive item is gated on sandbox hosts like the sidebar's.
- [x] (2026-09-05 19:20Z) Page review: suspend-timing question settled in favour of the existing sweep design (see Decision Log); cloud archive recorded as a follow-up.
- [x] (2026-09-05 21:30Z) Page review, round 2: the reversible archive folded into the existing `archived_at` + `archive_reason` pair (new reason `user`), `shelved_at` and its migration dropped, every "destroyed" reader switched to `isTombstoned`; Delete removed from the live menus (Archived view and cloud sandboxes only); host, desktop, and mobile tests updated; page trimmed. Gates re-run: root typecheck 38/38, lint clean, check:i18n clean, host-service and desktop suites green apart from the known environment-only failures.
- [ ] Manual verification matrix in a dev instance (Avi's call; see Validation): the terminal-suspend and post-grace-unarchive scenarios remain unverified by hand.

## Surprises & Discoveries

- Observation: the brief's line numbers for `useHostWorkspaces.utils.ts` (`836-866`) do not exist; the file is 308 lines and `HostWorkspaceRow`/`HostWorkspaceItem` live at lines 40-57.
  Evidence: `wc -l` and `grep -n "interface HostWorkspaceRow"`.
- Observation: `resolveSessionForAttach` is a closure inside the WebSocket upgrade handler; there is no router-level seam to attach a fake `suspended` row without a live pty-daemon, and the daemon-backed suites are `node --test` files that cannot open `better-sqlite3` locally (Electron ABI).
  Evidence: `terminal.ts:3207-3328`; `bun run test:integration:terminal` script uses `node --experimental-strip-types --test`.
  Consequence: the status-branching of `resolveSessionForAttach` is extracted into a pure, exported `planTerminalAttach(record, requestedWorkspaceId)` and unit-tested with bun; the closure delegates to it. The respawn branch itself (the `createTerminalSessionInternal` call) is unchanged code.
- Observation: `useWorkspaceHostTarget` (the hook `useDestroyWorkspace` uses to find a workspace's host) only searches `useHostWorkspaces().workspaces`. Once archived rows are split out, the existing delete dialog would answer `not-found` for an archived row and every delete from the Archived view would fail with `host-unavailable`.
  Evidence: `useWorkspaceHostUrl.ts:36-39`.
  Consequence: `useWorkspaceHostTarget`, `DashboardSidebarDeleteDialog`, and `useDestroyDialogState` search `archivedWorkspaces` as a fallback.
- Observation: `applyWorkspaceChangedEvent` uses `??` to preserve prior values for fields an older host omits. For the archive fields that idiom is wrong: an unarchive event carries `archivedAt: null`, and `null ?? existing` would keep the row archived forever.
  Evidence: `useHostWorkspaces.utils.ts:250` (`lastActivityAt: snapshot.lastActivityAt ?? existing?.lastActivityAt ?? null`).
  Consequence: `archivedAt` and `archiveReason` are mapped with an explicit `!== undefined` check, and a unit test covers the null-on-update case.
- Observation: `disposeSessionAndWait` is called by `disposeSessionsByWorkspaceId` for every non-`disposed` row, including a `suspended` one. With no in-memory session it falls to `closeDaemonSessionById`, which treats an unknown daemon session as success, so destroy still flips the row to `disposed` and deletes it.
  Evidence: `terminal.ts:2478-2525` and `isUnknownDaemonSessionError` handling in the kill path.
- Observation: the bulk delete intent's target type is the full `DashboardSidebarWorkspace` (16 fields), but the dialog only reads `id`, `hostId`, `name`, `branch` off each target.
  Evidence: grep over `DashboardSidebarBulkDeleteDialog/**` shows only those members accessed; the narrowed type typechecks with no other change.
  Consequence: the intent's target type is narrowed to a `BulkDeleteWorkspaceTarget` pick so the Archived view can hand it `AccessibleV2Workspace` rows without fabricating sidebar-only fields.
- Observation (superseded in round 2): `bun run generate` named the first version's migration `0031_fat_barracuda.sql`; the generated name was kept because the brief says never to hand-edit `drizzle/`. That migration no longer exists.
- Observation: the root typecheck (not the desktop one) caught the Expo mobile app: its `HostWorkspaceRow` is the host router's `workspace.list` output type, so adding a field to the list row made it required in mobile's `CloudWorkspaceItem`, and its home list maps `workspace.list` rows straight through with no split.
  Evidence: `@superset/mobile#typecheck` failed on `apps/mobile/hooks/useCloudWorkspaceItems/useCloudWorkspaceItems.ts(34,2)`.
  Consequence: the cloud-row constructor sets the archive fields to null, and `apps/mobile/hooks/useHostWorkspaces` filters `archivedAt == null` so a workspace archived on the desktop is put away on the phone too (and comes back on unarchive). Recorded for Avi in the handoff as the one change outside the brief's two packages.
- Observation (review round): a terminal created in an already-archived workspace by the CLI, MCP, or an automation would have been killed by the reaper on its next tick, because the grace was measured from the workspace's archive time, nothing gated terminal creation on the state, and `workspace.list` still returns archived rows to those callers.
  Evidence: three reviewers and the orchestrator converged on `reaper.ts` `planArchivedSuspends`.
  Consequence: `createTerminalSessionInternal` unarchives a user-archived workspace when a listed, non-adopt terminal opens in it (source `terminal-create`); the planner never suspends a session created after the archive; `workspaces.create` reusing an archived branch unarchives it (source `workspace-create`).
- Observation (review round): the suspend pass ran off a snapshot; an unarchive landing mid-pass still got its just-reopened terminals killed.
  Consequence: each suspend re-reads the workspace flag and skips sessions with an attached socket right before the kill, and suspends run four at a time.
- Observation (review round): the undo toast's `onClick` closed over the archive-time `findRow`, whose list held the pre-archive row, so a failed undo "rolled back" to the live row and resurrected the workspace.
  Consequence: the flow resolves rows through a ref at click time.
- Observation (review round): `?view=archived` was only read once per mount, so the toast link, palette command, and deep-link link did nothing when the Workspaces page was already open; and `viewMode: "archived"` was persisted, so one visit made Archived the default view.
  Consequence: the page follows `search.view` after mount; the store keeps `liveViewMode` and persists that; a bare return to the page lands on it.
- Observation (review round): the archive write was read-then-write, so two requests in one tick could both broadcast and count; folder deletion and the legacy-folder migration iterated only live rows, leaving tags on archived members; the bulk-delete mount lived inside the sidebar, so "Delete all" from the Archived view did nothing while the sidebar was closed.
  Consequence: conditional `UPDATE ... WHERE archived_at IS NULL`; both loops include archived rows; the mount moved to the dashboard layout (the selection provider already prunes deleted ids).
- Observation (review round 2): `origin/main` gained its own `0031_*` and `0032_*` host migrations while this branch carried `0031_fat_barracuda.sql`; folding the archive into the existing columns removed this branch's migration entirely, and with it the journal conflict a merge would have hit.
  Evidence: `git log merge-base..origin/main -- packages/host-service/drizzle` shows #7194; the branch's `drizzle/` now matches the merge base exactly.
- Observation (review round 2): `packages/host-service/test/integration/` is outside the package's `tsconfig` `include`, so renaming the tombstone helpers typechecked clean and only failed at test time (`workspace.integration.test.ts` still called the old names with a destroy reason, which the renamed user-archive function read as a `source`).
  Consequence: the integration test calls `tombstoneLocalWorkspace` / `restoreLocalWorkspaceTombstone`; worth remembering that a green typecheck does not cover `test/`.
- Observation: the "Restored" toast (with Open) was first shown for every unarchive source. From Undo the row simply reappears where it was, and from the deep-link state the route re-renders as the workspace itself, so the toast only makes sense from the Archived view.
  Consequence: the flow shows it for `source === "workspaces-page"` only.

## Decision Log

Names in the entries below are the ones on the branch after round 2 of review: the reversible archive is `archive`/`unarchive` in code and destroy's marker is the "tombstone". Earlier entries that were written with the original `shelve` vocabulary have been re-worded to match, so this document reads as one description of the current branch.

- Decision (superseded 2026-09-05 21:00Z, see the next entry): a separate nullable column `shelved_at` / `shelvedAt` with a `shelve`/`unshelve` data plane, leaving the tombstone pair untouched.
  Rationale: `archivedAt` + `archiveReason` already existed as the destroy tombstone (board Merged/Deleted columns, startup reconciler, `workspace.list` filtering); the brief forbade reusing or renaming them, and a distinct name grepped cleanly.
  Date/Author: 2026-09-05 / worker (settled by the brief).
- Decision: the reversible archive is the existing `archived_at` + `archive_reason` pair with a third reason, `user`; `shelved_at` and its migration are gone. In code the user action is `archive`/`unarchive` (`workspaceCleanup.archive`, `archiveLocalWorkspace`, `archivedWorkspaces`) and destroy's marker is the tombstone (`tombstoneLocalWorkspace`, `restoreLocalWorkspaceTombstone`). `packages/host-service/src/workspaces/archive-state.ts` owns the reason union, the predicates `isTombstoned` / `isUserArchived`, and their SQL twins `tombstoned` / `userArchived` / `notTombstoned`; every reader that means "destroyed" asks `isTombstoned` instead of `archivedAt != null`.
  Rationale: page review. Satya asked why there should be a second column for "when it was archived" and, after the trade-offs were laid out on the page (the reconciler, destroy's rollback, the list filter, branch reuse, the board), still preferred one concept; Avi deferred to him on both threads. The cost is exactly the reader list above; it is paid once in one module and covered by `archive-state.test.ts`. Destroy now captures the row's previous archive state and a failed delete restores it, so deleting from the Archived view and failing returns the row to the Archived view, never to the sidebar. No migration is needed: `archive_reason` is free text.
  Date/Author: 2026-09-05 / Satya Patel, Avi, worker.
- Decision: Delete leaves the live surfaces. The sidebar menu, the Workspaces page menus, bulk selection, and the command palette no longer offer Delete for a host workspace; a host workspace is deleted only from the Archived view (per-row Delete or Delete all, through the unchanged dialogs). Cloud sandboxes, which have no archive, keep Delete everywhere, and the missing-worktree screen keeps its Delete.
  Rationale: page review. Satya: no purpose in having both, cleanup is what agents are for, competitors don't offer a delete next to archive; Avi: "yeah this is valid". One destructive path behind one deliberate step is also the point of the whole change.
  Date/Author: 2026-09-05 / Satya Patel, Avi, worker.
- Decision: a suspended terminal row gets a new durable `status: "suspended"`, written only after a confirmed PTY kill, with its agent binding marked ended (`"terminal-exited"`), never deleted.
  Rationale: leaving the row `active` (both prior attempts) trips the reaper's stale-active sweep after 60s, which flips it to `exited`, and an `exited` row dead-ends the pane with `session-gone` instead of respawning. Ending (not deleting) the binding is what keeps the agent a resume candidate (`resumeCandidatePredicate` needs `endReason === "terminal-exited"` and a surviving `agentSessionId`).
  Date/Author: 2026-09-05 / worker (settled by the brief).
- Decision: every imperative entry point (sidebar row button, sidebar menu, hotkey, palette, page menus, bulk) requests through one intent store (`useArchiveWorkspaceIntent`) drained by one headless `ArchiveWorkspaceMount`, which is the only caller of `useArchiveWorkspaceFlow().archiveWorkspaces`. The Archived view and the deep-link state call the flow hook directly for unarchive.
  Rationale: the flow hook needs `useNavigateAwayFromWorkspace`, which builds a Set of every workspace id and flattens the sidebar order per call; instantiating it per sidebar row would cost O(rows²) on every list change. One mount matches the existing `DeleteWorkspaceMount` / `RemoveFromSidebarMount` pattern, and the brief's requirement (every entry point goes through the same flow, no hand-rolled optimistic updates) is met.
  Date/Author: 2026-09-05 / worker.
- Decision: analytics fire host-side only (`workspace_archived` / `workspace_unarchived` from `trackWorkspaceEvent`, `source` passed through the mutation input), never from the renderer.
  Rationale: the brief wants CLI/MCP archives counted too; double-emitting from the renderer would inflate the rage-click comparison.
  Date/Author: 2026-09-05 / worker.
- Decision: `archive`/`unarchive` broadcast `updated` only when the row actually changed; a repeated call returns the current state without a broadcast.
  Rationale: idempotent, and the 30s fallback refetch already heals a missed event; a redundant broadcast just churns every client's cache.
  Date/Author: 2026-09-05 / worker.
- Decision: `archivedAt` and `archiveReason` ride the `workspace.list` row and the event snapshot as host-only extras, not inside `CloudShapedWorkspace`.
  Rationale: `CloudShapedWorkspace` is documented as the frozen cloud column set; the list row already carried both for tombstones, and the snapshot needs them so a client can move a row between its live and archived lists on `updated`.
  Date/Author: 2026-09-05 / worker.
- Decision: Delete from the Archived view goes through the existing global delete dialog (`useDeleteWorkspaceIntent`) and "Delete all" through the existing bulk dialog (`useBulkDeleteWorkspacesIntent`); the Archived row shows a busy state (from `useDeletingWorkspacesStore`) but no forked error pane.
  Rationale: the brief forbids forking the destroy surfaces. Errors already surface through those dialogs (teardown-failure pane reopens; other errors toast), and a failed destroy restores the row's previous archive state (`restoreLocalWorkspaceTombstone`), so the row simply returns to the Archived list.
  Date/Author: 2026-09-05 / worker.
- Decision: `resolveSessionForAttach`'s record branching is extracted into a pure `planTerminalAttach` helper and unit-tested; the daemon-backed `node --test` suites are left untouched.
  Rationale: see Surprises. The brief asks for a test proving a `suspended` row reaches the respawn branch; the pure helper is the only seam that runs under bun locally.
  Date/Author: 2026-09-05 / worker.
- Decision: no new index.
  Rationale: `workspaces_archived_at_idx` already covers the column the archive now uses; the reaper's lookup runs every five minutes over a per-host table of hundreds of rows at most.
  Date/Author: 2026-09-05 / worker.
- Decision: the Archived view keeps the header's device, project, and Filter controls active and hides only the Display dropdown.
  Rationale: the brief hides Display (sort/history/lanes make no sense for a fixed-order list); the other controls narrow the archived list the same way they narrow the live one and cost nothing.
  Date/Author: 2026-09-05 / worker.
- Decision: keep the suspend on the reaper sweep with a 60 s grace (suspension lands one to six minutes after archiving); a host-side per-archive timer that suspends right after the toast closes was built, then dropped.
  Rationale: page review. Satya first asked why terminals need a lifecycle beyond the toast (expecting less code); Avi deferred to him; once it was clear the suspend is the existing sweep applying one rule (no extra lifecycle code) and that a toast-tied timer would add code, Satya concluded a few minutes of lingering is fine. The timer commit was reverted before push.
  Date/Author: 2026-09-05 / Satya Patel, Avi, worker.
- Decision: cloud sandboxes keep Delete in this PR; cloud workspaces get an archive too, as Conductor does, in a follow-up that Satya has offered to take.
  Rationale: cloud workspaces have no host row; their archive needs a cloud-side flag and sandbox suspend semantics, which is a separate change from this host-local one.
  Date/Author: 2026-09-05 / Satya Patel, Avi, worker.
- Decision (moot after round 2): keep the drizzle-kit generated migration filename (`0031_fat_barracuda.sql`) rather than hand-renaming it. The migration no longer exists; `drizzle/` matches the merge base.
  Date/Author: 2026-09-05 / worker.
- Decision: the mobile app hides archived rows too.
  Rationale: its list comes from the same `workspace.list`; an archived workspace reappearing on the phone would contradict "put away". A one-line filter, no UI. Flagged in the handoff because mobile is outside the brief's stated packages.
  Date/Author: 2026-09-05 / worker.
- Decision: the sidebar row's hover button and menu shortcut both key off `CLOSE_WORKSPACE`, whose label stays "Close Workspace" and whose description becomes "Archive the current workspace".
  Rationale: the label is what the keyboard settings page lists and what users have learned; the description is where the new semantics are explained.
  Date/Author: 2026-09-05 / worker.

## Outcomes & Retrospective

Implemented end to end on branch `archive-delete-experience` (draft PR #7209). The first eight commits built the feature (plan; host archive/unarchive; terminal suspend + reaper; renderer data-plane split; flow + every entry point; Archived view + deep link; i18n catalogs; mobile list filter); a code-review round fixed the findings tabled above; and a page-review round with Satya and Avi changed two product decisions and one data-model decision: the archive now lives in the existing `archived_at` + `archive_reason` pair (reason `user`) with no migration, Delete is offered only from the Archived view (and for cloud sandboxes), and the suspend stays on the reaper sweep. Automated gates after round 2: root `bun run typecheck` 38/38 and `bun run lint` exit 0; `bun run check:i18n` exits 0; host-service `bun test` passes every archive suite (archive router incl. failed-delete-restores-archived, archive-state predicates and SQL, attach planner, reaper planner and loader, suspend-survives-sweep, tombstone list semantics) with only the three pre-existing environment-only failures (unbundled pty-daemon, agent-launch config-dir leak); desktop `bun test` passes 3525 with only the pre-existing env-sensitive LeaderboardRank failure.

What worked: grounding the terminal design in the reaper's stale-active sweep before writing code avoided the trap both prior attempts fell into; extracting `planTerminalAttach` made the attach policy testable without a daemon; one intent queue plus one mount kept the flow to a single instance while every surface still goes through it; running the root typecheck (not just the two packages') caught the mobile consumer.

Not verified here: the manual matrix (same PTYs after Undo; post-grace unarchive respawns with the banner and offers the agent for resume; light/dark; offline remote rows; palette navigation) needs a dev instance of this worktree, never Avi's running app; the live archive → Undo round trip was exercised before round 2 and should be repeated on the unified columns. Follow-ups recorded: CLI/MCP default filtering (rows carry `archivedAt`/`archiveReason`; user-archived rows are still listed), archive for cloud sandboxes (Satya), and the Archived view's home (Avi tried Settings and found the Workspaces page more natural; still open).

## Context and Orientation

Superset is a Turborepo monorepo. Two packages change here:

- `apps/desktop`: the Electron desktop IDE. All UI in this plan lives in its renderer (`apps/desktop/src/renderer`), which is a browser environment (no Node imports). "v2" is the current workspace UI; "v1" is the legacy one that ships in parallel and is untouched.
- `packages/host-service`: a local Node service running on each machine that owns the workspace rows (sqlite via Drizzle ORM, schema in `packages/host-service/src/db/schema.ts`), terminal sessions (a detached "pty-daemon" holds the shell processes; the host-service adopts them), and a tRPC API the renderer calls per host through `getHostServiceClientByUrl(hostUrl)`.

Terms used below:

- **Workspace**: a git worktree (or a project-less "session" folder) with a row in `workspaces`. `type` is `"main"` (the project's own checkout, never deletable or archivable), `"worktree"`, or `"session"`.
- **Archive state**: one column pair, `workspaces.archivedAt` + `archiveReason`, records both ways a workspace leaves the sidebar. A **tombstone** (reason `merged` or `deleted`) is permanent deletion: `workspaceCleanup.destroy` stamps it as its first step, a failed destroy puts the previous state back, the boot-time reconciler finishes a crashed destroy, and rows are kept forever for the board's Merged/Deleted columns. A **user archive** (reason `user`) is the reversible "Archive" built here: the row is still live (worktree, branch, possibly running terminals) and Unarchive clears the pair. `packages/host-service/src/workspaces/archive-state.ts` owns the predicates (`isTombstoned`, `isUserArchived`) and their SQL twins; the renderer has the same two predicates in `useHostWorkspaces.utils.ts`. Any reader that means "destroyed" must use them, never `archivedAt != null`.
- **Terminal session row**: `terminal_sessions` (`status` is `"active"`, `"exited"`, `"disposed"`, and after this plan `"suspended"`). **Agent binding**: `terminal_agent_bindings`, one per terminal that ran a coding agent; `endReason === "terminal-exited"` plus a surviving `agentSessionId` is what makes an agent offered for resume when its terminal is respawned.
- **Reaper**: `packages/host-service/src/terminal/reaper/reaper.ts`, a five-minute sweep. `markStaleActiveRows` flips any `active` row the daemon no longer owns (older than 60s) to `exited`. `reapOrphanedSessions` disposes sessions whose row `shouldReapRow` condemns.
- **Renderer host-workspaces cache**: `apps/desktop/src/renderer/hooks/host-workspaces/useHostWorkspaces/useHostWorkspaces.ts` runs `workspace.list` per host, patches rows from `workspace:changed` events, and persists snapshots to IndexedDB. `HostWorkspacesProvider` shares one instance app-wide as `useHostWorkspaces()`. Every sidebar, palette, and navigation consumer reads `.workspaces` from it.
- **Intent store + mount**: a zustand store holding a one-shot request, drained by a headless component mounted once at the dashboard level (`CommandPaletteHost.tsx`). Used so callers that run outside React (the command palette) or per row (the sidebar) do not each need the router/collections hooks. Existing examples: `DeleteWorkspaceMount`, `RemoveFromSidebarMount`.
- **Lingui**: the i18n layer. Renderer strings use `useLingui().t({ message })` or `<Trans>`; the English text is the message id; `bun run check:i18n` regenerates catalogs and fails on untranslated messages in any of the 17 locales in `packages/i18n/src/locales.ts`.

## Terminal status audit

Every reader of `terminal_sessions.status` in host-service and the renderer, and what it does with the new `suspended` value. "Unchanged" means the existing code already does the right thing.

| Reader | Location | Behaviour with `suspended` | Change |
|---|---|---|---|
| `planStaleActiveRows` / `markStaleActiveRows` | `reaper.ts:53-81, 184-234` | Only `active` rows are considered; the flip is guarded by `eq(status,"active")`. A suspended row is never turned into `exited`. | Unchanged; covered by the suspend-survives-sweep test. |
| `shouldReapRow` | `reaper.ts:89-96` | Condemns `disposed`/`exited`/workspace-less/dispose-requested rows. A suspended row is never in `daemon.list()` (it is only marked after a confirmed kill), so it never reaches the orphan pass. | Unchanged. `planArchivedSuspends` additionally skips anything `shouldReapRow` condemns, so dispose supersedes suspend. |
| `planPortScanSync` | `reaper.ts:123-157` | Registers only `active` rows for port scanning. | Unchanged. |
| `disposeSessionsByWorkspaceId` | `terminal.ts:2478-2525` | Selects `ne(status,"disposed")`, so a suspended row is disposed (no in-memory session, daemon reports unknown, treated as success) and then deleted by the `ne(status,"active")` sweep. Destroy of an archived workspace cleans up fully. | Unchanged. |
| `resolveSessionForAttach` | `terminal.ts:3207-3328` | `disposed`/`exited` answer `session-gone`. A suspended row must skip adoption (no PTY exists) and go straight to the respawn branch with `restoredNotice: true`. | Branching extracted into `planTerminalAttach`; adds the `suspended → respawn` case. |
| `createTerminalSessionInternal` row upsert | `terminal.ts:2817-2833` | `onConflictDoUpdate` sets `status: "active"`, `endedAt: null`. The respawn flips the row back. | Unchanged. |
| `listLiveTerminalSessions` | `terminal.ts:880-930` | Merges daemon-alive rows only when `status === "active"`. | Unchanged. |
| `listTerminalResourceSessions` | `resource-sessions.ts:51-60` | Emits only `active` rows that the daemon lists alive. | Unchanged. |
| pty `onExit` | `terminal.ts:3005-3030` | Sets `exited`. Suspend unsubscribes daemon callbacks before killing, so `onExit` never fires for a suspended session. | Unchanged. |
| `listLiveByWorkspace` / `listLive` / `findLiveActive` | `terminal-agents/persistence.ts:301-381` | Inner-join on `status === "active"`; a suspended terminal's binding reads as not live, so no phantom "agent running" status. | Unchanged. |
| `sweepDefunct` | `terminal-agents/persistence.ts:383-445` | Backfills `endedAt`/`terminal-exited` for unmarked bindings whose row is `exited`/`disposed`. Suspend marks its binding in the same transaction, but the backfill list gains `suspended` as belt and braces. | `inArray(status, ["exited","disposed","suspended"])`. |
| `terminalAgents.dispose` route | `trpc/router/terminal/terminal.ts:270-296` | Marks the binding `disposed` then calls `disposeSessionAndWait`; works on a suspended row (turns it into a deliberate kill). Only reachable from a pane, which respawns first. | Unchanged. |
| `terminal_sessions_status_idx` | `schema.ts:42` | Plain text index; a new value needs no migration. | Unchanged. |
| `daemon-loss-sweep.ts`, `archived-workspace-reconcile.ts` | host-service runtime | No status reads. | Unchanged. |
| Renderer terminal hooks (`useTerminalLifecycle`, `useTerminalStream`, `useTerminalColdRestore`, `workspaceRun.ts`) | `screens/main/.../Terminal/hooks` | Read `exited`/`session-gone` from WebSocket messages and lifecycle events, never the DB status. A suspended row never produces `session-gone`. | Unchanged. |
| `useAutoAdoptBackgroundSessions`, Background terminals dropdown | `v2-workspace/$workspaceId/hooks` | List daemon-alive sessions; a suspended session is not alive, so it is neither adopted nor listed as background. | Unchanged. |

## Plan of Work

### Milestone 1: host-service archive state and the archive/unarchive data plane

No schema migration. In `packages/host-service/src/db/schema.ts`, `archiveReason` is typed `ArchiveReason` (`"merged" | "deleted" | "user"`, imported as a type from the new module below) and the comment on the pair explains the two meanings. `archive_reason` is plain `text` with no CHECK constraint, so the new value needs no migration; `drizzle/` stays as it is on `main`.

New `packages/host-service/src/workspaces/archive-state.ts`: `ARCHIVE_REASONS`, `ArchiveReason`, `TombstoneReason` (`Exclude<ArchiveReason, "user">`), `USER_ARCHIVE_REASON`, `ArchiveState` (`{ archivedAt, archiveReason }`), `LIVE_ARCHIVE_STATE`, the predicates `isTombstoned(row)` (stamped with any reason but `user`, including a reason-less stamp) and `isUserArchived(row)`, and the SQL twins `notTombstoned`, `userArchived`, `tombstoned` built with drizzle's `and`/`or`/`eq`/`isNull`/`ne` over the `workspaces` table (module-level `SQL` values are reusable across queries). Tested in `archive-state.test.ts` against an in-memory sqlite seeded with one row per state.

`packages/host-service/src/events/types.ts`: `WorkspaceSnapshot` carries `archivedAt: number | null` and `archiveReason: "merged" | "deleted" | "user" | null` (the tombstone rides a `deleted` event with no snapshot; a snapshot only carries a tombstone when a failed delete restores the row).

`packages/host-service/src/workspaces/local-workspace-store.ts`: `toWorkspaceSnapshot` maps both fields. The destroy helpers are renamed and given rollback state: `tombstoneLocalWorkspace(ctx, id, reason: TombstoneReason): ArchiveState | undefined` stamps the tombstone unless the row already is one, broadcasts `deleted`, and returns the state to put back on failure (the row as it was, or live for a row that was already a tombstone, so a retried delete that fails again still revives it as retryable); `restoreLocalWorkspaceTombstone(ctx, id, previous)` writes `previous` back and broadcasts `created`. The user action is `archiveLocalWorkspace(ctx, id, source)` (conditional `UPDATE ... SET archived_at = now, archive_reason = 'user' WHERE id = ? AND archived_at IS NULL`; broadcasts `updated` and tracks `workspace_archived` with `source` only when a row changed) and `unarchiveLocalWorkspace(ctx, id, source)` (`... WHERE id = ? AND <userArchived>`; `updated` + `workspace_unarchived`). `touchLocalWorkspaceActivity` ignores tombstones only. The source unions live in `packages/host-service/src/workspaces/archive-sources.ts`.

`packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts`: `archive` and `unarchive` mutations with input `{ workspaceId, source }`, both returning `{ success: true, archivedAt }`. `archive`: `isMainWorkspace` guard (`BAD_REQUEST`), then `assertArchivable` (`NOT_FOUND` when no row or `isTombstoned`), then `archiveLocalWorkspace`. `unarchive`: `assertArchivable`, then `unarchiveLocalWorkspace`. `runDestroy` keeps the `previous` state returned by `tombstoneLocalWorkspace` and calls `restoreLocalWorkspaceTombstone` in its catch; the profile-name check uses `notTombstoned`.

Every other host reader that meant "destroyed" switches from `isNull(workspaces.archivedAt)` / `row.archivedAt == null` to `notTombstoned` / `!isTombstoned(row)`: `workspace.list`'s default filter and its `worktreeExists`, `findExistingWorkspaceByBranch` and the adopt path in `workspace-creation` (both unarchive a user-archived match, source `workspace-create`), the reconciler (`tombstoned` for candidates, `notTombstoned` for live path owners), the pull-request runtime (five sites; selections gain `archiveReason`), the git watcher, `get-linked-workspace`, `list-project-worktrees`, `search-branches`, and the usage history's `agent-prs` (`tombstoned`). `project.ts`'s worktree removal already reads "live or directory exists" and is unchanged.

Tests in `packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.archive.test.ts` (bun:sqlite harness; caller via `createCallerFactory(workspaceCleanupRouter)`): happy path stamps `archivedAt` with reason `user` and broadcasts one `updated` event carrying both; repeat is idempotent; main refused; tombstoned refused; unknown id `NOT_FOUND`; unarchive clears both and broadcasts; unarchive on a live row is a no-op; archive leaves `terminal_sessions` rows and `terminal_agent_bindings` untouched; analytics stub sees `workspace_archived` with `source`; and, on the store helpers directly, a failed delete of an archived workspace puts it back archived (not live), a failed delete of a live one revives it live, and a failed retry of an existing tombstone revives it live. `test/integration/workspace.integration.test.ts` covers the list's tombstone semantics.

### Milestone 2: terminal suspend and the reaper planner

`packages/host-service/src/terminal/terminal.ts`:

1. Extract `killSessionRuntime(terminalId): Promise<{ session: TerminalSession | undefined; closeResult: DaemonCloseResult }>` from `disposeSessionAndWait`: everything from `sessions.get` through `portManager.unregisterSession` and awaiting the close promise. `disposeSessionAndWait` keeps its `disposeRequestedAt` stamp, calls the helper, and keeps its `disposed` write + exit broadcast.
2. Add `markTerminalSessionSuspended(db, terminalId, endedAt)`: one transaction that sets `status: "suspended", endedAt` where `status = "active"` and calls `markTerminalAgentBindingEnded(tx, terminalId, "terminal-exited", endedAt)`. Exported so the reaper test can exercise the durable state without a daemon.
3. Add `suspendSessionAndWait(terminalId, db): Promise<{ suspended: boolean }>`: `killSessionRuntime`, and only when `closeResult.succeeded` call `markTerminalSessionSuspended` and broadcast the same `exit` lifecycle event dispose does (so any stale reader refetches). A failed kill leaves the row `active` for the next pass.
4. Extract the record branching of `resolveSessionForAttach` into an exported pure function `planTerminalAttach({ record, requestedWorkspaceId })` returning `{ kind: "session-gone", error } | { kind: "error", error } | { kind: "adopt", workspaceId } | { kind: "respawn", workspaceId }` in a new file `packages/host-service/src/terminal/attach-plan.ts` (`getTerminalWorkspaceMismatchError` moves in alongside or is imported). `suspended` → `respawn`. The closure keeps the no-row create-on-attach path and the adopt-then-respawn fallback, delegating the record decision to the helper.
5. `sweepDefunct` in `terminal-agents/persistence.ts`: add `"suspended"` to the backfill `inArray`.

`packages/host-service/src/terminal/reaper/reaper.ts`: add `ARCHIVE_SUSPEND_GRACE_MS = 60_000`, `planArchivedSuspends({ liveSessions, rowById, archivedWorkspaces, now, graceMs })` (skip rowless, non-`active`, `shouldReapRow` rows, workspaces not in the map, inside-grace, and sessions created after the archive), `loadArchivedWorkspaces(db)` (`where(userArchived)`, so a tombstone's sessions are left to destroy), `isWorkspaceStillArchived(db, id)` re-read before each kill, and a suspend pass in `reapOrphanedSessions` after the orphan pass that returns a `suspended` count logged by `startTerminalReaper`. `createTerminalSessionInternal` unarchives a user-archived workspace when a listed, non-adopt terminal opens in it (source `terminal-create`).

Tests: `reaper.test.ts` gains the planner cases (before grace, after grace, dispose supersedes, unarchived never suspended, idempotent when the session is no longer alive, created-after-archive skipped, rowless/workspace-less skipped), a `loadArchivedWorkspaces` case (user-archived rows only), and the durable-state test: insert workspace + `active` row + open binding, `markTerminalSessionSuspended`, advance the clock past both grace windows, run `markStaleActiveRows` with an empty alive set and `planArchivedSuspends` with no live sessions, assert the row is still `suspended`, the binding is ended with `terminal-exited`, and `findResumeCandidateBinding` returns it. New `attach-plan.test.ts`: no row → `create-or-gone`, `disposed`/`exited` → `session-gone`, `suspended` → `respawn`, `active` → `adopt`, missing workspace → error, mismatch → error.

### Milestone 3: renderer data plane

`useHostWorkspaces.utils.ts`: `archivedAt?` / `archiveReason?: WorkspaceArchiveReason | null` on `HostWorkspaceRow` (optional: an older host omits them), both required and normalized to null on `HostWorkspaceItem` (in `toHostWorkspaceItem`), and in `applyWorkspaceChangedEvent` both mapped with an explicit `!== undefined` check so an unarchive's `null` wins over the cached value. Export `WorkspaceArchiveReason`, the predicates `isTombstonedWorkspace(row)` and `isUserArchivedWorkspace(row)` (re-exported from the hook's `index.ts`), and `splitArchivedWorkspaces(items)` returning `{ workspaces, archivedWorkspaces }` by the user reason; a tombstone stays on the live side because it only reaches the list on `includeArchived`, where the board expects it.

`useHostWorkspaces.ts`: `UseHostWorkspacesResult` gains `archivedWorkspaces: HostWorkspaceItem[]` and `findWorkspace(id)`; the tombstone query filters with `isTombstonedWorkspace`; the memo splits the merged rows before appending tombstones to `workspaces`.

`useWorkspaceCreates.ts` optimistic row: `archivedAt: null, archiveReason: null`. `useWorkspaceHostUrl.ts` (`useWorkspaceHostTarget`), `DashboardSidebarDeleteDialog.tsx`, `useDestroyDialogState.ts`: resolve rows through `findWorkspace`. `deriveBoardColumn` and the board card treat only a tombstone (reason not `user`) as Merged/Deleted; the pin filter's "tombstones are never pinned" rule uses `isTombstonedWorkspace`.

`useAccessibleV2Workspaces.ts`: option `archivedView` (rows from `archivedWorkspaces` instead of `workspaces`; independent of `includeArchived`, which is about tombstones), `archiveReason` widened on `AccessibleV2Workspace`, and `archivedCount` on the result (length of the scoped source's `archivedWorkspaces` after the org filter, independent of `archivedView`). `apps/mobile/hooks/useHostWorkspaces` filters `archivedAt == null` (the host never serves tombstones by default, so that is exactly "not user-archived").

Tests in `useHostWorkspaces.utils.test.ts`: created event carries both fields; updated event with `archivedAt: null` clears both; event without the fields preserves the cached values; `splitArchivedWorkspaces` partitions by the user reason and keeps tombstones on the live side. `deriveBoardColumn.test.ts`: a user archive derives like a live row.

### Milestone 4: the archive flow and every entry point

New `apps/desktop/src/renderer/lib/workspaces/useArchiveWorkspaceFlow/useArchiveWorkspaceFlow.tsx` (+ `index.ts`). `useArchiveWorkspaceFlow()` returns `archiveWorkspaces({ workspaceIds, source })` and `unarchiveWorkspace({ workspaceId, source, open? })`. It resolves rows through `useHostWorkspaces().findWorkspace` (read through a ref at click time), host URLs via `cache.resolveHostUrl`, refuses `type === "main"` and sandbox hosts, skips rows already archived or tombstoned, records whether the active route is one of the ids, calls `navigateAwayFromWorkspace(activeId, new Set(ids))` first, optimistically upserts `{ ...row, archivedAt: now, archiveReason: "user" }`, runs the `workspaceCleanup.archive` mutations with `Promise.allSettled`, restores the captured rows and invalidates the host on failure, and shows one toast keyed `archive-<id>` (single) or `archive-bulk-<n>` (bulk) with an Undo / Undo all action and a "View archived workspaces" description link. Undo dismisses the toast, unarchives, and, when the archived workspace was the open route, navigates back to it. Unarchive shows `Restored "{name}"` with an Open action. All copy through `useLingui().t`.

New `renderer/stores/archive-workspace-intent.ts` (queue of `{ workspaceIds, source }` requests) and `renderer/commandPalette/ui/ArchiveWorkspaceMount/ArchiveWorkspaceMount.tsx`, mounted next to `DeleteWorkspaceMount` in `CommandPaletteHost.tsx`; the mount drains the queue head in an effect.

Entry points:

- `DashboardSidebarExpandedWorkspaceRow.tsx`: new optional `onArchiveWorkspaceClick`; when set, the hover button renders `HiMiniArchiveBox` with tooltip "Archive workspace" and the `CLOSE_WORKSPACE` hotkey on the active row; otherwise the existing close button (cloud rows).
- `useDashboardSidebarWorkspaceItemActions.ts`: `requestArchive` pushes `{ workspaceIds: [id], source: "sidebar" }`; `requestArchiveFromMenu` uses `"sidebar-menu"`. `DashboardSidebarWorkspaceItem.tsx` passes them for non-main, non-cloud rows.
- `DashboardSidebarWorkspaceContextMenu.tsx`: `onArchive?` item with `LuArchive`, showing the shortcut. `onDelete?` is passed only for rows that cannot archive (cloud sandboxes), where it shows the shortcut instead; a host workspace has no Delete in this menu.
- `_dashboard/layout.tsx`: the v2 branch of `CLOSE_WORKSPACE` requests `{ source: "hotkey" }`. Registry description → "Archive the current workspace"; label stays "Close Workspace".
- `commandPalette/modules/workspace/commands.tsx`: "Archive workspace" (`ArchiveIcon`, `hotkeyId: "CLOSE_WORKSPACE"`, keywords `["close","put away"]`) for non-main, non-cloud; "Delete workspace" (`Trash2Icon`, on the hotkey) only for cloud sandboxes. "Remove from sidebar" switches to `PanelLeftCloseIcon` so the archive glyph is unambiguous.
- `commandPalette/modules/navigation/commands.tsx`: "Archived workspaces" (`ArchiveIcon`) → `ctx.navigate("/v2-workspaces", { search: { view: "archived" } })`; `CommandContext.navigate` widened in `core/types.ts` and `core/ContextProvider.tsx`.
- `V2WorkspaceContextMenu.tsx`: `archive` action + "Archive" item (`source: "workspaces-page"`) for archivable rows; Delete only for cloud sandboxes.
- `DashboardSidebarBulkActions.tsx` and `DashboardSidebarWorkspaceBulkContextMenu.tsx`: Archive button / "Archive N Workspaces" item (the Delete button and item are gone), filtering out main and cloud rows, `source: "bulk"`, then `clearSelection()`.

### Milestone 5: the Archived view and the deep-link state

`v2WorkspacesFilterStore.ts`: `V2WorkspacesViewMode = "list" | "board" | "archived"`. `page.tsx`: `validateSearch` accepts `"archived"`; pass `includeArchived: true` (tombstones stay on so view switches don't churn queries) and `archivedView: viewMode === "archived"`; render `V2WorkspacesArchived` for the third mode; pass `archivedCount` to the header. `V2WorkspacesHeader.tsx`: third fieldset button (`LuArchive`, label "Archived", muted count when non-zero), Display dropdown hidden in archived mode, Display group label "Archived" → "History" with `LuHistory`.

New `v2-workspaces/components/V2WorkspacesArchived/` (`V2WorkspacesArchived.tsx`, `index.ts`, `components/ArchivedWorkspaceRow/`). Rows sorted by `archivedAt` desc; empty state gated on `isReady`; "Delete all" pushes eligible rows into `useBulkDeleteWorkspacesIntent` (target type narrowed to `BulkDeleteWorkspaceTarget = Pick<..., "id" | "hostId" | "name" | "branch">`); per-row Delete pushes into `useDeleteWorkspaceIntent`; Unarchive calls the flow hook with `source: "workspaces-page"`; busy state from `useDeletingWorkspacesStore`; offline gating `hostType !== "local-device" && !hostIsOnline` with a `Badge` and tooltip-wrapped disabled buttons; "Archived {relative}" via `formatRelativeTime` from `@superset/i18n/format`; PR chip via `PRIcon` + number when `pr` is present.

`v2-workspace/$workspaceId/layout.tsx`: resolve the id through `findWorkspace`; when the row `isUserArchivedWorkspace`, render new `WorkspaceArchivedState` (in `v2-workspace/components/`) with Unarchive (`source: "deep-link"`) and "View archived workspaces"; skip the `ensureWorkspaceInSidebar` effect for archived rows.

### i18n

After all strings are in place: `bun run check:i18n` from the root lists untranslated ids per locale; fill each locale's `messages.po` by a throwaway script in the scratchpad (never committed), rerun until clean, commit the catalogs with the code.

## Concrete Steps

    cd packages/host-service
    bun test                    # all green, incl. workspace-cleanup.archive, archive-state, reaper, attach-plan
    bun run typecheck

    cd ../../apps/desktop
    bun test                    # incl. useHostWorkspaces.utils, page search validation
    bun run typecheck

    cd ../..
    bun run lint:fix && bun run lint
    bun run typecheck
    bun run check:i18n

## Validation and Acceptance

Automated gates are the four commands above exiting 0. Manual matrix (in a dev instance of this worktree, `RENDERER_REMOTE_DEBUG_PORT=9222 bun dev` after setup):

1. Archive a workspace with two running terminals (one running an agent), Undo inside the toast: same processes, no "Session Contents Restored" banner, agent status intact.
2. Archive, wait past `ARCHIVE_SUSPEND_GRACE_MS` and one reap pass (shorten both locally), unarchive, open: both shells respawn with the banner; the agent is offered for resume.
3. Archive the open workspace: clean navigate-away; Undo returns to it.
4. Hotkey, sidebar button, sidebar menu, palette, list row, board card, bulk toolbar and bulk menu all archive with a toast; palette "Archived workspaces" lands on the view.
5. Archived view: rows with PR chip and project, search filters, Unarchive optimistic with the Open toast, per-row Delete opens the existing dialog, a failed delete leaves the row archived, Delete all runs the bulk dialog, offline remote rows disabled with tooltip, empty state only after hosts settle, light and dark.
6. Deep link to an archived workspace shows the archived state; Board Merged/Deleted, "History" lookback, and every existing delete surface still work; v1 unaffected.

## Idempotence and Recovery

There is no migration to apply or roll back; a dev host database that applied the earlier `shelved_at` migration keeps a harmless unused column (drizzle's migrator compares timestamps, so the dropped journal entry is not re-applied). All host mutations are idempotent. The renderer's optimistic updates restore the captured row on failure and invalidate the host, so a failed archive never leaves a workspace vanished.

## Interfaces and Dependencies

Host-service tRPC (`workspaceCleanup` router):

    archive:   { workspaceId: string; source: "sidebar" | "sidebar-menu" | "hotkey" | "command-palette" | "workspaces-page" | "bulk" }
               → { success: true; archivedAt: number | null }
    unarchive: { workspaceId: string; source: "undo-toast" | "workspaces-page" | "deep-link" | "terminal-create" | "workspace-create" }
               → { success: true; archivedAt: number | null }

Archive state (`packages/host-service/src/workspaces/archive-state.ts`): `ArchiveReason = "merged" | "deleted" | "user"`, `isTombstoned(row)`, `isUserArchived(row)`, SQL `tombstoned` / `userArchived` / `notTombstoned`. Store: `tombstoneLocalWorkspace(ctx, id, reason) → ArchiveState | undefined`, `restoreLocalWorkspaceTombstone(ctx, id, previous)`, `archiveLocalWorkspace(ctx, id, source)`, `unarchiveLocalWorkspace(ctx, id, source)`.

Event bus: `WorkspaceSnapshot.archivedAt: number | null`, `archiveReason: ArchiveReason | null`; archive/unarchive broadcast `eventType: "updated"`.

Terminal: `terminal_sessions.status` gains `"suspended"`; `suspendSessionAndWait(terminalId, db)`, `markTerminalSessionSuspended(db, terminalId, endedAt)`, `planTerminalAttach({ record, requestedWorkspaceId })`, `planArchivedSuspends(...)`, `loadArchivedWorkspaces(db)`, `ARCHIVE_SUSPEND_GRACE_MS`.

Renderer: `useHostWorkspaces().archivedWorkspaces` and `.findWorkspace(id)`; `isTombstonedWorkspace` / `isUserArchivedWorkspace`; `useArchiveWorkspaceFlow()`; `useArchiveWorkspaceIntent`; `V2WorkspacesViewMode` includes `"archived"`; `CommandContext.navigate(path, { search? })`.

## Artifacts and Notes

Follow-up (not in this PR): `superset workspaces list` and MCP `workspaces_list` receive `archivedAt`/`archiveReason` on each row and keep listing user-archived rows; decide whether the CLI default should hide them, matching how tombstones stayed CLI-unaware.

Revision note (2026-09-05 08:10Z): initial plan, written before implementation.

Revision note (2026-09-05 18:25Z): review round folded in (see Surprises "review round" entries). Deferred with rationale: a server-side `includeShelved` flag on `workspace.list` (the brief keeps CLI defaults unchanged; unarchive-on-use removes the reaper hazard); the hotkey archiving without the old running-process prompt (archive is reversible and the agent is offered for resume, so a product call rather than a bug); sharing the reaper's status-flip transaction with `markTerminalSessionSuspended`; a batch shelve endpoint for bulk; the hover-button JSX duplication in the sidebar row; a second window still attached to an archived workspace when the reaper suspends it sees its pane close without reconnecting (same as dispose today).

Revision note (2026-09-05 12:30Z): closeout after implementation. Progress, Surprises & Discoveries (migration name, mobile consumer, Restored-toast scope), Decision Log, and Outcomes reflect the final state of the branch. The plan stays in the active folder until a PR exists; move it to `done/` with the PR.

Revision note (2026-09-05 21:40Z): page review round 2. Data model folded into `archived_at` + `archive_reason` (reason `user`), `shelved_at` and its migration removed, the `shelve` vocabulary replaced by `archive`/`unarchive` (user action) and "tombstone" (destroy) throughout this document so it describes the branch as it is; Delete removed from the live menus; Context, Milestones 1–5, Interfaces, Decision Log, Surprises, and Outcomes updated accordingly.
