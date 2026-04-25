# V2 Notification Hooks: Client-Side Playback Design

Status: PR #3675 shipped an MVP. This document is the design record for where the notification system should go next, including what v1 got wrong, what v2 fixed, what v2 still misses, and the target architecture.

## Executive Summary

Agent notification UX should be owned by the client, not by Electron main and not by the host-service.

The host-service should only ingest normalized agent lifecycle events and broadcast them over its authenticated event bus. The renderer or web client should resolve those events to visible workspaces/panes, update sidebar attention state, decide whether to suppress the notification, play audio, show OS/browser notifications, and handle click-to-focus.

This is the right split because the client is the only layer that knows:

- which workspace, tab, and pane the user is currently viewing
- whether the window/tab has focus
- which notification preferences apply
- how to focus the correct UI surface when a notification is clicked
- whether this is desktop, web, or another client

The shipped v2 path moved playback out of Electron main, which is the important architectural correction. It should now be tightened into a small client-side notification controller with explicit identity resolution, terminal-exit cleanup, click handling, and tests.

## Goals

- Support notifications when the host-service is local, remote, relayed, or eventually cloud-hosted.
- Preserve the good parts of v1 UX:
  - sound on completion and permission/input requests
  - no sound on start events
  - mute, volume, selected ringtone, and custom ringtone support on desktop
  - suppress notifications when the user is already looking at the relevant pane
  - sidebar indicators for working, permission, and review states
  - click a notification to focus the relevant workspace/pane
  - clear stuck transient statuses when the underlying terminal/session exits
- Keep host-service credentials out of PTY environments.
- Keep the hook endpoint deliberately low-capability.
- Make the shared path usable by desktop and web.
- Make event identity and status transitions testable as pure functions.

## Non-Goals

- Retire the v1 terminal hook server immediately. V1 terminals still need it until the v1 workspace UI is removed.
- Persist notification events durably. Chimes are acceptable to lose across disconnect/reconnect.
- Add cross-device or cross-tab dedup before web support needs it.
- Add arbitrary agent-provided notification title/body. The client should own displayed copy so a hook cannot spoof system messages.

## What V1 Got Right

V1 was not all bad. The target design should keep these behaviors:

- Hook failures never block the agent. Unknown event types are ignored with a successful response.
- `Start`, `Stop`, and `PermissionRequest` are normalized from several agent-specific hook names.
- `Start` updates working state but does not play a completion sound.
- Notifications are suppressed when the target pane is visible and the window is focused.
- Native notification clicks focus the app and route the renderer to the target tab/pane.
- Terminal exit events clear `working` and `permission` states so interrupted agents do not leave permanent sidebar dots.
- Notification audio honors mute, volume, selected ringtone, and custom ringtone playback.

## What V1 Got Wrong

V1's core problem was ownership. It split one user-facing feature across Electron main, a localhost Express hook server, renderer stores, local DB settings, and a tRPC subscription.

Specific problems:

- Electron main owned sound playback and OS notifications. That cannot work for an off-machine host-service or web client.
- Renderer owned pane status, so main had to receive a renderer state snapshot to decide suppression and notification titles. That snapshot can lag and is not a durable contract.
- The hook server was desktop-local and bound to Electron lifecycle. Remote host-service events had no way to reach the user-facing client.
- Notification ingress shared a server with unrelated auth callback fallback behavior.
- Event type mapping was duplicated and not exported from a shared contract.
- The hook protocol relied on query strings and shell-side string scraping.
- Pane identity was weak. Main tried to resolve `paneId` from partial metadata, but v2 panes are client-only and host-service cannot know them.
- Notification state was stored directly on v1 panes, making it hard to share with v2 panes or other clients.
- There was no single testable "notification controller" responsible for status transitions, suppression, playback, and click behavior.

## What Shipped In PR #3675

The MVP moved the playback trigger from Electron main to the renderer for v2 terminals:

```text
agent shell hook
  POST /trpc/notifications.hook
    host-service maps event type
    host-service broadcasts agent:lifecycle over /events WebSocket
      renderer listener updates v2 notification store
      renderer suppresses or plays ringtone
      renderer asks Electron main to show a silent native Notification
      dashboard sidebar reads aggregated v2 status
```

Important shipped pieces:

- `packages/host-service/src/trpc/router/notifications/notifications.ts`
  - public `notifications.hook` mutation
  - event type normalization
  - event-bus broadcast
- `packages/host-service/src/events/*`
  - `AgentLifecycleMessage`
  - `broadcastAgentLifecycle`
- `packages/workspace-client/src/lib/eventBus.ts`
  - typed `agent:lifecycle` client event
- `apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh`
  - posts to `SUPERSET_HOST_AGENT_HOOK_URL`
  - falls back to the v1 hook server on missing URL or non-2xx response
- `apps/desktop/src/renderer/routes/_authenticated/components/V2NotificationController`
  - mounts one host notification subscriber per host-service URL
  - owns lifecycle event handling, status transitions, suppression, ringtone playback, and native notification requests
- `apps/desktop/src/lib/trpc/routers/notifications.ts`
  - creates Electron native notifications and emits v2 source-focus events on click
- `apps/desktop/src/renderer/stores/v2-notifications`
  - separate v2 status store, keyed by typed notification source
    (`terminal:<id>`, `chat:<id>`) and aggregated by workspace, tab, and pane
- `apps/desktop/src/renderer/lib/ringtones`
  - renderer-side built-in ringtone playback
  - Electron-main playback for imported custom ringtone files

This was the right first move, but it should not be the final architecture.

## Current V2 Gaps

The current implementation is useful but incomplete.

- **The controller is still desktop-specific.** It imports Electron tRPC-backed settings and native notification APIs, so the current path is not actually web-ready.
- **Custom ringtone storage is still desktop-local.** Imported files are played through Electron main; web will need synced metadata plus browser-readable assets.
- **Integration coverage is still thin.** The pure transition and hook mutation paths are covered, but there is no end-to-end shell hook -> host-service event bus -> renderer assertion yet.

## Target Architecture

The correct design has five layers, each with a narrow responsibility.

```text
agent runtime / shell hook
  emits raw hook payload and stable Superset identifiers
  |
  v
host-service notification ingress
  validates shape, maps raw agent event names to normalized lifecycle events
  performs no user-facing decisions
  |
  v
host-service event bus
  broadcasts normalized events to authenticated clients for that host
  |
  v
client notification controller
  one controller per host connection
  resolves event identity to workspace/pane/session
  updates attention state
  decides suppression
  plays sound
  shows notification
  handles click-to-focus
  |
  v
UI surfaces
  dashboard sidebar, pane chrome, tab chrome, settings UI
```

### Layer 1: Agent Hook Script

The hook script should stay intentionally dumb:

- read the agent hook payload
- extract known IDs and event type
- POST JSON to `SUPERSET_HOST_AGENT_HOOK_URL`
- time out quickly
- fall back to the v1 hook server only for v1 compatibility
- never receive `HOST_SERVICE_SECRET` or any broad host credential

The script can continue to be defensive because hooks run in user shells with inconsistent payloads. Long term, wrappers should pass the normalized Superset identifiers directly so the script does less text parsing.

Required v2 hook payload:

- `terminalId`: stable runtime identity for terminal-backed agents
- `eventType`: raw agent lifecycle event name

`workspaceId`, `paneId`, and `tabId` should not be part of the v2 hook payload. Host-service derives `workspaceId` from `terminalId`, and the renderer derives pane/tab visibility from its current v2 pane layout.

### Layer 2: Host-Service Notification Ingress

The host-service endpoint should be an ingest endpoint, not a notification manager.

Responsibilities:

- accept the hook payload
- reject oversized or malformed input
- require `terminalId`
- derive `workspaceId` from the terminal session table
- ignore unknown event types
- normalize raw event names into a small lifecycle vocabulary
- attach `occurredAt`
- broadcast to the event bus
- return success even for ignored events so agent hooks do not block

It should not:

- play sound
- create OS notifications
- read user notification settings
- decide whether the user is viewing the target pane
- accept arbitrary notification title/body
- mutate workspace, pane, terminal, or chat state

Security posture:

- Keeping this endpoint unauthenticated is acceptable only because it is deliberately low-capability.
- The only allowed effect must remain "broadcast a generic lifecycle event."
- If this endpoint ever gains capabilities beyond chime/sidebar attention, it needs a new auth design.
- Do not reuse `HOST_SERVICE_SECRET` in PTY env. If auth is required later, use a scoped hook token with limited lifetime and limited permissions.
- Add basic abuse controls:
  - payload size limit
  - event type allowlist
  - workspace existence check when cheap
  - per-process or per-workspace rate limiting
  - generic responses that do not expose workspace data

### Layer 3: Event Bus Contract

The event bus should carry normalized lifecycle events and terminal/session lifecycle events.

Current event:

```ts
type AgentLifecycleEventType = "Start" | "Stop" | "PermissionRequest";
```

Recommended normalized model:

```ts
type AgentLifecycleKind =
  | "started"
  | "waiting-for-input"
  | "completed";

interface AgentLifecycleEvent {
  type: "agent:lifecycle";
  workspaceId: string;
  kind: AgentLifecycleKind;
  terminalId: string;
  rawEventType?: string;
  occurredAt: number;
}
```

The existing `Start` / `Stop` / `PermissionRequest` names can remain for compatibility, but the client code should convert them immediately into the normalized client vocabulary. It makes status transitions easier to read and avoids leaking hook-system naming into UI logic.

Terminal exits should also be visible to the same controller:

```ts
interface TerminalLifecycleEvent {
  type: "terminal:lifecycle";
  workspaceId: string;
  terminalId: string;
  kind: "exited" | "killed" | "errored";
  exitCode?: number;
  signal?: number;
  occurredAt: number;
}
```

This is how v2 gets the v1 behavior of clearing stuck statuses without coupling to mounted terminal panes.

### Layer 4: Client Notification Controller

The client should have one controller per host URL, not one notification hook per workspace.

Responsibilities:

- subscribe to `agent:lifecycle` and `terminal:lifecycle` for all workspaces on a host
- keep a current index of v2 pane layout data:
  - `terminalId -> { workspaceId, tabId, paneId }`
- resolve incoming events to a `NotificationTarget`
- update the attention store through pure transition functions
- suppress audio/toasts only when the target is actually visible and focused
- read notification preferences through a platform abstraction
- play ringtone through a platform abstraction
- show native/browser notifications through a platform abstraction
- handle click-to-focus through a platform abstraction

Suggested shape:

```ts
interface NotificationTarget {
  workspaceId: string;
  tabId?: string;
  paneId?: string;
  sourceKey: string;
  sourceKind: "terminal" | "chat" | "automation" | "unknown";
}

interface NotificationPreferences {
  soundsMuted: boolean;
  volume: number;
  selectedRingtoneId: string;
  notificationsEnabled: boolean;
}

interface NotificationPlatform {
  getPreferences(): NotificationPreferences;
  playRingtone(input: { ringtoneId: string; volume: number; muted: boolean }): void;
  showNotification(input: {
    target: NotificationTarget;
    kind: "completed" | "waiting-for-input";
    silent: boolean;
  }): void;
  focusTarget(target: NotificationTarget): void;
}
```

Desktop can implement `NotificationPlatform` with Electron/local-db today. Web can implement it with Postgres-backed user settings, browser `Notification`, and `BroadcastChannel` leader election later.

### Layer 5: Attention Store

Do not treat `terminalId` as a fake `paneId`. It works for sidebar aggregation, but it obscures what the key actually means.

Use an attention store keyed by a stable source key:

```ts
type AttentionStatus = "working" | "permission" | "review";

interface AttentionEntry {
  workspaceId: string;
  sourceKey: string;
  sourceKind: "terminal" | "chat" | "automation" | "unknown";
  status: AttentionStatus;
  paneId?: string;
  tabId?: string;
  updatedAt: number;
}
```

Key examples:

| Event identifiers | Source key |
| --- | --- |
| `terminalId=abc` | `terminal:abc` |
| no source ID | ignore for status, but may still play a generic chime if allowed |

Workspace sidebar aggregation should reduce all entries for a workspace by priority:

```text
permission > working > review > idle
```

Pane/tab chrome can use `paneId` when resolution succeeds. The sidebar should still work when only a source key is available.

## Status Transitions

Status transitions should be pure and tested.

| Incoming event | Prior status | Target visible and focused | Next status |
| --- | --- | --- | --- |
| `started` | any | any | `working` |
| `waiting-for-input` | any | any | `permission` |
| `completed` | `permission` | any | clear |
| `completed` | any | yes | clear |
| `completed` | any | no | `review` |
| `terminal exited/killed/errored` | `working` or `permission` | any | clear |
| user views target with `review` | `review` | yes | clear |

Optional hardening:

- expire stale `working` statuses after a long TTL if no stop/exit arrives
- expire stale `permission` statuses only after the source is known dead
- keep `review` until acknowledged or workspace closes

## Suppression Rules

Suppression should be target-based, not workspace-based.

Correct behavior:

- If the app/tab is not focused, do not suppress.
- If the event resolves to a visible active pane, suppress sound and OS/browser notification.
- If the event resolves to a different pane in the same workspace, do not suppress.
- If the event cannot resolve beyond `workspaceId`, do not blindly suppress just because the workspace is visible. Prefer a generic notification over a missed completion.
- A `waiting-for-input` event may still show an in-app indicator even when sound is suppressed.

This differs from the shipped fallback, which suppresses by current workspace when `paneId` and `tabId` are absent.

## Notification Click Behavior

Click handling is part of parity and should not be optional.

On notification click:

- focus/restore the desktop window or browser tab when possible
- navigate to `/v2-workspace/$workspaceId`
- if `tabId` and `paneId` are known, activate them
- if only `terminalId` is known, resolve it through pane layout and activate the matching pane
- if no pane can be resolved, navigate to the workspace and clear review attention for that source/workspace

V1 did this through Electron main emitting `FOCUS_TAB`. V2 now emits a typed source-focus event from Electron main, and the renderer routes to the v2 workspace with `terminalId` or `chatSessionId` search params.

## Ringtones And Preferences

The notification controller should depend on a preference provider, not directly on `electronTrpc`.

Desktop phase:

- read existing local-db settings through Electron tRPC
- keep built-in renderer playback
- ask Electron main to play imported custom ringtone files so local paths are not exposed to the renderer

Web phase:

- move notification preferences to synced user settings
- store custom ringtones outside local filesystem, for example R2 plus IndexedDB cache
- add cross-tab leadership so only one tab plays sound

Audio playback should stay client-side and best-effort. The desktop renderer now follows the VS Code-style `HTMLAudioElement.play()` pattern: cache real audio elements, suppress expected user-gesture/autoplay failures, and avoid global Electron autoplay-policy overrides.

## Host And Workspace Listener Topology

Previous topology:

```text
authenticated layout
  V2NotificationController
    one HostNotificationSubscriber per host URL
      eventBus.on("agent:lifecycle", "*")
      eventBus.on("terminal:lifecycle", "*")
```

Current topology:

```text
authenticated layout
  V2NotificationController
    group open/known workspaces by host URL
    one HostNotificationSubscriber per host URL
      eventBus.on("agent:lifecycle", "*")
      eventBus.on("terminal:lifecycle", "*")
      resolve event workspace and typed source locally
```

Benefits:

- one subscription path per host
- one set of notification settings reads
- one place for click handling and suppression
- easier web reuse
- easier tests

The event bus already supports `workspaceId: "*"`, so this is mostly a client refactor.

## Testing Plan

Add tests before expanding the behavior further.

Host-service unit tests:

- `mapEventType` maps every v1-supported raw event name.
- unknown and empty event types return ignored success.
- missing or unknown `terminalId` returns ignored success.
- valid hook input broadcasts exactly one normalized event.
- public hook endpoint does not expose workspace data in responses.
- rate limiting/payload limits when implemented.

Workspace-client tests:

- `agent:lifecycle` messages dispatch to matching workspace listeners.
- wildcard listeners receive all workspace events.
- reconnect preserves active subscriptions.

Renderer/client unit tests:

- identity resolver maps `terminalId` to v2 pane locations.
- status transition table is covered.
- terminal exit clears `working` and `permission`.
- review clears when the user views the target.
- suppression only happens for focused, visible target panes.
- unresolved workspace-only events are not over-suppressed.
- notification click calls the focus adapter with the resolved target.
- imported custom ringtone playback goes through Electron main, while built-in ringtone playback stays in the renderer.

Integration tests:

- shell hook POST -> host-service event bus -> client controller receives event.
- remote/relay host URL uses the same event path.
- v1 fallback still works when `SUPERSET_HOST_AGENT_HOOK_URL` is absent or non-2xx.

Manual QA:

- local v2 terminal completes while current pane visible: sidebar clears, no chime.
- local v2 terminal completes in background workspace: chime, sidebar review dot.
- permission request in background workspace: chime, sidebar permission dot.
- kill/interruption clears working/permission.
- notification click focuses the right workspace.
- mute/volume/ringtone settings apply.
- host-service restart does not permanently duplicate listeners.

## Implementation Plan

### Phase 1: Stabilize The MVP

- Add tests for host-service event mapping and hook mutation.
- Extract v2 status transition logic into pure functions.
- Add terminal lifecycle events to host-service event bus.
- Clear v2 `working` and `permission` statuses on terminal exit.
- Add click handling for v2 notifications.
- Fix suppression to resolve by `terminalId` before falling back.

### Phase 2: Refactor Ownership

- Replace per-workspace listeners with per-host notification controllers.
- Store v2 notification attention in `v2-notifications` keyed by source key, not fake pane ID.
- Add a pane-layout identity index for v2.
- Introduce a `NotificationPlatform` abstraction for preferences, playback, browser/OS notification, and focus.
- Keep desktop implementation backed by existing Electron/local-db APIs.

### Phase 3: Web Readiness

- Move preferences to synced user settings.
- Add browser notification permission UI.
- Add BroadcastChannel leadership for cross-tab dedup.
- Add web-compatible ringtone asset and custom ringtone loading.
- Reuse the same controller with a web platform adapter.

### Phase 4: V1 Retirement

- Keep the v1 hook server until v1 workspace UI is gone.
- During retirement, remove:
  - Electron main notification playback
  - v1 localhost hook server
  - duplicated event mappers
  - v1 pane-status notification paths
- Keep only the host-service ingest and client notification controller.

## File Shape Recommendation

Suggested future layout:

```text
packages/host-service/src/events/
  agent-lifecycle.ts          # event types, normalization exports
  event-bus.ts

packages/host-service/src/trpc/router/notifications/
  notifications.ts            # low-capability ingest only
  notifications.test.ts

packages/workspace-client/src/lib/
  eventBus.ts                 # typed wildcard and per-workspace events

apps/desktop/src/renderer/routes/_authenticated/components/AgentNotificationControllers/
  AgentNotificationControllers.tsx
  components/HostAgentNotificationController/
    HostAgentNotificationController.tsx
    hooks/useAgentNotificationController/
      useAgentNotificationController.ts
      resolveNotificationTarget.ts
      notificationTransitions.ts
      notificationSuppression.ts
      *.test.ts

apps/desktop/src/renderer/stores/agent-attention/
  store.ts
  selectors.ts

apps/desktop/src/renderer/lib/notifications/
  desktopNotificationPlatform.ts
  ringtonePlayback.ts
```

When this moves to web, create a web platform adapter rather than forking the lifecycle logic.

## Acceptance Criteria

This design is done when:

- v2 completion and permission notifications work for local and remote host-service.
- v2 has parity with v1 for sound, mute, volume, suppression, click-to-focus, and terminal-exit cleanup.
- the notification controller is client-side and host-agnostic.
- host-service remains a low-capability event ingress layer.
- no broad host-service secret is exposed to agent PTY env.
- behavior is covered by unit tests for normalization, identity resolution, transitions, suppression, and click handling.
- web can reuse the controller by swapping the platform adapter.

## Security Rule For Future Changes

Any future change that makes `notifications.hook` do more than broadcast generic lifecycle attention must re-open the auth design. The endpoint is intentionally public only because it is low-impact. Do not add state mutation, data reads, arbitrary user-visible content, or command execution behind the same unauthenticated route.
