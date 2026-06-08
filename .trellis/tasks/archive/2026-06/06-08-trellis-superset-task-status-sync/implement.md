# Implementation Plan

## Checklist

### Initial Slice

- [x] Inspect current Task -> Workspace launch payloads and identify where
      `taskId`, `workspaceId`, and Trellis setup result converge.
- [x] Design the Trellis task mirror/link writer:
      - missing Trellis task -> create one conservatively
      - existing linked Trellis task -> reuse
      - existing user Trellis files -> preserve
- [x] Add Superset sync hook script and tests for:
      - no `TASK_JSON_PATH`
      - no `meta.supersetTaskId`
      - start -> `started`
      - archive -> `completed`
      - finish/no-op
      - missing CLI/auth/status
- [x] Add config merge helper and tests for preserving existing hooks.
- [x] Wire hook installation into guided workspace setup only.
- [x] Add focused host-service tests for link metadata and hook installation.
- [x] Add source-level test for Task-opened workspace bridge wiring.
- [x] Run focused tests, host-service typecheck, desktop typecheck, and root
      lint.
- [x] Commit the initial slice as
      `96bf41b2c feat(code): sync trellis task state to superset tasks`.

### Reopened Acceptance Bug

Real desktop validation showed the initial slice was incomplete:

- A Task-opened workspace had `.trellis/config.yaml` hooks installed.
- The active Trellis task was `in_progress`, but its `task.json.meta` was `{}`.
- The hook therefore could not resolve the linked Superset Task.
- The bundled local CLI existed, but reported `Not logged in` because Agent
  terminal environments intentionally do not inherit desktop auth secrets.

Fix checklist:

- [x] Add durable workspace-level Superset Task link data under `.trellis/`,
      separate from mutable Trellis task metadata.
- [x] Update hook resolution to prefer `task.json.meta.supersetTaskId` and fall
      back to the workspace-level link file.
- [x] Sync desktop login/session recovery into the CLI-compatible
      `${SUPERSET_HOME_DIR}/config.json` auth source so hooks do not depend on
      users running a separate `superset auth login`.
- [x] Repair matching existing Trellis tasks when `task.json.meta` was
      rewritten, instead of creating duplicate mirror tasks.
- [x] Map Trellis planning/create to Superset status type `unstarted` / Todo.
- [x] Keep `after_start` / `in_progress` mapped to Superset status type
      `started` / In Progress and verify it works in the real desktop path.
- [x] Keep `after_archive` / `completed` mapped to Superset status type
      `completed` / Done.
- [x] Keep `after_finish` as no-op.
- [x] Add focused tests for durable link fallback, missing/rewritten metadata,
      missing CLI/auth behavior, and status type mapping.
- [x] Seed desktop-created Task rows into `collections.tasks` through a sync
      upsert before routing to Task detail, so detail editing is not blocked on
      Electric catch-up.
- [x] Add focused source regressions for Task create local upsert wiring and
      the tasks collection sync helper.
- [ ] Run Desktop Automation acceptance for a real Task-opened guided workspace
      and verify the Superset Task status moves to Todo/In Progress/Done through
      the hook path.

## Candidate Files

- `packages/host-service/src/trpc/router/workspace-creation/trellis.ts`
- `packages/host-service/src/trpc/router/workspaces/workspaces.ts`
- `packages/host-service/src/trpc/router/`
- `packages/host-service/src/providers/auth/JwtAuthProvider/`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/`
- `packages/cli/src/commands/tasks/`
- `.trellis/spec/guides/desktop-conventions.md`

## Validation Commands

- `bun test packages/host-service/src/trpc/router/workspace-creation`
- `bun run --cwd packages/host-service typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint`
- `bun run desktop:automation -- ...` for a real task status smoke

## Validation Results

Initial slice:

- `bun test packages/host-service/src/trpc/router/workspace-creation` — 127
  passing tests.
- `bun run --cwd packages/host-service typecheck` — passed.
- `bun run --cwd apps/desktop typecheck` — passed.
- `bun run lint` — passed.
- `git diff --check` — passed.

Reopened bug:

- `bun test apps/desktop/src/lib/trpc/routers/auth/utils/cli-auth-config.test.ts packages/host-service/src/trpc/router/workspace-creation/trellis.test.ts`
  — 23 passing tests.
- `bun run --cwd packages/host-service typecheck` — passed.
- `bun run --cwd apps/desktop typecheck` — passed.
- `bun run lint` — passed.
- Local dev CLI smoke with
  `SUPERSET_HOME_DIR=/Users/bichengyu/Documents/toolProject/superset/superset-dev-data`
  — `tasks statuses list --json` returned 5 statuses and did not report
  `Not logged in`.
- Repaired the existing real workspace
  `/Users/bichengyu/.superset/worktrees/febd6f82-66f1-4e95-8553-27ef28ea5731/claude-code-switch-ui-shadcn-claude-code-switch-ui-shadcn`
  through `applySupersetTaskTrellisBridge`; verified `task.json.meta`,
  `.trellis/superset/task-link.json`, and `after_create`/`after_start`/
  `after_archive` hooks were present.
- Real hook smoke:
  `superset_task_sync.py after_start` exited 0 and updated Superset Task
  `4687b51a-8e96-41ec-aff2-7bc5c905f8a2` from Backlog status id
  `16bb7b72-815c-43cb-800f-93cbbebb4c84` to In Progress status id
  `66fbd2e3-76dc-4a08-84bc-a790bd7e0c88`.
- Desktop Task create local-sync regression:
  - `bun test apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts`
    — 13 passing tests.
  - `bun run --cwd apps/desktop typecheck` — passed.
  - `bun run lint` — passed.
  - Desktop Automation created Task
    `1d8b36a5-7d70-4ea1-a93b-48f3ffb39086` and reached
    `#/tasks/1d8b36a5-7d70-4ea1-a93b-48f3ffb39086` without
    `Syncing local task data` or
    `Editing unlocks after local sync finishes.` in `document.body.innerText`.
  - Screenshot:
    `.trellis/tasks/06-08-trellis-superset-task-status-sync/artifacts/task-create-local-sync-detail.png`.
  - Renderer console error log was empty.
  - The temporary E2E Task was deleted through the local Superset CLI after the
    smoke.

## Rollback Points

- Keep hook installation behind guided workspace setup.
- Keep hook runtime non-blocking.
- Do not mutate existing `.trellis/tasks` destructively.
- Do not expose desktop auth tokens or host-service secrets to arbitrary Agent
  terminal environment variables.
- If shared CLI auth, API, or CLI availability fails, hook warns and exits 0.
