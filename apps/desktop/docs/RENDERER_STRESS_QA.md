# Renderer Stress QA Fixtures and Instrumentation

This is the repeatable process for local renderer QA with seeded V2
workspaces, large dirty diffs, terminal stress, WebGL context-loss coverage,
and renderer instrumentation. Use it before broad manual QA when a change may
affect workspace switching, changes/diff panels, terminal rendering, tab/pane
state, or renderer responsiveness.

## Safety

- Run this only against a local dev `SUPERSET_HOME_DIR`. The fixture command
  writes local TanStack and host-service SQLite rows.
- Do not point this at production or shared data.
- The fixture worktrees are disposable. By default they live at
  `~/workplace/playground/superset-renderer-stress-fixtures`.
- If the desktop app is already open when fixtures are created, restart it
  before running stress so the main process sees the seeded host DB state.

## What The Fixture Command Seeds

`bun --cwd apps/desktop stress:renderer:fixtures` creates:

- A disposable git repo with many tracked files.
- Multiple git worktrees with large dirty changes, deletes, new files, and
  renames.
- A V2 project row in the local persisted collections DB.
- V2 workspace rows for the generated worktrees.
- Matching host-service `projects` and `workspaces` rows in
  `host/<organization-id>/host.db`.

The stress harness then drives those workspaces through the renderer using the
Chrome DevTools Protocol (CDP) and the in-app renderer stress bridge.

## Prepare Fixture Workspaces

For a normal large-diff run:

```bash
bun --cwd apps/desktop stress:renderer:fixtures -- --json
```

For a smaller smoke fixture while iterating:

```bash
bun --cwd apps/desktop stress:renderer:fixtures -- \
  --workspace-count 2 \
  --changed-files 20 \
  --lines-per-file 20 \
  --base-files 80 \
  --json
```

If you are running with `SKIP_ENV_VALIDATION=1`, the renderer may use the
mock auth organization id (`mock-org-id`). In that case, seed the fixture into
that org and pass a host id from an existing local host DB:

```bash
bun --cwd apps/desktop stress:renderer:fixtures -- \
  --organization-id mock-org-id \
  --host-id <local-host-id> \
  --workspace-count 2 \
  --changed-files 20 \
  --lines-per-file 20 \
  --base-files 80 \
  --json
```

If the fixture command reports `Host DB not found` for the mock org, copy an
existing local host DB into the mock org path before seeding:

```bash
mkdir -p superset-dev-data/host/mock-org-id
sqlite3 superset-dev-data/host/<existing-org-id>/host.db \
  ".backup 'superset-dev-data/host/mock-org-id/host.db'"
```

Keep the `workspaceIds` from the JSON output. Most targeted QA runs should pass
those ids explicitly so the harness exercises real seeded workspaces instead
of falling back to hash navigation.

## Start The Desktop App With CDP

Start the dev app in one shell:

```bash
SKIP_ENV_VALIDATION=1 \
SUPERSET_RENDERER_STRESS_CDP_PORT=9333 \
bun --cwd apps/desktop dev
```

`SUPERSET_RENDERER_STRESS_CDP_PORT` opens the Electron renderer for CDP-based
stress automation. The main process also disables extension loading while this
variable is set so extension noise does not affect results.

## Run The Stress Harness

Run stress from another shell after the app has loaded:

```bash
bun --cwd apps/desktop stress:renderer -- \
  --port 9333 \
  --scenario all \
  --workspace-ids <workspace-id-1>,<workspace-id-2> \
  --iterations 1000 \
  --route-iterations 240 \
  --heavy-iterations 500 \
  --timeout-ms 300000
```

For the terminal-heavy flow we used in this PR:

```bash
bun --cwd apps/desktop stress:renderer -- \
  --port 9333 \
  --scenario terminal-heavy \
  --workspace-ids <workspace-id-1>,<workspace-id-2> \
  --terminal-iterations 200 \
  --terminal-tab-count 32 \
  --terminal-panes-per-tab 4 \
  --terminal-lines 80 \
  --terminal-payload-bytes 4096 \
  --interval-ms 0 \
  --settle-ms 1500 \
  --timeout-ms 300000 \
  --max-heartbeat-delay-ms 10000 \
  --max-long-task-ms 10000 \
  --progress-every 10
```

The terminal-heavy scenario forces terminal WebGL context loss by default. Add
`--no-terminal-webgl-loss` when you need a control run without forced context
loss.

## Useful Scenarios

- `workspace-switch`: repeatedly activates workspaces.
- `workspace-switch-heavy`: activates workspaces while generating synthetic
  tabs and panes.
- `workspace-heavy`: runs mixed workspace, pane, browser, and diff actions.
- `route-sweep`: navigates renderer routes.
- `terminal-heavy`: creates synthetic terminal tabs/panes, writes large ANSI
  payloads, switches tabs, and forces terminal WebGL context loss.
- `all`: combines route, workspace, heavy, and terminal coverage.

## Instrumentation Knobs

Use these options when a run fails or feels slow:

```bash
--profile-cpu
--react-probe
--json
--progress-every 10
--max-heartbeat-delay-ms <ms>
--max-long-task-ms <ms>
--timeout-ms <ms>
```

What to look at:

- `errorCount` and `errors`: uncaught renderer errors and unhandled rejections.
- `maxHeartbeatDelayMs`: event-loop stalls detected by the renderer heartbeat.
- `maxLongTaskDurationMs` and `longTasks`: browser long-task evidence.
- `terminalWebglContextLosses`: terminal canvas/WebGL context-loss samples.
- CPU profile output: hottest JS frames during the run.
- React probe output: commit/component counts when the React DevTools hook is
  available.

For strict automated runs, keep the default heartbeat and long-task thresholds.
For crash reproduction or exploratory QA, raise them so the harness can keep
running long enough to collect the actual renderer error.

## Reproducing A Suspected Regression

Use paired runs so the result identifies the failing subsystem instead of just
the commit range:

1. Run the fixture command and record the generated workspace ids.
2. Start the app with CDP enabled.
3. Run the target stress scenario on the current branch.
4. Locally revert only the suspected fix with `git revert --no-commit <sha>`
   or restore only the relevant files.
5. Restart the app with CDP enabled.
6. Run the exact same stress command with the same workspace ids.
7. Restore the branch and rerun the command once more.

In this PR, that process showed the renderer did not need a full process crash
to fail. The failing signal was an unhandled rejection:

```text
RangeError: WebAssembly.instantiate(): Out of memory
```

The stack came from `@xterm/addon-image`, and it reproduced both with the
WebGL context-loss fix reverted and restored. That isolated the issue to
per-terminal image decoder memory, not daemon update/attach behavior and not
terminal sizing.

## Manual QA After Stress

After an automated run passes, keep the app open and manually check:

- Workspace switching between the seeded large-diff workspaces.
- Changes panel status, file list, file selection, diff render, and staging.
- Terminal tab switching, pane splitting, clear, search, and resize.
- New terminal creation immediately after attach. The terminal should size
  correctly without waiting for a later layout event.
- Returning to an existing terminal. It should not perform a full replay just
  because the user switched away and back.
- Navigation away from and back to the workspace route.
- Opening and closing enough terminal tabs/panes to verify WebGL fallback does
  not change terminal geometry.

## Cleanup

The fixture command removes previous rows for the generated
`renderer-stress-large-diff` project before inserting fresh rows. To remove the
fixture files manually:

```bash
rm -rf ~/workplace/playground/superset-renderer-stress-fixtures
```

If you copied a host DB into `mock-org-id` only for stress testing, remove it
when you want to return to the normal local auth org:

```bash
rm -rf superset-dev-data/host/mock-org-id
```

