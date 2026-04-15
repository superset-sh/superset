# Workspace Delete Unification — Design

v2 deletes go through host-service only. v2 is unlaunched, so we cut over directly.

## Principle

**Cloud delete is the commit point.** The saga does everything reversible (preflight checks, teardown) before it touches any authoritative state. Only *after* the cloud row is gone do we touch local disk. If anything up to the cloud delete fails, the workspace is exactly as it was before the user clicked. After the cloud delete, local cleanup is best-effort — orphaned disk artifacts are cheap and recoverable.

This keeps the decision tree linear and stateless: no pending flags, no tombstones, no reconcilers. The procedure runs top to bottom; either it succeeds or it throws at a specific step the caller can understand and act on.

The ordering is designed to be **easy to revisit later**. The three phases (preflight, commit, local cleanup) are cleanly separated in the code so a future change (auto-retry, cross-device reconcile, schema tombstone) can be introduced at a single seam without refactoring the happy path.

## Problem

- **Path A** `electronTrpc.workspaces.delete` — v1 only. Leave alone; dies with v1.
- **Path B** `apiTrpcClient.v2Workspace.delete` — cloud-only, called from renderer. Orphans worktree, PTYs, host row. **Remove.**
- **Path C** `host-service workspace.delete` — partial composition, unreachable from UI. **Rewrite and wire up as `workspaceCleanup.destroy`.**

## Sequence

```
0. Preflight (if !force)
   - git status clean? If dirty → throw CONFLICT.
   - Skipped when we have no local row (nothing to check).

1. Teardown (if !force)
   - Run .superset/teardown.sh inside the workspace.
   - Fail / timeout → throw TEARDOWN_FAILED with output tail.
   - Workspace is fully intact on failure.

2. Cloud delete  ← COMMIT POINT
   - ctx.api.v2Workspace.delete.mutate({ id }).
   - Missing ctx.api, auth failure, network → throw back to the renderer.
   - Workspace is fully intact on failure.

3. Local cleanup (best-effort; every failure is a warning)
   - 3a. Kill PTYs owned by this workspace.
   - 3b. git worktree remove --force (we're past the commit point).
   - 3c. git branch -d / -D if deleteBranch.
   - 3d. Host sqlite delete row.
   - Any failure adds a warning to the response; the saga continues.
   - Orphans from step 3 are cheap: some disk, some sqlite rows, optional
     git branch. User (or a future sweeper) can clean them up later.
```

## Procedure

```ts
workspaceCleanup.destroy: protectedProcedure
  .input(z.object({
    workspaceId: z.string(),
    deleteBranch: z.boolean().default(false),
    force: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const warnings: string[] = [];
    const local = ctx.db.query.workspaces
      .findFirst({ where: eq(workspaces.id, input.workspaceId) }).sync();
    const project = local
      ? ctx.db.query.projects
          .findFirst({ where: eq(projects.id, local.projectId) }).sync()
      : undefined;

    // ─── Preflight ─────────────────────────────────────────────────────
    if (!input.force && local && project) {
      const status = await (await ctx.git(local.worktreePath)).status();
      if (!status.isClean()) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Worktree has uncommitted changes",
        });
      }
    }

    // ─── Teardown ──────────────────────────────────────────────────────
    if (!input.force && local && project) {
      const teardown = await runTeardown({
        db: ctx.db,
        workspaceId: input.workspaceId,
        worktreePath: local.worktreePath,
      });
      if (teardown.status === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Teardown script failed",
          cause: { kind: "TEARDOWN_FAILED", ...teardown },
        });
      }
    }

    // ─── Cloud (commit point) ──────────────────────────────────────────
    if (!ctx.api) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Cloud API not configured",
      });
    }
    await ctx.api.v2Workspace.delete.mutate({ id: input.workspaceId });

    // ─── Local cleanup (best-effort) ───────────────────────────────────
    const killed = disposeSessionsByWorkspaceId(input.workspaceId, ctx.db);
    if (killed.failed > 0) {
      warnings.push(`${killed.failed} terminal(s) may still be running`);
    }

    let worktreeRemoved = false;
    if (local && project) {
      const git = await ctx.git(project.repoPath);
      try {
        await git.raw(["worktree", "remove", "--force", local.worktreePath]);
        worktreeRemoved = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/is not a working tree|No such file or directory|ENOENT/.test(msg)) {
          worktreeRemoved = true;
        } else {
          warnings.push(
            `Failed to remove worktree at ${local.worktreePath}: ${msg}`,
          );
        }
      }

      if (input.deleteBranch && local.branch) {
        try {
          await git.raw(["branch", input.force ? "-D" : "-d", local.branch]);
        } catch (err) {
          warnings.push(
            `Failed to delete branch ${local.branch}: ${(err as Error).message}`,
          );
        }
      }
    }

    if (local) {
      ctx.db.delete(workspaces)
        .where(eq(workspaces.id, input.workspaceId)).run();
    }

    return {
      success: true,
      cloudDeleted: true,
      worktreeRemoved,
      branchDeleted: Boolean(input.deleteBranch && worktreeRemoved && local),
      warnings,
    };
  });
```

No preflight `canDelete` endpoint, no `deletingAt` tombstone, no reconciliation loop. The renderer reads git's own errors (via typed TRPC) for the "dirty" decision; cloud failure propagates as a real error and is the user's cue to retry.

## Failure matrix

| Step fails | Workspace state | Thrown | Renderer UX |
|---|---|---|---|
| 0 (dirty worktree) | Fully intact | `CONFLICT` | Reopen in ConflictPane → "Delete anyway" → `force: true` |
| 1 (teardown script) | Fully intact | `INTERNAL_SERVER_ERROR` + `cause.kind === "TEARDOWN_FAILED"` + output tail | Reopen in TeardownFailedPane → "Delete anyway" → `force: true` (skips 0+1) |
| 1 (teardown 60s timeout) | Fully intact | Same as above with `timedOut: true` | Same |
| 2 (cloud auth) | Fully intact | `UNAUTHORIZED` | toast "Please sign in again" |
| 2 (cloud network / 5xx) | Fully intact | Passed-through error | toast with message; user retries when reachable |
| 2 (ctx.api missing) | Fully intact | `PRECONDITION_FAILED` | toast with message |
| 3a (PTY kill) | Cloud gone; zombie process | warning | User kills stray process |
| 3b (worktree removal) | Cloud gone; worktree on disk | warning w/ path | `rm -rf <path>` manually |
| 3c (branch delete) | Cloud gone; branch lingers | warning | `git branch -D` manually |
| 3d (sqlite) | Cloud gone; host row lingers (practically never) | warning | Next launch sweep or manual |

Everything up to step 2 leaves the workspace untouched — the user can fix the underlying issue and retry. Everything in step 3 is a cheap orphan with a clear warning the user can read in the toast.

## Renderer flow

```ts
const destroy = useDestroyWorkspace();

async function run(force: boolean, deleteBranch: boolean) {
  try {
    const result = await destroy({ workspaceId, deleteBranch, force });
    for (const w of result.warnings) toast.warning(w);
    toast.success(`Deleted ${name}`);
  } catch (err) {
    switch (err.kind) {
      case "conflict":        reopenInConflictPane();       break;
      case "teardown-failed": reopenInTeardownPane(err.cause); break;
      default:                toast.error(err.message);
    }
  }
}
```

Fast path: one click for a clean worktree, no branch delete. Confirm dialog only reappears when the user has a decision to make.

## UX decisions

- **Delete branch by default?** No. Checkbox off by default; opt-in per delete, no persisted preference.
- **Always confirm?** Only on CONFLICT or TEARDOWN_FAILED.
- **Split `force` into worktree-force and branch-force?** No. One "I acknowledge this might destroy work" signal.

## Force semantics

`force: true` is the single "skip safety gates" flag:

- Skips step 0 (preflight dirty check).
- Skips step 1 (teardown — don't re-run a known-broken script).
- Upgrades `git branch -d` to `-D` in step 3c.
- Step 3b always uses `--force` (we're past the commit point regardless).

## UI

**Delivered in this PR:**
- v2 sidebar context menu uses the shared `DashboardSidebarDeleteDialog` backed by `useDestroyWorkspace` → `workspaceCleanup.destroy`.
- Direct `apiTrpcClient.v2Workspace.delete.mutate` call at `useDashboardSidebarWorkspaceItemActions.ts` removed.
- v1 `DeleteWorkspaceDialog` + `useDeleteWorkspace` left unchanged.

**Follow-up (out of this PR):**
- Wire the `DELETE_WORKSPACE` hotkey (currently `CLOSE_WORKSPACE`) to the same flow.
- Wire `EmptyTabView` to the same flow.
- Add a delete affordance on `V2WorkspaceRow.tsx`.

## Host ownership

`v2Workspaces.hostId` ties each workspace to exactly one host. `workspaceCleanup.destroy` is only callable from the host that owns the workspace (via `useWorkspaceHostUrl` routing on the renderer). Cross-device delete is not a supported operation.

## Teardown contract (step 1 detail)

Reuses `createTerminalSessionInternal` — the same PTY primitive v2 setup uses — so the teardown script inherits the user's login shell env (rcfiles, PATH, nvm/rbenv) without duplicating the shell-launch plumbing.

```ts
runTeardown({ db, workspaceId, worktreePath })
  → { status: "ok"; output?: string }
  | { status: "skipped" }   // .superset/teardown.sh missing
  | { status: "failed"; exitCode: number | null;
      signal: number | null; timedOut: boolean; outputTail: string }
```

- **Script location**: `<worktreePath>/.superset/teardown.sh` (mirrors v2 setup's `.superset/setup.sh`).
- **Execution**: PTY session via `createTerminalSessionInternal` with `initialCommand: "bash '<path>' ; exit $?"`. Session is transient, not surfaced as a visible pane; captured via `pty.onData` and torn down via `disposeSession` when the script settles.
- **Capture**: raw PTY bytes into a 4KB ring buffer; the renderer runs `stripAnsi` for display.
- **Exit handling**: `pty.onExit` → exit code / signal.
- **Timeout**: 60s → `pty.kill()` → `status: "failed"` with `timedOut: true` (cross-platform; no process-group SIGKILL).
- **Missing script**: fast-return `{ status: "skipped" }`.
- **`force` in destroy**: skips this step entirely.
- **`TEARDOWN_TIMEOUT_MS` lives in `@superset/shared/constants`** so the renderer can format the timeout reason without value-importing host-service (which would drag node-pty into the renderer bundle).

## Why no tombstone / reconciler?

Rejected in favor of linearity. The tombstone alternative would add:
- A `cloudDeletePending` column on host-sqlite `workspaces`.
- A boot-time + periodic sweeper that retries pending cloud deletes.
- A renderer "pending" warning state the user might not understand.

It was rejected because:
- Cloud failure in the new design is **before** any local state changes, so there is no orphan to clean up — the user just retries.
- Local orphans (post-commit) are cheap and plainly surfaced as warnings.
- Adding persistent state makes future changes (cross-device reconcile, auto-retry) harder, not easier — the plumbing has to either interact with the flag or ignore it.

If we later want transient-error auto-retry, the seam is clean: step 2's `catch` is the only place that needs to grow.

## Out of scope

- **Abandoned-host cleanup**: retired machines leave zombie hosts + workspaces. Separate "Remove this device" settings flow.
- **Visible-pane teardown**: rejected. v2 setup is visible because users need to see it succeed; teardown has nothing actionable once it starts and the pane evaporates with the workspace.
- **Bulk delete / trash bin**: future flow composing `destroy` calls.

## Work order

1. Host-service: new `workspaceCleanup` router with `destroy` (linear sequence above). ✅
2. Renderer: `useDestroyWorkspace` hook + confirm dialog (dirty + branch opt-in). ✅
3. Switch `v2Workspace.delete` cloud procedure to `jwtProcedure` so host-service can call it. ✅
4. Reorder the destroy saga to the linear preflight → teardown → cloud → local-cleanup shape. ✅
5. Swap v2 delete call sites:
   - Sidebar context menu. ✅
   - EmptyTabView, `CLOSE_WORKSPACE` hotkey, `V2WorkspaceRow` list affordance — **follow-up**.
6. Delete Path B call path. ✅

## Acceptance

- v2 renderer has one delete target: `hostServiceClient.workspaceCleanup.destroy`.
- `v2Workspace.delete` is only reachable via host-service's JWT auth.
- Clean worktree + no branch delete = one click.
- CONFLICT and TEARDOWN_FAILED offer force-retry with full context.
- Any failure before the cloud step leaves the workspace untouched.
- Any failure after the cloud step surfaces as a warning — never as a phantom workspace row.
