# Remote Workspace Terminal Attach Research

## Existing Architecture Signals

- `packages/db/src/schema/schema.ts` already has cloud V2 host and workspace
  tables: `v2_hosts`, `v2_users_hosts`, `v2_workspaces`.
- The same schema already includes `v2_remote_control_sessions` with
  `hostId`, `workspaceId`, `terminalId`, `mode`, `status`, `viewerCount`, and
  token fields. This indicates remote control was planned at the data-model
  layer, but no active runtime/UI usage was found.
- `apps/relay/src/index.ts` proxies authenticated HTTP tRPC and WebSocket
  traffic under `/hosts/:hostId/*` after checking host access. It also disables
  Nagle's algorithm on connections, which matters for terminal keystroke
  latency.
- `apps/desktop/src/renderer/hooks/host-service/useHostTargetUrl` already
  resolves local host URLs directly and remote hosts through relay using
  `buildHostRoutingKey(organizationId, hostId)`.
- `packages/workspace-client` already builds tRPC clients from a `hostUrl` and
  builds WebSocket URLs with relay-compatible token query params.

## Terminal Runtime Findings

- `packages/host-service/src/terminal/terminal.ts` owns the host-service
  terminal route layer and bridges to `packages/pty-daemon`.
- `GET /terminal/:terminalId` attaches by `terminalId`; it can adopt live daemon
  sessions after host-service restart and uses the same `terminalId` rather than
  forcing a new shell.
- The route supports multiple attached WebSocket clients through
  `session.sockets`.
- PTY bytes remain binary WebSocket frames and are replayed from a bounded host
  buffer on attach.
- `terminalRouter.listSessions({ workspaceId })` exposes live listed terminal
  sessions from host-service memory.
- `terminal/resource-sessions` exposes live daemon sessions joined with the
  host-service `terminal_sessions` SQLite table. This is useful for settings or
  host-level diagnostics.

## Current Product Gaps

- Cloud V2 Workspace rows can sync across machines, but sidebar pinned state
  still contains local-only collections. A remote workspace may be visible in
  global Workspaces views while not pinned in the left sidebar.
- Remote workspace route/provider can resolve a relay host URL, but UI needs
  explicit handling for remote/offline state and terminal session adoption.
- Terminal sessions are currently local host-service runtime state. They can be
  listed via the owning host-service, but another device must query the owning
  host URL, not its own local host.
- A visible cloud row is not enough for full usability; host-service local
  SQLite rows must exist on the owning host. Remote attach should trust the
  owning host-service as the source of truth.

## Task Detail Sidebar Bug

- Screenshot shows the `Properties` sidebar at the task detail route with
  `Open in workspace` controls spilling horizontally.
- Relevant files:
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/PropertiesSidebar.tsx`
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx`
  - `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker`
- Likely cause: fixed `w-64` sidebar plus nested controls that need stricter
  `min-w-0`, `max-w-full`, and truncation boundaries, especially around
  `DevicePicker`, project button, `AgentSelect`, and `TrellisSetupRow`.

## Validation Implications

- Lower-level tests should verify remote host URL resolution and terminal
  attach/list APIs without needing two physical machines.
- Desktop Automation must still validate the real UI path and capture the Task
  detail layout screenshot.
- A full two-device manual validation is still valuable after a canary build:
  install on the work machine, sign in, leave this host online, and attach a
  terminal created here.
