# Code Workspace Trellis Initialization Design

## Architecture

Create Workspace stays the only product flow. Trellis is added as a setup
option inside that flow, not as a separate workspace cockpit.

Renderer responsibilities:

- Resolve the selected host URL.
- Query host-service for Trellis status on the selected local project.
- Let the user opt into initialization when Trellis is missing.
- Add the user's intent to the workspace create snapshot.
- Show a lightweight status row in the existing modal.

Host-service responsibilities:

- Own all filesystem checks for `.trellis/`.
- Own all Trellis CLI execution.
- Re-probe the final resolved worktree path after create/adopt.
- Return a structured Trellis setup result with warnings rather than throwing
  for non-strict setup failures.

Cloud/database responsibilities:

- No schema change in this slice.
- No Superset Task import in this slice.

## Data Flow

1. Renderer calls `workspaceCreation.getTrellisStatus({ projectId })`.
2. Host-service resolves the local project and checks:
   - `.trellis/` directory exists
   - `.trellis/config.yaml` exists
   - `.trellis/tasks` exists
   - `.trellis/.version` exists
3. Renderer displays one of:
   - Trellis ready
   - Trellis missing, with an "Initialize Trellis" toggle
   - Trellis status unavailable/error
4. Renderer submits `workspaces.create` with:
   - `trellisSetup: { initialize: true }` only when the user opted in
5. Host-service creates/adopts the worktree as it does today.
6. Host-service probes the final `worktreePath`.
7. If requested and missing, host-service runs repo-local Trellis CLI:
   - package manager command resolved from workspace root
   - arguments equivalent to `bunx --bun trellis init --yes --skip-existing --codex`
   - working directory is the final worktree path
8. Host-service returns `trellisSetup` in the create result.

## Contracts

`workspaceCreation.getTrellisStatus` returns:

- `state`: `ready | missing | partial | unavailable`
- `hasTrellis`
- `configPath`
- `version`
- `message`

`workspaces.create` input accepts:

- `trellisSetup?: { initialize?: boolean }`

`workspaces.create` result includes:

- `trellisSetup?: { state, initialized, warning?, version? }`

## Compatibility

- Existing clients can omit `trellisSetup`.
- Existing `.trellis/spec`, `.trellis/tasks`, and `.trellis/workspace` are never
  overwritten.
- If `.trellis/` already exists, init is skipped even when `initialize` is true.
- If the Trellis CLI cannot be executed, workspace creation still succeeds and a
  warning is returned.

## Task Mapping Direction

Superset Task should be the canonical product object. Trellis task records are a
repository-local workflow artifact. A later import/sync slice should map Trellis
tasks into Superset Tasks with source metadata and dedupe rules, but this slice
only prepares the Code workspace for that future bridge.
