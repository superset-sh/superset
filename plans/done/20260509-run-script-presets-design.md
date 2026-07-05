# Workspace Run Definitions With Preset Backing

Status: implemented

## What Shipped

- Added a shared workspace-run resolver that selects one run definition from
  project-targeted presets, `.superset/config.json` `run`, or global presets.
- Added `useAsWorkspaceRun` to terminal preset schemas and settings UI.
- Kept `.superset/config.json` `run` as the simple repo-owned script path.
- Updated the v1 Run button to consume workspace-run definitions while keeping
  v1-style stop semantics.
- Added v2 workspace Run button support, backed by terminal-id keyed local run
  state.
- Added host-service `config.getWorkspaceRunDefinition` and
  `terminal.writeInput` so v2 can resolve project config and send Ctrl-C
  without depending on a mounted terminal pane.
- Added a Run tab to the v2 project scripts editor.

## Final Semantics

The Run button is intentionally a small bridge between project scripts and
terminal presets, not a generalized command framework.

Resolution precedence:

1. project-targeted preset with `useAsWorkspaceRun: true`;
2. project config `run`;
3. global preset with `useAsWorkspaceRun: true`;
4. none.

Starting a run creates a fresh terminal session and a fresh terminal viewer so
old output stays inspectable. Stopping sends Ctrl-C and immediately marks the
run stopped, matching v1 behavior and avoiding a sticky intermediate
`stopping` state. Force Stop kills the terminal session when a run is still
recorded as running.

V2 run metadata lives in workspace local state keyed by `terminalId`. Pane data
stays as `{ terminalId }`; terminal UI derives the run badge/status by looking
up that id.

## Deferred

- Config-backed run rows in the general preset table.
- Repo-owned preset arrays or read-only virtual preset rows.
- Database-backed run metadata in host-service.
- Readiness, health, or custom lifecycle hooks from run scripts.
- A generalized command origin/source model beyond workspace run.
