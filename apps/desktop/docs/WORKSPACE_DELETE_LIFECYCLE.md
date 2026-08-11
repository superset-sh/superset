# Workspace Delete: Lifecycle, Edge Cases, Failure Modes

Covers the v2 local workspace delete pipeline (`workspaceCleanup.destroy` in
`packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts`)
and its renderer contract. Sessions delete through the same pipeline (they are
workspaces with no project row).

## Pipeline order (archive-first)

| Step | What | On failure |
|------|------|-----------|
| 0 | **Archive (commit point)** — tombstone `archivedAt`/`archiveReason`; broadcast drops the row from every list | — |
| 1 | Preflight dirty-worktree check (skipped when `force`) | CONFLICT → un-archive |
| 2 | Teardown script (per `teardownMode`) | blocking: PRECONDITION_FAILED → un-archive |
| 3 | Local cleanup: PTYs, worktree removal | throw → un-archive |
| 4 | Legacy cloud delete (best-effort, skipped for sessions) | warning only |
| 5 | Optional branch delete | warning only |
| 6 | Caches | warning only |

**The archive commit is deliberately FIRST** — before the (potentially slow)
git preflight and teardown script — so the row leaves the sidebar/board the
moment the user confirms (~200 ms measured, broadcast-bound). Any failure in
steps 1–3 un-archives, so the row *reappears* instead of being stuck
half-deleted. Telemetry fires only after step 6 succeeds.

## Two consent flags (never conflated)

- **`force`** — git-destructive consent only: skips the dirty-worktree
  preflight. (Worktree removal is always double-forced and branch delete
  always uses `-D` — the deleteBranch checkbox is the consent there.) Set by
  a warned "Delete anyway" confirm and by the silent dirty-race retry.
  **Teardown still runs.**
- **`skipTeardown`** — consent to abandon the teardown script. Set ONLY by
  the retry button on the teardown-failed pane (single and bulk).

These were one flag originally, which meant editing any tracked file (dirty
worktree → warned confirm → force) silently disabled the user's teardown
script. Non-interactive callers (CLI/SDK/MCP via `workspace.delete`) use
`teardownMode: "best-effort"` instead: teardown always runs, failures degrade
to warnings (#6174).

## Failure modes

| Scenario | Behavior |
|----------|----------|
| **Blocking teardown failure** | Row vanishes on confirm → teardown fails → row reappears (un-archive) and the globally-mounted dialog re-opens as "Teardown exited with code N" with the script's output tail. The retry sets `skipTeardown: true`; Cancel leaves the workspace fully alive. Applies to warned deletes too — `force` no longer bypasses teardown. |
| **Dirty-worktree race** (clean at dialog-open, dirty by destroy time) | Archive → preflight CONFLICT → un-archive → renderer silently retries with `force: true` (git consent only; teardown still runs) → re-archive → deleted. The row blips back for ~100 ms; no error is surfaced. The retry is only for `conflict` — never for `in-progress`. |
| **Indeterminate preflight** (git status timeout/pool failure) | Fails closed (INTERNAL error, un-archive) rather than skipping the dirty check on a destructive path. Retry usually succeeds; `force` is the escape hatch. |
| **Worktree removal fails** (still registered after `git worktree remove`) | Throw → un-archive; workspace stays visible and retryable rather than orphaning disk state. |
| **Host crash mid-delete** | The tombstone is the durable delete-intent record. On startup `runArchivedWorkspaceReconcile` finishes interrupted deletes with best-effort teardown. Path-reuse guard: a tombstone whose `worktreePath` is owned by a live row is left alone (`selectStranded`), so re-created branches never get a healthy worktree rm'd. |
| **Concurrent destroy** | Process-local `destroysInFlight` guard → CONFLICT with `deleteInProgress` cause → renderer shows a toast and does NOT force-retry. Because the row is already gone (archive-first), UI-initiated double-deletes are mostly impossible anyway. |
| **Main workspace** | BAD_REQUEST, never archived. |
| **Deleting the viewed workspace** | Renderer navigates away up-front (before the RPC), so the route never 404s; teardown failure still re-opens the global dialog on whatever route the user landed on. |
| **Repo with no remote** | `rev-list HEAD --not --remotes` counts *every* commit as unpushed → the dialog always warns → confirm becomes `force`. Since the flag split, teardown still runs; the only cost is a skipped preflight. |

## Renderer contract

- **The delete dialog is globally mounted** (`DeleteWorkspaceMount`, driven by
  `useDeleteWorkspaceIntent`). Never mount `DashboardSidebarDeleteDialog`
  under a workspace row: archive-first removes the row (and would unmount the
  dialog) the instant the destroy starts, killing the teardown-failure
  force-retry prompt. All entry points — sidebar row, board card, palette,
  ⌘⇧⌫ hotkey, missing-worktree screen — call
  `useDeleteWorkspaceIntent.getState().request(...)`.
- The intent store latches: closing the dialog only flips `open`; the target
  stays mounted so the in-flight destroy can re-open it on failure. The mount
  keys the dialog by `workspaceId` so state never leaks between targets.
- `useDeletingWorkspacesStore` marks ids with a destroy in flight; navigation
  targeting and shortcuts skip them during the pre-broadcast window and the
  reappear-on-failure case.
- On success the renderer also drops the row from the host-workspaces cache
  explicitly (`removeWorkspace`) so the UI never depends on the socket
  broadcast.
- Tombstones reach the renderer via a dedicated query key
  (`host-service/workspaces/archived/...`), never the persisted live-list
  cache (#6296).

## Verified 2026-08-09 (CDP, real UI input)

- Happy path with 3 s teardown: row removed **276 ms** after confirm; teardown
  started ~1 s later and finished ~3 s after that; row never returned.
- Blocking teardown failure: row removed 198 ms after confirm, reappeared
  ~1.1 s later, failure pane opened with output tail; force-retry deleted with
  teardown skipped; tombstone row (`archiveReason: "deleted"`) written before
  the removal broadcast.
- Dirty race, concurrent-destroy CONFLICT, main-workspace guard, cancel-path
  restore, and delete-while-viewing navigation all verified as tabled above.
