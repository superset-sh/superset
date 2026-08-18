# Offline-first workspaces — follow-up PRs

Work deferred out of the offline-first PR (#5452), grouped into pickup-able PRs.
Context: `20260703-1914-offline-first-workspace-table-execplan.md`. End-state map:
`offline-first-workspace-table-reference.md`.

Two buckets: **small hardening** (ship anytime) and **R3** (the cloud-teardown
release, gated on desktop adoption telemetry).

## Small hardening — independent, ship anytime

- **PR-runtime branch renames don't broadcast.** An in-place git branch rename
  detected by `PullRequestRuntimeManager` updates host.db but emits no
  `workspace:changed`, so the sidebar shows the old branch until the 30s refetch.
  Thread the event bus into the PR runtime and emit on branch change.
  Files: `packages/host-service/src/runtime/pull-requests/pull-requests.ts`.

- **taskId doesn't reach the cloud from the host.** Host `workspace.update`
  task-link changes stay local — cloud `updateNameFromHost` only accepts
  name/branch, so old builds reading Electric miss host-side task links during
  dual-write. Additive: let `updateNameFromHost` carry `taskId`.
  Files: `packages/trpc/src/router/v2-workspace/v2-workspace.ts`, host `workspace.update`.

- **Reconciler retries permanent rejections forever.** A row the cloud rejects
  with BAD_REQUEST/NOT_FOUND (e.g. project deleted cloud-side) gets re-pushed
  every 60s and logs each pass. Classify permanent rejections and stop retrying
  (mark the row terminally, or drop it).
  Files: `packages/host-service/src/runtime/workspace-cloud-sync.ts`.

- **`hostReachable` computed but unused.** Offline remote-host rows render as if
  live and their write affordances aren't disabled. Wire it into the sidebar/UI
  (disable rename/delete for unreachable hosts, show an offline affordance) or
  drop the field.
  Files: `apps/desktop/.../useHostWorkspaces`, consumers.

## Verification still owed (pre-broad-rollout)

- **True Wi-Fi-off cold-boot drill.** Process-kill drills can't exercise
  `navigator.onLine`; the `networkMode: "always"` fix needs a real airplane-mode
  boot to confirm the sidebar renders and create/rename/delete work.
- **Remote-host fan-out live test.** CDP drills so far were local-host only.
  Drive a second machine over relay: live rows, `workspace:changed` across hosts,
  and the IndexedDB last-seen render when the peer goes offline.
- **Manual MCP `workspaces_list` against a live host** (once MCP flips to fan-out
  in R3 — see below).

## Open decisions

- **Drop the remote-host IndexedDB cache?** (saddlepaddle, PR review) — ~40 lines
  in the fan-out hook. Without it, an offline machine's workspaces vanish from the
  sidebar instead of showing last-seen. Cheap either way; product call.
- **Cross-version hosts.** Reads degrade gracefully (old remote host's rows still
  surface via Electric fallback), but rename/task-link to an old *remote* host's
  workspace fails (it lacks the new `workspace.update`). Either accept under the
  "we don't support host version skew" stance, or add a renderer rename→cloud
  fallback for the rollout window.

## R3 — cloud teardown (one release, gated on desktop-adoption telemetry)

Ship only when PostHog shows pre-R2 desktop builds are negligible. Cloud/API
deploy first, then the release that removes the desktop-side fallback. The Neon
migration is **user-run** (per AGENTS.md).

- **Flip MCP tools to host fan-out.** Restore `packages/mcp-v2/src/host-workspaces.ts`
  (from git before commit `67961d50a`) and repoint the workspace/terminal/agent/
  automation tools at it; re-add `packages/mcp-v2/src` to the CI guard
  (`scripts/check-cloud-workspace-usage.sh`). MCP was kept cloud-backed because it
  deploys with the cloud, weeks before hosts ship `workspace.list` — safe to flip
  only once the cloud table is going away.
- **Delete the cloud workspace surface:** `packages/trpc/src/router/v2-workspace/`
  + registration; `verifyWorkspaceInOrg` and the legacy automation branch
  (`packages/trpc/src/router/automation/automation.ts`); the `v2_workspaces` case
  in `apps/electric-proxy/src/where.ts`; both `apps/web/src/app/workspaces/` pages.
- **Delete the desktop fallback:** the Electric `v2Workspaces` collection and the
  read-through merge in `useHostWorkspaces`.
- **Delete host dual-write:** the reconciler, `pushWorkspaceCreateToCloud`,
  `cloudSyncedAt`, the `workspace_cloud_deletes` tombstone table, and the backfill.
- **Move PostHog capture host-side:** `workspace_created`/`workspace_deleted`
  (currently fired in the cloud router).
- **Neon migration (user-run):** drop `chat_sessions.v2WorkspaceId` FK → plain
  uuid tag, then drop `v2_workspaces`. Generate on a Neon branch per AGENTS.md.
- **Delete this guard:** `scripts/check-cloud-workspace-usage.sh` (its whole
  reason to exist is gone once the cloud router is deleted).
- Grep sweep as the done-check: no `v2Workspace`/`v2_workspaces` references remain
  outside historical migrations and automation `v2WorkspaceId` tag columns.

## Declined (not doing unless revisited)

- SQLite CHECK constraint on host.db `workspaces.type` — needs a table rebuild;
  the typed store already narrows writes. R3-hardening candidate at most.
- Async `existsSync` in `workspace.list` — µs at real row counts; matches the
  existing `workspace.get` pattern.
