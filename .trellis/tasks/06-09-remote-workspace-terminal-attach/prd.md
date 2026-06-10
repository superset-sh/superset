# Remote workspace terminal attach

## Goal

Let a user signed into Superset on machine A open and control a Workspace and
Terminal session that actually lives on machine B, without cloning the worktree
or moving compute to machine A.

The product model should feel like tmux attach: files, git state, agents, and
PTY processes remain on the host that created the workspace; another signed-in
device becomes a client/viewer/controller of that host.

## Requirements

- Same-account / same-organization devices can see cloud-synced V2 Workspace
  rows created by another accessible host.
- Opening a remote Workspace must route host-service tRPC and terminal
  WebSocket traffic through the existing relay instead of creating a local
  worktree.
- Remote Terminal sessions for a Workspace must be discoverable from another
  device and attachable by `terminalId`.
- Attached remote Terminals must support output replay, live output, input, and
  resize through the existing host-service / pty-daemon session model.
- The UI must clearly communicate when a Workspace is remote and which Host owns
  it.
- If the owning Host is offline or inaccessible, the Workspace should stay
  visible but show an unavailable state instead of silently creating local state.
- The Task detail "Open in workspace" properties section must not overflow its
  right sidebar at narrow widths or with long project/workspace names.
- Implementation must preserve existing local Workspace and Terminal behavior.

## Acceptance Criteria

- [ ] From device A, a Workspace created on device B is visible in the V2
      Workspaces list/sidebar when both devices use the same account,
      organization, and backend.
- [ ] Opening that remote Workspace does not create a local worktree on device A;
      the route uses the Workspace's `hostId` to resolve a remote relay host URL.
- [ ] A live Terminal session created on device B appears as an attachable
      session when device A opens that Workspace.
- [ ] Device A can attach to the remote Terminal and send input; the command runs
      on device B's shell.
- [ ] Multiple clients can observe the same Terminal without killing or
      respawning the PTY.
- [ ] If device B is offline, device A shows an actionable unavailable state and
      does not offer a broken attach button.
- [ ] Local Workspace terminal create/attach still works on the same machine.
- [ ] Task detail right Properties sidebar keeps Open-in-Workspace controls fully
      visible and clickable; long host/project names truncate within the sidebar.
- [ ] Focused unit/source/integration tests cover host URL routing, terminal
      session discovery/attach behavior, and sidebar overflow-prone layout.
- [ ] Desktop Automation acceptance captures screenshots for remote workspace
      route state and Task detail layout.

## Notes

- This is a complex desktop/runtime task. Keep `design.md` and `implement.md` in
  sync before starting implementation.
- Out of scope for this MVP: creating a fresh local clone on the second device,
  cloud-syncing full terminal scrollback, implementing collaborative cursors, or
  building a separate remote-control sharing-link UX.
