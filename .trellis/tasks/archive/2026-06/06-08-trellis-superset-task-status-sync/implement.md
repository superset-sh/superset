# Implementation Plan

## Checklist

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
- [ ] Run Desktop Automation acceptance for a Task-opened guided workspace if
      the app is already running cleanly. Not run in this pass because no
      renderer UX changed; the risky behavior is covered by host-service tests
      that execute the injected Python hook against a fake Superset CLI.

## Candidate Files

- `packages/host-service/src/trpc/router/workspace-creation/trellis.ts`
- `packages/host-service/src/trpc/router/workspaces/workspaces.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/`
- `packages/cli/src/commands/tasks/`
- `.trellis/spec/guides/desktop-conventions.md`

## Validation Commands

- `bun test packages/host-service/src/trpc/router/workspace-creation`
- `bun run --cwd packages/host-service typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint`

## Validation Results

- `bun test packages/host-service/src/trpc/router/workspace-creation` — 127
  passing tests.
- `bun run --cwd packages/host-service typecheck` — passed.
- `bun run --cwd apps/desktop typecheck` — passed.
- `bun run lint` — passed.
- `git diff --check` — passed.

## Rollback Points

- Keep hook installation behind guided workspace setup.
- Keep hook runtime non-blocking.
- Do not mutate existing `.trellis/tasks` without a linked Superset Task id.
