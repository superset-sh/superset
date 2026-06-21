# Stop project clone

## Goal

Let users stop an in-progress repository clone from the desktop `Add repository -> Clone a repository` flow.

The feature should complement the existing clone progress/background behavior: hiding the modal keeps work running, while Stop explicitly cancels the clone, cleans the partial directory, and leaves the form ready to retry.

## Requirements

- Add an explicit Stop action for a clone started from `NewProjectModal`.
- Stop must cancel the actual host-service `git clone` process, not only dismiss the renderer UI.
- Stop must clean the partially cloned target directory that this clone operation created.
- Stop must be safe to call from either the open modal or the background toast after the modal is hidden.
- After Stop completes, the user should be able to retry from the same modal values when the modal is still open.
- Stop should surface a non-error user message such as "Clone stopped"; it should not route through the generic create-failed parent error toast.
- If Stop is clicked after the clone has already finished or after project registration begins, the app should handle it gracefully and avoid deleting an already registered project/repository.
- Pause/resume is out of scope.

## Acceptance Criteria

- [x] While `Clone a repository` is cloning, the modal shows both `Hide` and `Stop` actions.
- [x] The background progress toast includes a Stop action while the clone is still cancelable.
- [x] Clicking Stop terminates the host-service `git clone` process and removes the partial target directory.
- [x] Stopping a clone emits project create progress ending in a `canceled` state, and the toast updates to "Clone stopped" instead of "Create failed".
- [x] After Stop from the open modal, the URL, project name, and location fields remain populated and the Clone button becomes available again.
- [x] Stop from a hidden/background toast works without reopening the modal.
- [x] A late Stop request after the clone is no longer cancelable returns a graceful no-op result and does not delete a completed project/repository.
- [x] Regression tests cover the host-service cancel path, event bus `canceled` progress, workspace-client dispatch, and `NewProjectModal` Stop wiring.

## Validation Notes

- Focused regression tests: `bun test packages/host-service/src/trpc/router/project/utils/resolve-repo.test.ts packages/host-service/src/trpc/router/project/project.test.ts packages/host-service/src/events/event-bus.test.ts packages/workspace-client/src/lib/eventBus.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/components/NewProjectModal/NewProjectModal.test.ts` -> 44 pass.
- Desktop acceptance: `bun run dev:worktree:status` green on worktree `superset-83d4292cd8`, then Desktop Automation CLI on port `3198` cloned `https://github.com/getpaseo/paseo.git` into `.tmp/project-clone-stop-e2e`, stopped once from the open modal and once from the hidden/background toast.
- Desktop artifacts: `artifacts/01-stop-visible.png`, `artifacts/02-clone-stopped.png`, `artifacts/03-toast-stop-visible.png`, `artifacts/04-toast-stop-after-cancel.png`.
- Cleanup proof after both E2E runs: no matching `git clone` process, no `*paseo*` clone directories under `.tmp/project-clone-stop-e2e`, `/Users/bichengyu/.superset/projects`, or worktree `superset-dev-data`; local DB queries for `projects` and `v2_projects` returned `0`.
- Quality gates: `bun run lint:fix`, `bun run lint`, `bun run typecheck`, `git diff --check`, and `bun run dev:worktree:status` passed.
- Full root `bun test` was also attempted and failed with existing broad-suite/mock-environment failures unrelated to this change: 3827 pass, 8 todo, 164 fail. Representative failures were `simple-git` / `child_process` mock contamination errors such as `spawned.stdout.on` and `child.on is not a function`, plus existing workspaces/git/font/router suites. The focused clone cancellation tests still pass in isolation after that run.

## Notes

- Current confirmed implementation facts:
  - `NewProjectModal` calls `client.project.create.mutate(...)` with `mode.kind === "clone"` and a `progressRequestId`.
  - `packages/host-service/src/trpc/router/project/handlers.ts` handles `createFromClone` and emits `project:create-progress`.
  - `packages/host-service/src/trpc/router/project/utils/resolve-repo.ts` performs clone via `spawn("git", ["clone", "--progress", ...])`.
  - `cloneRepoInto` already owns the target directory and removes it on clone failure, so cancellation should reuse that cleanup boundary.
  - `packages/host-service/src/ports/tree-kill.ts` already provides process-tree kill with escalation.
