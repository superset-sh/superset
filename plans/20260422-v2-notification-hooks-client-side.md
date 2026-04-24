# V2 Notification Hooks: Client-Side Playback

Shipped in PR #3675. First commit `f6aed52f4` (the branch's `save` baseline) through `103c00a17`; the doc itself is `828ca8c21`.

## Goal

Play the agent finish sound + surface sidebar status on the **renderer** instead of the electron main process, so v2 notifications work when host-service is off-machine (relay / remote device). Keep v1 feature parity: ringtone playback, volume/mute, pane-visibility suppression, sidebar working/permission/review indicator on the dashboard workspace list.

## Why we moved off electron main

V1 plays sound in electron main via `afplay`/`paplay` child processes and shows native notifications from main. That works when main and the agent run on the same machine. V2 workspaces can have their PTYs on a remote host-service reached via relay — electron main no longer sits in the agent's path, so it can't hear the hook. Playback has to happen wherever the user is looking: the renderer.

## Principles

- **One code path for web and electron renderer.** Audio plays via `HTMLAudioElement` in the renderer; electron main does no sound work for v2. When the web client comes online, the same hooks/stores carry over.
- **Host-service is the hook ingress.** The agent shell script POSTs to host-service's tRPC, not electron's localhost Express server.
- **Same UX as v1.** Single ringtone per user applied to all hook events. No event-specific sounds, no randomized variants, no multi-slot library.
- **Feature-parity before parity-plus.** Ship built-ins first; custom ringtone and Postgres-synced prefs are follow-ups.

## Non-goals

- Event-specific sounds (save / format / chat-received). Not v1 behavior.
- Randomized sound variants (vscode's `responseReceived1..4.mp3` style).
- Multi-slot custom ringtone library. Keep v1's single-slot model.
- Per-workspace ringtone override.
- Native OS integrations beyond `Notification` + `HTMLAudioElement` (no dock bounce, no tray flash).
- Cross-device dedup. If a user has web + desktop open, both chime. Same as email.

## Architecture

```text
agent shell hook (notify.sh)
   │ POST /trpc/notifications.hook  (unauthenticated, loopback)
   ▼
host-service
   ├── mapEventType() normalizes 20+ agent-specific strings to Start / Stop / PermissionRequest
   └── EventBus.broadcastAgentLifecycle()
         │
         ▼ fan out on the existing WebSocket event bus alongside git:changed / fs:events
renderer (desktop electron; web later)
   ├── V2AgentHookListeners at _authenticated/layout.tsx — one listener per open v2 workspace
   ├── useV2AgentHookListener(workspaceId)
   │     ├── updatePaneStatus → useV2PaneStatusStore (working/permission/review)
   │     ├── shouldSuppress   → skip ringtone if user is viewing + window focused
   │     ├── playRingtone     → HTMLAudioElement with the 11 bundled v1 mp3s
   │     └── new Notification() → native OS toast (silent, we play audio ourselves)
   └── DashboardSidebarWorkspaceIcon renders the status dot (amber spinner / red pulse / static green)
```

Electron main's v1 hook server (`apps/desktop/src/main/lib/notifications/server.ts`) stays running for v1 terminals. The shell script prefers the v2 host-service endpoint when `SUPERSET_HOST_AGENT_HOOK_URL` is set; falls back to v1 on missing URL or non-2xx response.

## What shipped

### host-service (hook ingress + broadcast)

- **`packages/host-service/src/events/map-event-type.ts`** — normalizes arbitrary agent event names to `Start | Stop | PermissionRequest | null`. Ported from `apps/desktop/src/main/lib/notifications/map-event-type.ts` (duplicated per the v1/v2 duplication memory — v1 dies with the v1 UI sunset, so no shared extraction).
- **`packages/host-service/src/events/types.ts`** — `AgentLifecycleMessage` added to the `ServerMessage` union. Fields: `workspaceId`, `eventType`, optional `paneId` / `tabId` / `terminalId` / `sessionId` / `hookSessionId` / `resourceId`, `occurredAt`.
- **`packages/host-service/src/events/event-bus.ts`** — `broadcastAgentLifecycle()` public method; fans out to all connected sockets, matching the existing `git:changed` pattern (workspaceId filtering happens client-side).
- **`packages/host-service/src/trpc/router/notifications/`** — `notifications.hook` mutation. **`publicProcedure`**. Input shape mirrors v1's `/hook/complete` query string so the same shell script can speak both. On valid input: call `ctx.eventBus.broadcastAgentLifecycle(...)`.
- **`packages/host-service/src/types.ts`** + **`app.ts`** — `eventBus` added to the tRPC context so the mutation can reach it.
- **`packages/host-service/src/terminal/env.ts`** + **`terminal.ts`** — `buildV2TerminalEnv` now injects `SUPERSET_HOST_AGENT_HOOK_URL` (`http://127.0.0.1:$HOST_SERVICE_PORT/trpc/notifications.hook`) into v2 PTY env. No token — endpoint is unauth (see "Why no auth" below).

### workspace-client (wire format)

- **`packages/workspace-client/src/lib/eventBus.ts`** — extended `EventType` with `"agent:lifecycle"`; added `AgentLifecyclePayload`; handler branch in `handleMessage` that passes the payload through. Multiple listeners against the same host reuse one WebSocket connection (existing pooling).
- **`packages/workspace-client/src/index.ts`** — re-exports `AgentLifecyclePayload`.

### renderer (playback + sidebar)

- **`apps/desktop/src/renderer/hooks/host-service/useWorkspaceEvent/`** — overload for `"agent:lifecycle"` next to the existing `git:changed` / `fs:events` overloads.
- **`apps/desktop/src/renderer/lib/ringtones/urls.ts`** — Vite-bundled URLs for the 11 v1 ringtones via `new URL("../../../resources/sounds/<file>", import.meta.url)`. Emits hashed asset URLs in prod, served from dev server in dev, without copying files into `resources/public/`.
- **`apps/desktop/src/renderer/lib/ringtones/play.ts`** — `playRingtone({ ringtoneId, volume, muted })` (HTMLAudioElement, early-return on mute / 0 volume, silent catch on autoplay-blocked) + `primeRingtoneAudioOnFirstGesture()`. The primer is idempotent (repeated calls don't stack listeners), marks `audioPrimed` only after `silent.play()` resolves, and re-arms **both** pointerdown and keydown on failure — the first iteration dropped keydown on the retry path, which would have broken keyboard-only users.
- **`apps/desktop/src/renderer/stores/v2-pane-status/store.ts`** — `useV2PaneStatusStore` with `Record<paneId, { workspaceId, status }>`. Separate from v1's `useTabsStore` because v2 paneIds aren't registered there. Exposes `setPaneStatus`, `clearPaneStatus`, `clearWorkspaceStatuses`, `clearWorkspaceAttention` (review-only clear, mirrors v1's `resetWorkspaceStatus`). `selectWorkspaceStatus(id)` selector aggregates non-idle statuses by workspaceId via `getHighestPriorityStatus`.
- **`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2AgentHookListener/`**:
  - `useV2AgentHookListener(workspaceId)` — subscribes via `useWorkspaceEvent("agent:lifecycle", ...)`, calls `updatePaneStatus` unconditionally, then `playRingtone` + `Notification` for non-Start events that pass suppression.
  - `updatePaneStatus` — maps Start → `working`, PermissionRequest → `permission`, Stop → `idle` (if the user is viewing this workspace) or `review` otherwise. Uses `firstNonBlank(paneId, terminalId, sessionId, hookSessionId, resourceId)` as the store key.
  - `shouldSuppress` — document hidden / window not focused → don't suppress. Full pane info → use `isPaneVisible`. Missing pane info (the v2 common case) → fall back to `isCurrentWorkspace` as the closest approximation.
  - `isCurrentWorkspace` — matches both `/workspace/<id>` and `/v2-workspace/<id>` hash routes.
  - `showNativeNotification` — `new Notification(title, { body, tag, silent: true })`. The `tag` also uses `firstNonBlank` so v2 events don't collide on `workspaceId:_`.
  - `isPaneVisible.ts` — small local copy of main's `isPaneVisible` to avoid crossing the renderer/main boundary for a pure data helper.
- **`apps/desktop/src/renderer/routes/_authenticated/components/V2AgentHookListeners/`** — `V2AgentHookListeners` queries `collections.v2Workspaces` via `useLiveQuery`, renders one invisible `WorkspaceListener` per workspace. `WorkspaceListener` lives in its own file (one-component-per-file rule). Mounted at `_authenticated/layout.tsx` alongside `AgentHooks` — always active, whether or not the user is on a v2 workspace page, so backgrounded workspaces still flash the sidebar dot.
- **`apps/desktop/src/renderer/routes/_authenticated/layout.tsx`** — renders `<V2AgentHookListeners />`; calls `primeRingtoneAudioOnFirstGesture()` on mount.
- **`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`** — `useClearPaneAttentionOnView(workspaceId)` clears review statuses on mount AND whenever a new review arrives while the page is open (subscribes to `Object.values(s.statuses).some(...)` for presence so the effect re-fires on in-place arrivals).

### dashboard sidebar (status display)

- **`DashboardSidebarWorkspaceItem`** — subscribes via `useV2PaneStatusStore(selectWorkspaceStatus(id))`; threads `workspaceStatus` through both expanded and collapsed variants.
- **`DashboardSidebarExpandedWorkspaceRow`** — new `workspaceStatus?: ActivePaneStatus | null` prop, forwarded into the icon.
- **`DashboardSidebarWorkspaceIcon`** — already had the dot overlay and spinner machinery; it was just receiving `null`. Now gets real status → same visual as v1: amber `AsciiSpinner` when `working`, red pulsing dot on `permission`, static green dot on `review`. Same `StatusIndicator` component as v1 so the visual is pixel-identical.

### agent shell hook

- **`apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh`** — added a v2 branch above the existing v1 fallback. Builds a tRPC single-call JSON body (`{"json": {...}}` with superjson transformer), POSTs to `$SUPERSET_HOST_AGENT_HOOK_URL`, captures HTTP status. Exits only on `2xx`; otherwise falls through to the v1 electron endpoint (covers host-service restarts, crashes, transient 5xxs). Debug mode logs status on both paths.

## Key decisions

- **No auth on `notifications.hook`.** The endpoint only broadcasts chimes — no code execution, no data access, no state change. Reusing the global `HOST_SERVICE_SECRET` as a bearer was both theater (the same secret already sits in a user-readable `~/.superset/host/<org>/manifest.json` alongside its port, so any user-level process can grab it) and a leak vector (PTY env exposure to every agent subprocess). We removed the token from PTY env entirely. If the endpoint ever grows real capabilities, re-introduce auth with a hook-scoped secret — not the global PSK.
- **V2 pane status in a separate store.** V2 panes live in `@superset/panes` (a workspace-scoped layout store with no `status` field). Piggybacking on v1's `useTabsStore` wouldn't work because v2 paneIds aren't registered there. `useV2PaneStatusStore` parallels the layout state and filters by workspaceId for sidebar derivation.
- **`terminalId` as the canonical v2 key.** V2 terminals set `SUPERSET_TERMINAL_ID` but not `SUPERSET_PANE_ID` — panes are a client-only concept in v2. The fallback chain is `paneId → terminalId → sessionId → hookSessionId → resourceId`, treating **empty strings as missing** (agents send `""` not `undefined`, so `??` was wrong — we use a `firstNonBlank` helper).
- **Listener at the layout, not per-page.** Mounted once on `_authenticated/layout.tsx` per v2 workspace via `V2AgentHookListeners`. Matches v1's global `useAgentHookListener`. Alternative (subscribe only for the currently-viewed workspace) was a behavior regression — users expect to hear the chime for workspace A while looking at workspace B.
- **Fallback to v1 on v2 failure.** Initial version `exit 0`-ed unconditionally after the v2 POST. Reviewers flagged that host-service restarts would silently drop notifications. Now captures status and only exits on 2xx — otherwise falls through to v1.

## Review feedback addressed

- **`isCurrentWorkspace` matched `/workspace/` only** → v2 routes are `/v2-workspace/`, so Stop events always hit the `review` branch even when the user was viewing. Fixed to match both.
- **`shouldSuppress` dead for v2** → early-returned `false` when `paneId || tabId` missing, but v2 never populates those. Added workspace-level fallback.
- **Notification `tag` collision** → `paneId ?? sessionId ?? "_"` gave v2 events the same `_` tag, so each new notification replaced the previous. Uses `firstNonBlank` now.
- **`useClearPaneAttentionOnView` only ran on mount** → reviews arriving while the user was already on the page lingered on the sidebar. Now re-runs when a review appears for the viewed workspace.
- **`WorkspaceListener` in the same file as `V2AgentHookListeners`** → split per AGENTS.md one-component rule.
- **Autoplay priming listener stacking + dropped keyboard retry** → guarded with `audioPrimingListenersInstalled` and re-arm both pointer + keyboard on retry.
- **Plan doc drift** → `/hook/complete` → `/trpc/notifications.hook`.
- **`HOST_SERVICE_SECRET` in PTY env** → removed; endpoint is now unauth.

## What we didn't do

- **Postgres-synced prefs.** Renderer still reads `notificationVolume` / `notificationSoundsMuted` / `selectedRingtoneId` via electron-trpc from local-db. Fine for desktop-only usage. Migrating to Postgres `userSettings` is a follow-up; ship when the web client needs pref sync across devices.
- **Custom ringtones.** v1 supports a single user-uploaded `.mp3` on local filesystem. V2 treats the `"custom"` id as fallback-to-default for now. To ship: R2 upload + IndexedDB cache + one-shot local→R2 migration. Gate on telemetry — worth checking if anyone actually used the feature before investing in storage infra.
- **Web client subscription.** `apps/web` doesn't connect to host-service's event bus yet. The rendering path is already web-compatible (no electron IPC in `playRingtone`, `useV2AgentHookListener`, or the pane-status store). Same hooks should drop in once apps/web has a host-service connection.
- **Cross-tab dedup** (for the web client). If the web client is ever opened in two tabs, both chime. Plan called for `BroadcastChannel` leader election; skip until it's a real problem.
- **Missed events while disconnected.** WebSocket is lossy on reconnect. Fire-and-forget is acceptable for chimes. If "I missed 3 completions" matters, persist hook events in host-service and replay with a `since` cursor.
- **Retiring v1 electron-main audio.** `apps/desktop/src/main/lib/notifications/server.ts`, `play-sound.ts`, and `custom-ringtones.ts` stay for v1 terminals. Delete when v1 UI sunsets (see `project_v1_sunset`). The shell script's v1 fallback can go at the same time.
- **Native dock/tray integrations.** Electron-specific dock bounce, tray flash, etc. Out of scope — browser `Notification` works on all platforms inside Electron.

## Risks / open questions

- **Mobile Safari autoplay policy** (when web client ships). Stricter about unprimed audio than desktop Chrome. If the user's first interaction is returning to a backgrounded tab after a hook fires, the sound may be blocked. The `Notification` toast still fires so it degrades gracefully.
- **Multi-device simultaneous play.** Arguably correct (like email notifications on phone + laptop). No dedup.
- **Relay exposure of the unauth endpoint.** If host-service is exposed via relay, anyone who can reach the relay's proxy for this host can POST fake `notifications.hook` events. Concrete impact: nuisance chimes. No state change, no data. We accept this.

## Sequencing (context, not current)

Shipping order in this PR:
1. Pipeline plumbing (map-event-type, event-bus channel, tRPC mutation, terminal-env URL injection, workspace-client, useWorkspaceEvent overload) — `f6aed52f4`
2. Renderer side (playRingtone, useV2AgentHookListener, sidebar wiring, status store) — `7767b729f`
3. Layout-level listener + debug-log cleanup — `6acb4a340`
4. Review fixes — `e6dab1864`
5. Drop auth + remove PSK from PTY — `87d079689`
6. v1 fallback + safer priming — `103c00a17`

Postgres prefs + R2 custom ringtones follow in a separate PR when gated on user need.

## Commit trail

- `f6aed52f4` — initial v2 notification hook pipeline (map-event-type, event-bus, tRPC, terminal-env, workspace-client, ringtones, useV2AgentHookListener, layout priming, plan doc)
- `7767b729f` — v2 sidebar status store + terminalId payload + empty-string coalesce fix
- `6acb4a340` — hoist listener to authenticated layout + drop debug logs
- `e6dab1864` — review fixes (v2 route regex, v2 suppression, notif tag, component split, attention clear, plan doc)
- `87d079689` — drop auth on `notifications.hook`, remove `HOST_SERVICE_SECRET` from PTY env
- `103c00a17` — v1 fallback on v2 non-2xx + idempotent autoplay priming
- `828ca8c21` — this doc
