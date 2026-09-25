# [mobile] Cross-client session and tab sync

Status: design proposal. Companion to `plans/mobile-chat-runtime.md`.

## Problem

Workspace session state is split across storage layers, so desktop and mobile do
not present the same workspace contents.

| State | Lives in | Shared today? | Result |
|---|---|---|---|
| Chat session metadata | Cloud Postgres | Yes, via Electric | Chat list is shared |
| Chat message content | Host mastracode memory | No | Mobile needs online host relay |
| Terminal sessions/status | Host SQLite | No | Mobile uses interim host query |
| Open panes/tabs | Desktop localStorage | No | Tabs are per device |

## Goal

Give all clients the same per-workspace session list without making desktop tab
layout global across devices.

## Recommendation

### 1. Sync terminal sessions and agent status.

Add a cloud `terminal_sessions` style table and dual-write from host-service
when terminal sessions are created/exited and when terminal-agent lifecycle
events arrive. Add the table to Electric and expose client collections.

Sketch:

`terminal_sessions { id, organization_id, v2_workspace_id, host_id, agent_id, status, last_event_type, last_event_at, created_at, ended_at }`

This removes mobile's per-host `terminalAgents.listByWorkspace` workaround and
lets offline clients show last-known terminal state.

### 2. Render one workspace sessions list.

Merge `chatSessions` and synced `terminalSessions` client-side, sorted by last
activity.

- Mobile already uses this shape; terminal rows are tagged and not clickable.
- Desktop can add a launcher/list beside chat sessions. Opening a chat row should
  reuse the existing focus-or-add-chat-pane path. Terminal rows can remain
  status-only.

### 3. Keep pane layout local-first.

Do not sync full desktop pane geometry or opened tab layout. Phones and desktops
want different layouts, and full sync creates unnecessary conflict handling.

If cross-device resume becomes important later, sync only an advisory pinned or
recent session set per user/workspace; keep geometry local.

## Deferred

- Persisting chat messages to cloud. This is larger than session-list parity
  because mastracode owns the host memory store.
- Host push/subscriptions for mobile chat snapshots. This would reduce polling
  volume but does not solve offline history.

## Open Questions

- Exact reduced terminal status model: `active`, `working`, `needs_input`,
  `exited`, or a smaller set?
- Retention policy for exited terminal sessions.
- Whether terminal command titles are safe to sync to cloud.
- Whether CLI should read the same synced collection or stay host-direct.
