---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.0.0
functional_group: PLATF
---

# Use Cases: Platform Integration (PLATF)

| ID | Title | Description |
|----|-------|-------------|
| UC-PLATF-01 | Receive OS push notifications on lifecycle events | User receives Expo push notifications when an agent finishes a turn or pauses for user input while the app is backgrounded. |
| UC-PLATF-02 | Resume session state after background/foreground | System catches up missed message events using a cursor protocol when the app returns from background. |
| UC-PLATF-03 | Show host-offline UI state | System displays a clear UI banner and disables interactive actions when the user's host-service is unreachable. |
| UC-PLATF-04 | Reconnect automatically when host returns online | System automatically resumes session activity when the host returns online without requiring user action. |
| UC-PLATF-05 | Sync sessions created on other devices | System renders new sessions created on desktop or via Slack agent in the mobile session list in realtime. |

---

## UC-PLATF-01: Receive OS push notifications on lifecycle events

The host-service emits lifecycle events via its `notificationsEmitter` (`NOTIFICATION_EVENTS.AGENT_LIFECYCLE`). For mobile users, these events are forwarded as Expo push notifications to the device. Notifications are sent for: agent turn complete, agent paused for user input (any of the three PAUSE types), agent failed. Notifications include the session id and workspace id so tapping them navigates the user directly to the relevant session.

**Acceptance Criteria:**
- ☐ User receives an OS push notification when an agent turn completes while the mobile app is backgrounded
- ☐ User receives an OS push notification when an agent pauses for tool approval, ask_user, or plan approval while the app is backgrounded
- ☐ User receives an OS push notification when an agent turn fails while the app is backgrounded
- ☐ User can tap a notification to open the mobile app directly into the corresponding chat session
- ☐ System registers the device's Expo push token with the cloud backend on app launch and re-registers on token refresh
- ☐ System suppresses redundant notifications when the mobile app is foregrounded and actively viewing the corresponding session
- ☐ System includes the session id, workspace id, and a human-readable summary in the notification payload

---

## UC-PLATF-02: Resume session state after background/foreground

When the mobile app is suspended (OS background, screen lock) and resumed, the chat view catches up missed events using a cursor protocol (analogous to desktop's `stream-next-offset` + `stream-cursor` headers from `apps/api /api/chat/[sessionId]/stream`). On resume, the chat view re-queries `chat.getSnapshot` or `chat.listMessages` and reconciles any local optimistic state.

**Acceptance Criteria:**
- ☐ System detects when the mobile app returns from background to foreground for an open chat session
- ☐ System re-queries `chat.getSnapshot` over the relay when the chat view returns from background to catch up missed events
- ☐ User can see any messages, tool calls, or pause prompts that arrived while the app was backgrounded once resume completes
- ☐ System reconciles local optimistic message state with the snapshot returned by the host, deduplicating duplicates
- ☐ User can see a brief loading indicator on the chat view while the resume snapshot is being fetched
- ☐ System opens any pending bottom-sheet pause prompts that became active while the app was backgrounded

---

## UC-PLATF-03: Show host-offline UI state

If the host-service becomes unreachable (network error, host shutdown, relay tunnel down), the chat view shows a clear banner indicating "Host offline" with retry affordance. The composer disables Send while the host is offline. The session list (Electric-backed) continues to render existing data without errors but flagging it as stale.

**Acceptance Criteria:**
- ☐ User can see a "Host offline" banner at the top of the chat view when the host-service is unreachable
- ☐ User can see the Send button disabled while the host-service is unreachable
- ☐ User can tap a Retry affordance on the banner to manually attempt reconnection
- ☐ System distinguishes "host offline" from "host paid plan required" / "host capacity exceeded" by surfacing the dispatch outcome enum (`skipped_offline`, `skipped_unpaid`, `dispatch_failed`) from the relay
- ☐ User can see the session list continue to render existing data when the host is offline (Electric shape keeps working)
- ☐ System logs the host-offline event with the host id and timestamp for diagnostics

---

## UC-PLATF-04: Reconnect automatically when host returns online

When the host-service is detected as available again (poll, push notification, manual retry, network change), the mobile app automatically clears the offline banner, re-enables Send, and re-fetches the session snapshot. No user action required.

**Acceptance Criteria:**
- ☐ System detects host availability returning via periodic poll or push notification while the offline banner is shown
- ☐ System clears the offline banner automatically on reconnect detection
- ☐ System re-enables the Send button on the chat view when the host returns online
- ☐ System re-fetches `chat.getSnapshot` for the open session and reconciles any missed events on reconnect
- ☐ User can see a brief reconnect indicator and then normal operation resume without further action

---

## UC-PLATF-05: Sync sessions created on other devices

A session created from desktop, from a Slack agent (`dd1f51793` proactive workspace spawn pattern), or from another browser tab appears in the mobile session list in realtime via the ElectricSQL `chat_sessions` shape. This use case requires no new infrastructure — the shape is already published and filtered by org.

**Acceptance Criteria:**
- ☐ User can see a session created from desktop appear in the mobile session list within a short window of creation
- ☐ User can see a session spawned by the Slack agent appear in the mobile session list within a short window of creation
- ☐ System uses the existing ElectricSQL `chat_sessions` shape at `apps/electric-proxy/src/where.ts:136-137` for the sync
- ☐ User can see title updates from other devices reflected in the mobile list in realtime
- ☐ System filters incoming sessions to the user's active organization and the currently selected workspace
