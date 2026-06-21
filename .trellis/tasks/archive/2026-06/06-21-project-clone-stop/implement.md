# Implementation Plan: Stop project clone

## Before Editing

- Load Trellis package specs with `trellis-before-dev` for:
  - `apps/desktop` frontend
  - `packages/host-service` backend
  - `packages/workspace-client` frontend/backend
- Review current files:
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/components/NewProjectModal/NewProjectModal.tsx`
  - `packages/host-service/src/trpc/router/project/handlers.ts`
  - `packages/host-service/src/trpc/router/project/project.ts`
  - `packages/host-service/src/trpc/router/project/utils/resolve-repo.ts`
  - `packages/host-service/src/events/types.ts`
  - `packages/workspace-client/src/lib/eventBus.ts`

## Implementation Checklist

1. Extend event types
   - Add `canceling` and `canceled` to `ProjectCreateProgressStage`.
   - Ensure host-service event bus and workspace-client payload dispatch still type-check.

2. Add clone cancellation primitives in host-service
   - Add a cancellation-specific error class or marker for user-requested clone stop.
   - Extend `CloneRepoOptions` with `signal?: AbortSignal`.
   - In `cloneWithProgress`, listen for abort and use `treeKillWithEscalation` to terminate the git process tree.
   - Ensure abort removes listeners and rejects exactly once with the cancellation marker.
   - Ensure `cloneRepoInto` cleans the target directory and preserves cancellation identity instead of wrapping it as a generic clone failure.

3. Add in-flight project create registry
   - Key entries by `progressRequestId`.
   - Register only during clone phase.
   - Unregister in `finally` around `cloneRepoInto`.
   - Add helper to cancel by request id and return `canceling` / `not_found`.

4. Add tRPC cancel mutation
   - Add `project.cancelCreate({ progressRequestId })`.
   - Emit `canceling` when cancellation is accepted.
   - Return graceful no-op when the request id is not active.

5. Update `createFromClone`
   - Pass the registered `AbortSignal` into `cloneRepoInto`.
   - On cancellation, emit `canceled` and throw a user-readable `Clone stopped` tRPC error.
   - Keep real failures as `failed`.
   - Do not register or delete cloud/local project rows for canceled clones.

6. Update `NewProjectModal`
   - Track `progressRequestId`, `stopping`, and cancellation state.
   - Add a Stop button while the clone is cancelable.
   - Add Stop action to the clone progress toast.
   - On Stop, call `client.project.cancelCreate.mutate({ progressRequestId })`.
   - On `canceled`, show "Clone stopped", clear working/stopping, keep form values, and skip parent `onError`.
   - Keep `Hide` behavior unchanged.

7. Update tests
   - Host-service event bus test includes `canceled` progress.
   - Workspace-client event bus test dispatches `canceled`.
   - `resolve-repo.test.ts` or a focused host-service test proves cancel kills clone and removes the target directory.
   - `project` router/handler test or source-level test proves `cancelCreate` wiring and no-op result.
   - `NewProjectModal.test.ts` asserts Stop button/toast action/cancel mutation/canceled handling are wired.

8. Update spec if implementation reveals a new durable contract beyond the current PRD/design.

## Validation Commands

Run from repo root:

```bash
bun test packages/host-service/src/trpc/router/project/utils/resolve-repo.test.ts packages/host-service/src/events/event-bus.test.ts packages/workspace-client/src/lib/eventBus.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/components/NewProjectModal/NewProjectModal.test.ts
bun run lint
bun run typecheck
git diff --check
```

Desktop acceptance after implementation:

```bash
bun run dev:worktree:status
```

Then in the running worktree app:

1. Open `Add repository -> Clone from URL`.
2. Start cloning `https://github.com/getpaseo/paseo.git` into a disposable `.tmp/project-clone-stop-e2e` parent.
3. Verify progress appears.
4. Click `Stop` while clone is running.
5. Verify the toast says `Clone stopped`, the modal can retry, no project row exists, and the partial clone directory is removed.
6. Repeat once with `Hide`, then Stop from the toast.

Cleanup checks:

```bash
find .tmp/project-clone-stop-e2e /Users/bichengyu/.superset/projects -maxdepth 2 -name '*paseo*' -print 2>/dev/null || true
docker exec "$LOCAL_DB_PROJECT-postgres-1" psql -U postgres -d main -tAc "select count(*) from projects where name ilike '%paseo%' or slug ilike '%paseo%' or repo_url ilike '%getpaseo%'; select count(*) from v2_projects where name ilike '%paseo%' or slug ilike '%paseo%' or repo_clone_url ilike '%getpaseo%';"
```

## Rollback Points

- If process-tree cancellation is flaky, isolate it behind a small helper and keep progress-only behavior intact.
- If toast Stop action is awkward, keep modal Stop as required and add toast Stop once core cancellation is stable.
- If late cancellation races with project registration, prefer returning `not_found` after clone phase over attempting to undo a partially registered project.
