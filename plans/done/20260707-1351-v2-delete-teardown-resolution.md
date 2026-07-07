# Run project teardown scripts on the v2 workspace delete path

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template in `.agents/skills/create-plan/`.

## Purpose / Big Picture

When a user deletes ("closes") a workspace in the Superset desktop app, the project's teardown script is supposed to run first — stopping dev servers, removing docker containers, freeing ports, deleting scratch state. Today, on the current (v2, host-service-backed) delete path, teardown is silently skipped in the two most common configurations:

1. Projects that declare teardown as a **command array in `.superset/config.json`** (which is exactly what the project-settings "Scripts" editor writes) never have it run, because the v2 destroy path only looks for a literal file at `<worktree>/.superset/teardown.sh` and never reads config.json.
2. Any delete that ends up with `force: true` — which includes every "Delete anyway" confirmation on a workspace with uncommitted changes or unpushed commits, and **every delete issued through the legacy external surface (CLI/SDK/MCP)** — skips teardown entirely, because `force` currently conflates "delete despite dirty files" with "skip the teardown script".

After this change, deleting a workspace runs the project's configured teardown (config.json commands first, `teardown.sh` file as fallback) in both the clean and the dirty-worktree ("Delete anyway") flows, and only the explicit retry-after-teardown-failure path skips it. A user can verify this by giving their project a teardown command that writes a marker file, deleting a workspace, and seeing the marker appear.

Real-world reproduction that motivated this plan: the project at `~/Developer/K3` has `.superset/config.json` containing `"teardown": ["./scripts/worktree/teardown.sh"]`. The script exists and works when run by hand inside the worktree. Deleting a freshly created, completely clean workspace (e.g. the worktree at `~/.superset/worktrees/<project-uuid>/polite-wildcat`) via the desktop app never executes it, with no log output anywhere.

## Assumptions

- The fix targets only the v2 delete path (host-service `workspaceCleanup.destroy`). The legacy v1 electron-main delete (`apps/desktop/src/lib/trpc/routers/workspaces/procedures/delete.ts`) already resolves teardown from config.json via its own `runTeardown` in `apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.ts` and is not modified.
- Teardown commands run with the worktree as the working directory (matching v1 behavior and the K3 config, which uses worktree-relative paths like `./scripts/worktree/teardown.sh`).
- The 60-second teardown timeout (`TEARDOWN_TIMEOUT_MS` in `packages/shared/src/constants.ts:57`) stays as-is.
- Backwards compatibility of the `destroy` input is required: existing callers pass only `{ workspaceId, deleteBranch, force }`, so the new `skipTeardown` field must default to `false`.

## Open Questions

- Should the legacy external `workspace.delete` procedure (CLI/SDK/MCP surface, `packages/host-service/src/trpc/router/workspace/workspace.ts:71-81`, which hard-codes `force: true`) now run teardown best-effort? This plan says yes (see Decision Log D3) — it makes SDK deletes take up to 60s longer if a teardown hangs, but skipping lifecycle scripts silently is the exact bug being fixed. If the product decision is "no", pass `skipTeardown: true` there instead and note it in the Decision Log. Impacts: Plan of Work step 4, Validation.
- Should a teardown *failure* during a forced delete surface as a toast warning only (this plan's choice, D4), or block? Impacts: Plan of Work step 3.

## Progress

- [x] (2026-07-07 05:00Z) Milestone 1: config-aware teardown resolution in host-service (`resolveTeardownCommand` + `runTeardown` changes + unit tests).
- [x] (2026-07-07 05:10Z) Milestone 2: decouple `force` from teardown skipping in the destroy saga (`skipTeardown` input, best-effort semantics under force, `teardownStatus` result field, skip logging).
- [x] (2026-07-07 05:15Z) Milestone 3: renderer wiring (`useDestroyWorkspace`, `useDestroyDialogState`, `DashboardSidebarDeleteDialog`) so only the retry-after-teardown-failure path skips teardown.
- [x] (2026-07-07 05:30Z) Validation: `bun run typecheck` (28/28), `bun run lint` (clean), host-service unit + integration suites (teardown, workspace-cleanup, workspace-create-delete) all pass.
- [ ] Manual marker-file scenario (requires the running desktop app; see Validation and Acceptance) — not yet run.

## Surprises & Discoveries

(From the investigation that produced this plan; add more as implementation proceeds.)

- Observation: setup and teardown resolve their scripts completely differently on the v2 path.
  Evidence: setup (`packages/host-service/src/trpc/router/workspace-creation/shared/setup-terminal.ts:89-107`) reads config.json commands first, then falls back to `<mainRepoPath>/.superset/setup.sh` — deliberately the main repo, "NOT the worktree — worktrees skip gitignored files". Teardown (`packages/host-service/src/runtime/teardown/teardown.ts:52-53`) checks only `existsSync(join(worktreePath, ".superset/teardown.sh"))` and never opens config.json.
- Observation: every delete with warnings sends `force: true`, and `force` skips teardown.
  Evidence: `DashboardSidebarDeleteDialog.tsx:70` does `onConfirm={() => run(hasWarnings)}`; `workspace-cleanup.ts:242` guards teardown with `if (!input.force && local && project)`.
- Observation: the legacy external delete surface always forces, so CLI/SDK/MCP deletes never run teardown either.
  Evidence: `packages/host-service/src/trpc/router/workspace/workspace.ts:74-80` calls `destroyWorkspace(ctx, { workspaceId, deleteBranch: false, force: true })`.
- Observation: all skip paths are silent — `runTeardown` returns `{ status: "skipped" }` with no logging, and the saga logs nothing when the force guard bypasses step 1. This is why the bug was hard for users to diagnose.
- Observation: the superset repo itself masks the config.json gap in dogfooding, because its `.superset/teardown.sh` is a git-tracked file that exists in every worktree; K3-style projects (config commands only, or gitignored `.superset/`) are the ones that break.
- Observation: the config.json `teardown` array is a documented regression, not a missing feature. PR #178 (2025-11-28) added exactly this to the original delete path (`apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.ts`, still present); PR #3443 (2026-04-14) moved deletes to the v2 host-service saga whose rewritten `runTeardown` dropped config support. The public docs (`apps/docs/content/docs/setup-teardown-scripts.mdx`, linked from the app's settings UI) still promise "Delete workspace → teardown commands run" with `"teardown": ["docker-compose down"]`-style examples — treat that page as the behavioral spec this plan restores.

## Decision Log

- Decision (D1): Teardown resolution order is (1) `teardown` command array from `loadSetupConfig` (config.json + `~/.superset/projects/<projectId>/config.json` override + `config.local.json` overlay), joined with `&&`; (2) `<worktreePath>/.superset/teardown.sh`; (3) `<repoPath>/.superset/teardown.sh`.
  Rationale: exact parity with how setup resolves (`resolveInitialCommand` in setup-terminal.ts), plus keeping the worktree-file check first among the file fallbacks to preserve current behavior for repos that commit a worktree-local script. The main-repo fallback covers gitignored `.superset/` directories, the case setup already handles.
  Date/Author: 2026-07-07 / investigation session (ivan.van + Claude).
- Decision (D2): Introduce a separate `skipTeardown: boolean` (default `false`) on the destroy input instead of overloading `force`.
  Rationale: `force` legitimately means "ignore dirty preflight"; only the retry after a *teardown failure* should mean "don't run teardown again" (re-running a script that just timed out would add another 60s wait to the user's "Delete anyway" click).
  Date/Author: 2026-07-07.
- Decision (D3): The legacy `workspace.delete` procedure keeps `force: true` but does not set `skipTeardown`, so external deletes now run teardown best-effort.
  Rationale: the silent skip is the bug; external deletes deleting live dev servers without teardown is worse than a bounded 60s delay. Revisit if SDK latency becomes a complaint (see Open Questions).
  Date/Author: 2026-07-07.
- Decision (D4): Under `force: true`, a teardown failure is downgraded to a warning in the result's `warnings` array and the delete proceeds; under `force: false`, the existing typed `TEARDOWN_FAILED` error (which drives the TeardownFailedPane retry UI) is preserved unchanged.
  Rationale: force means "proceed regardless"; throwing would strand the user in a loop. The non-force contract must not change because `useDestroyDialogState` and `TeardownFailedPane` depend on it.
  Date/Author: 2026-07-07.
- Decision (D5): Command-array teardown runs as `exec bash -c '<cmd1 && cmd2>'` inside the PTY, reusing the existing single-quote escaping.
  Rationale: the existing `exec bash <script>` pattern exists to avoid shell-specific exit-status syntax (`$?` breaks under fish — see the fish test in `teardown.test.ts`); `exec bash -c` extends the same trick to arbitrary command strings.
  Date/Author: 2026-07-07.

## Outcomes & Retrospective

Implemented as planned across all three milestones, on branch `fix/v2-delete-teardown-resolution` (fork flow: `ivanvan93/superset` → `superset-sh/superset`). Deviations from the plan: none of substance. Notes:

- The existing `teardown.integration.test.ts` needed the new `repoPath`/`projectId`/`homeDir` args; `BasicScenario` already exposed `projectId`, so no helper changes were required.
- The integration run visibly exercised the new semantics: `[workspaceCleanup.destroy] teardown skipped for <id> (force=true, skipTeardown=false)` — force deletes now go through teardown resolution instead of bypassing it.
- The manual desktop-app marker-file scenario remains outstanding (needs a signed-in dev session); automated coverage exercises the same saga end-to-end with real git worktrees and a fake PTY.

## Context and Orientation

Superset is a Bun + Turborepo monorepo. The desktop app (`apps/desktop`, Electron) talks to a per-organization background process called the **host service** (`packages/host-service`) over tRPC (a typed RPC framework; procedures live under `packages/host-service/src/trpc/router/`). A **workspace** is an isolated git worktree of a project's repository, created under `~/.superset/worktrees/<project-uuid>/<workspace-name>`; the project's canonical clone (the "main repo") lives wherever the user keeps it, e.g. `~/Developer/K3`.

Projects configure lifecycle scripts in `.superset/config.json` at the main repo root, with the shape `{ "setup": string[], "teardown": string[], "run": string[] }`. Two overlay files can modify it: a per-machine override at `~/.superset/projects/<projectId>/config.json` and a repo-local overlay at `.superset/config.local.json`. All of that resolution is already implemented in `loadSetupConfig` in `packages/host-service/src/runtime/setup/config.ts` — read that file first; this plan extends it minimally.

The delete flow, end to end:

- UI: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog/DashboardSidebarDeleteDialog.tsx` renders the confirm dialog. Its state hook `hooks/useDestroyDialogState/useDestroyDialogState.ts` calls `destroy({ deleteBranch, force })` from `apps/desktop/src/renderer/hooks/host-service/useDestroyWorkspace/useDestroyWorkspace.ts`, which invokes the host-service procedure `workspaceCleanup.destroy`.
- Saga: `packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts`, function `runDestroy`, runs five phases: (0) dirty-worktree preflight, (1) teardown, (2) PTY + worktree cleanup, (3) cloud delete, (4) optional local branch delete, (5) local sqlite cleanup. Phase 1 currently calls `runTeardown` from `packages/host-service/src/runtime/teardown/teardown.ts`, guarded by `if (!input.force && local && project)`.
- `runTeardown` spawns a hidden PTY session (via `createTerminalSessionInternal` in `packages/host-service/src/terminal/terminal.ts`, with `listed: false`) whose working directory defaults to the worktree path, types an initial command into the user's login shell, captures the last 4KB of output, and reports `ok` / `skipped` / `failed`. Today its initial command is always `exec bash '<worktree>/.superset/teardown.sh'` and it returns `skipped` when that file does not exist.
- Failure UX: a `failed` result makes the saga throw `INTERNAL_SERVER_ERROR` with a `TEARDOWN_FAILED` cause; the renderer shows `TeardownFailedPane` (same dialog) with the output tail, and its "Delete anyway" button calls `run(true)` (`DashboardSidebarDeleteDialog.tsx:51`).
- Legacy external surface: `packages/host-service/src/trpc/router/workspace/workspace.ts` `delete` procedure (used by CLI/SDK/MCP) calls `destroyWorkspace(ctx, { workspaceId, deleteBranch: false, force: true })`.

Affected areas: `packages/host-service` (runtime/teardown, runtime/setup, trpc/router/workspace-cleanup, trpc/router/workspace) and `apps/desktop` renderer (the destroy hook and delete dialog). No database schema changes. No electron main-process changes.

## Plan of Work

### Milestone 1: config-aware teardown resolution in host-service

First, in `packages/host-service/src/runtime/setup/config.ts`, add a sibling of `getResolvedSetupCommands`:

    export function getResolvedTeardownCommands(
    	config: SetupConfig | null,
    ): string[] {
    	return nonEmptyStrings(config?.teardown);
    }

Next, rework `packages/host-service/src/runtime/teardown/teardown.ts`. Extend `RunTeardownOptions` with the fields needed for config resolution: `repoPath: string` and `projectId: string` (plus an optional `homeDir?: string` passthrough for tests, forwarded to `loadSetupConfig`). Add an exported pure resolver so the decision logic is unit-testable without a PTY:

    export function resolveTeardownCommand(args: {
    	repoPath: string;
    	worktreePath: string;
    	projectId: string;
    	homeDir?: string;
    }): string | null

Implement it per Decision D1: call `loadSetupConfig({ repoPath, projectId, homeDir })` and `getResolvedTeardownCommands`; if non-empty, return `buildTeardownCommandString(commands.join(" && "))`; else if `<worktreePath>/.superset/teardown.sh` exists, return the existing `buildTeardownInitialCommand(scriptPath)`; else if `<repoPath>/.superset/teardown.sh` exists, return `buildTeardownInitialCommand` of that path; else return `null`. Add the new command builder next to the existing one, reusing the `singleQuote` helper (Decision D5):

    export function buildTeardownCommandString(command: string): string {
    	return `exec bash -c ${singleQuote(command)}`;
    }

Then change `runTeardown` to call `resolveTeardownCommand` at the top; on `null`, `console.log` a skip line naming the workspace id and the three locations it checked (this addresses the "no logs anywhere" complaint) and return `{ status: "skipped" }`. The rest of the function (PTY session, output tail, timeout, kill-grace) is unchanged except that `initialCommand` is now the resolved command. Note the PTY already runs with the worktree as cwd and the terminal env builder injects `SUPERSET_ROOT_PATH` (`packages/host-service/src/terminal/env.ts:193`), so config commands that need the main repo can use that variable — same contract as setup.

Update the caller in `workspace-cleanup.ts` (phase 1) to pass `repoPath: project.repoPath` and `projectId: project.id` (both already available from `isMainWorkspace`'s returned `project` row — confirm the row's field names by reading `is-main-workspace.ts` before wiring).

Extend `packages/host-service/src/runtime/teardown/teardown.test.ts` (bun:test, uses `mkdtempSync` temp dirs — follow the existing style) with resolver cases: config commands win over an existing worktree `teardown.sh`; worktree `teardown.sh` used when config has no teardown; main-repo `teardown.sh` used when the worktree copy is absent; `null` when nothing is configured; command strings with single quotes escape correctly; empty/whitespace command arrays are treated as unconfigured. Use the `homeDir` override pointed at an empty temp dir so real user overrides in `~/.superset` can't leak into tests.

At the end of this milestone, deleting a clean K3-style workspace runs the config-declared teardown. Verify with the unit tests before proceeding.

### Milestone 2: decouple force from teardown in the destroy saga

In `packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts`:

- Add `skipTeardown: z.boolean().default(false)` to the `destroy` input schema and `skipTeardown: boolean` to `DestroyWorkspaceInput`.
- Change the phase-1 guard from `if (!input.force && local && project)` to `if (!input.skipTeardown && local && project)`.
- Inside phase 1, when the result is `failed`: if `input.force` is false, throw the existing `TEARDOWN_FAILED` error exactly as today (do not touch the error shape — `TeardownFailedPane` and `useDestroyWorkspace` parse it); if `input.force` is true, push a warning such as `` `Teardown script failed (exit ${exitCode ?? "?"}); continued because force was set` `` onto `warnings` and continue (Decision D4).
- Add a `teardownStatus: "ok" | "skipped" | "failed" | "not-run"` field to the returned object (`not-run` when the guard didn't fire — skipTeardown set, or missing local/project rows) so callers and future UI can observe what happened, and `console.log` one line per outcome.
- Update the doc comment block above `destroy` (the "Force semantics" list currently documents "skips teardown (step 1)") to describe the new semantics.

Leave `packages/host-service/src/trpc/router/workspace/workspace.ts` `delete` as `{ deleteBranch: false, force: true }` — with the new guard it now runs teardown best-effort (Decision D3). Check other `destroyWorkspace`/`workspaceCleanup.destroy` callers compile unchanged (the added input field is optional-with-default): grep for `destroyWorkspace(` and `workspaceCleanup.destroy` across `packages/` and `apps/`; known ones are the workspace router above and `packages/mcp-v2/src/tools/workspaces/delete.ts` (which goes through the workspace router).

### Milestone 3: renderer wiring

In `apps/desktop/src/renderer/hooks/host-service/useDestroyWorkspace/useDestroyWorkspace.ts`, extend the `destroy` call's input type with `skipTeardown?: boolean` and pass it through to the tRPC mutation.

In `useDestroyDialogState.ts`, change `run(force: boolean)` to `run(opts: { force: boolean; skipTeardown?: boolean })` (or two parameters — match local style) and forward both to `destroy`. The silent conflict retry inside `run` (currently `destroy({ deleteBranch, force: true })` after a `conflict` error) must pass `skipTeardown: false` semantics, i.e. just `force: true` — teardown has not run yet at that point because the dirty-worktree conflict is thrown in phase 0, before phase 1.

In `DashboardSidebarDeleteDialog.tsx`: the main confirm (`onConfirm={() => run(hasWarnings)}`) becomes `run({ force: hasWarnings })` — dirty workspaces still run teardown now; and the `TeardownFailedPane` retry (`onForceDelete={() => run(true)}`) becomes `run({ force: true, skipTeardown: true })` — the one place where skipping is the point, because the script just failed and the user chose to proceed anyway.

Search for any other `useDestroyWorkspace`/`useDestroyDialogState` consumers (e.g. other delete dialogs under `apps/desktop/src/renderer`) and apply the same mapping. The v1 delete surfaces (`useDeleteWorkspace`, `deleteWithToast` in `TeardownLogsDialog`) are out of scope.

## Concrete Steps

All commands run from the repo root unless noted.

    # after Milestone 1
    cd packages/host-service && bun test src/runtime/teardown
    # Expected: all tests pass, including the new resolver cases

    # after Milestones 2-3, from repo root
    bun run typecheck        # Expected: exits 0, no errors
    bun run lint             # Expected: exits 0 — CI fails on warnings too (AGENTS.md rule 7)
    bun test                 # Expected: all suites pass

Note: `bun run lint:fix` after edits, then confirm `bun run lint` is clean before pushing (repo rule — warnings are treated as errors).

## Validation and Acceptance

Manual end-to-end check, using any project whose teardown is declared in config.json (K3 is ideal). Make the teardown observable, e.g. append to the project's teardown script (or temporarily set in the main repo's `.superset/config.local.json`):

    { "teardown": { "after": ["date >> /tmp/superset-teardown-ran.log"] } }

Then with the desktop app running against the modified host-service (`bun dev`):

1. Clean delete: create a workspace, make no changes, delete it via the sidebar delete dialog. Expect `/tmp/superset-teardown-ran.log` to gain a line, and the host-service log (the `bun dev` terminal, `[host-service:<org>]`-prefixed lines) to show the teardown-ran log line.
2. Dirty delete: create a workspace, `touch scratch.txt` inside it, delete it — the dialog shows the uncommitted-changes warning and the button reads "Delete anyway". Confirm. Expect teardown to run (marker line appears). This is the case that was silently broken.
3. Teardown-failure retry: point teardown at a failing command (`config.local.json` teardown `["exit 1"]`), delete a workspace, see the TeardownFailedPane with output. Click "Delete anyway". Expect the delete to complete *without* re-running teardown (no new marker line after the failure attempt).
4. External surface: delete a workspace via the SDK/MCP `workspace.delete`. Expect teardown to run and the delete to succeed even if teardown fails.

Acceptance is behavioral: cases 1, 2 and 4 write the marker; case 3 completes without a second run; `typecheck`, `lint`, `test` are all clean.

## Idempotence and Recovery

All edits are additive or in-place; re-running the validation steps is safe. `destroy` remains idempotent from the caller's perspective (the in-flight guard and the existing saga ordering are untouched). If Milestone 2 or 3 goes wrong, Milestone 1 alone is still shippable and fixes the K3-class projects for clean deletes; the renderer changes are inert until the input field is used. Remember to remove any `config.local.json` used during manual validation (it is gitignored, but it changes local behavior).

## Artifacts and Notes

The two guards that cause the bug, verbatim from the current tree:

    // packages/host-service/src/runtime/teardown/teardown.ts:52
    const scriptPath = join(worktreePath, TEARDOWN_SCRIPT_REL_PATH);
    if (!existsSync(scriptPath)) return { status: "skipped" };

    // packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts:242
    if (!input.force && local && project) { ...runTeardown... }

    // apps/desktop/.../DashboardSidebarDeleteDialog.tsx:70
    onConfirm={() => run(hasWarnings)}   // hasWarnings ⇒ force ⇒ teardown skipped

K3's config, the shape that must work after this change:

    { "setup": ["./scripts/worktree/setup.sh"],
      "teardown": ["./scripts/worktree/teardown.sh"],
      "run": ["./scripts/worktree/run.sh"] }

## Interfaces and Dependencies

No new dependencies. End state signatures:

    // packages/host-service/src/runtime/setup/config.ts
    export function getResolvedTeardownCommands(config: SetupConfig | null): string[]

    // packages/host-service/src/runtime/teardown/teardown.ts
    export function resolveTeardownCommand(args: {
    	repoPath: string; worktreePath: string; projectId: string; homeDir?: string;
    }): string | null
    export function buildTeardownCommandString(command: string): string
    // runTeardown options gain: repoPath: string; projectId: string; homeDir?: string

    // packages/host-service/src/trpc/router/workspace-cleanup/workspace-cleanup.ts
    export interface DestroyWorkspaceInput {
    	workspaceId: string; deleteBranch: boolean; force: boolean; skipTeardown: boolean;
    }
    // destroy result gains: teardownStatus: "ok" | "skipped" | "failed" | "not-run"

    // apps/desktop renderer
    // useDestroyWorkspace destroy input gains skipTeardown?: boolean
    // useDestroyDialogState run(opts: { force: boolean; skipTeardown?: boolean })

---

Revision note (2026-07-07): added a Surprises & Discoveries entry establishing via git history (PR #178 → PR #3443) that config-array teardown is a regression of a shipped, documented behavior, and pointing the implementer at `apps/docs/content/docs/setup-teardown-scripts.mdx` as the behavioral spec. No scope change.
