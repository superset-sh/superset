# V2 Notification Hooks: Client-Side Playback

Goal: play the agent finish sound on the client (web renderer / electron renderer) instead of the electron main process, so notifications work when the host-service is off-machine. Keep v1 feature parity: 11 bundled ringtones + single custom slot per user, volume/mute settings, pane-visibility suppression.

## Principles

- **One code path** for web and electron renderer. Audio plays via `HTMLAudioElement` in the renderer; electron main no longer plays sound.
- **Host-service is the hook ingress.** The agent's `/hook/complete` endpoint moves off electron onto the host-service. Works whether host-service is on the user's machine or remote.
- **Same UX as v1.** Single ringtone per user, applied to all hook events. No event-specific sounds, no randomized variants, no multi-slot custom library — those are out of scope.
- **Feature-parity before parity-plus.** Ship built-ins first, port custom ringtone second, add nothing else.

## Non-goals

- Event-specific sounds (save / format / chat-received). Not v1 behavior.
- Randomized sound variants (`responseReceived1..4.mp3` style).
- Multi-slot custom ringtone library. Keep v1's single-slot model.
- Per-workspace ringtone override.
- Native OS integrations beyond `Notification` + `HTMLAudioElement` (no dock bounce, no tray flash). Add later if asked.

## Architecture

```
agent  ──POST /hook/complete──▶  host-service
                                      │
                                      ├── persist event (optional, for reconnect replay)
                                      └── broadcast via existing WebSocket EventBus
                                             │
                                             ▼
                                   web client / electron renderer
                                             │
                                             ├── decide (focus + visibility + settings)
                                             ├── dedup across tabs (event-id)
                                             └── play ringtone + show Notification
```

Key move: the electron localhost hook server (`apps/desktop/src/main/lib/notifications/server.ts`) is retired for v2. Electron main does no sound work.

## Phase 1: Host-service hook ingress

Status: next

- Add `POST /hook/complete` to host-service. Port the event-shape validation and normalization from `apps/desktop/src/main/lib/notifications/map-event-type.ts` (Start / Stop / PermissionRequest) into a shared module — plan to import from `packages/shared` or duplicate per v1-v2 duplication memory.
- Add `agent:lifecycle` channel to the existing WebSocket event bus (`packages/host-service/src/events/event-bus.ts`, alongside `git:changed` / `fs:events`). Payload: `{ eventId, workspaceId, paneId, tabId, sessionId, type, occurredAt }`.
- Broadcast is scoped by `workspaceId` → only subscribers authorized for that workspace receive the event.
- Auth: require the workspace token the agent already uses. The endpoint is reachable over the network, so unlike v1's `127.0.0.1`-bound server it must authenticate.
- Hook protocol version header preserved (v1 uses version 2).

Exit criteria:
- Agent posting to host-service `/hook/complete` produces a WebSocket broadcast on `agent:lifecycle`.
- Auth rejects unknown tokens; `curl` from another workspace cannot spoof.
- Unit tests cover the map-event-type logic (port from `server.test.ts`).

## Phase 2: Web client playback

Status: next

- Bundle the 11 v1 ringtones as static assets under `apps/web/public/ringtones/`. Copy the files from `apps/desktop/src/resources/sounds/`. `shared/ringtones.ts` (the registry in `apps/desktop/src/shared/ringtones.ts`) moves to `packages/shared/src/ringtones/` so both desktop and web import the same metadata.
- `apps/web/src/lib/ringtones/play.ts`:
  - `primeAudioOnFirstGesture()` — attach a one-shot `pointerdown` listener that plays a silent `HTMLAudioElement` to unlock autoplay. Call once at app mount.
  - `playRingtone({ ringtoneId, volume, muted })` — if muted or volume 0, no-op. Otherwise `new Audio("/ringtones/<filename>")`, set `volume`, `play()`. Fall back silently if `play()` rejects (autoplay blocked before gesture).
- `apps/web/src/hooks/useAgentHookListener.ts`:
  - Subscribe to `agent:lifecycle` via existing WebSocket client.
  - Suppression rule (v1 parity, see `apps/desktop/src/main/lib/notifications/notification-manager.ts:115`): if the event's pane is visible *and* the window is focused, do not play.
  - Tab dedup: track a small LRU `Set<eventId>` in `sessionStorage` keyed by time bucket so only one tab plays per event. Upgrade to `BroadcastChannel` leader election if the LRU proves janky.
  - On play: call `playRingtone(...)` + `new Notification(...)` in parallel.
- Settings UI: list 11 built-ins, preview-play button per row, volume slider, mute toggle. Reuse the v1 renderer's ringtone picker component if it's portable; otherwise build the web version against the same `ringtones` registry.

Exit criteria:
- Posting a hook event to host-service plays the selected built-in ringtone in an open web tab.
- Muted / volume 0 produces no sound.
- Visible + focused pane suppresses sound (matches v1).
- Two tabs open → sound plays once.

## Phase 3: Prefs in Postgres

Status: next

- Add columns to the relevant `userSettings` table in `packages/db/src/schema/`:
  - `selected_ringtone_id text` (nullable → means default `arcade`)
  - `notification_volume real` default 0.5
  - `notification_sounds_muted boolean` default false
- tRPC router `notifications.settings.{get,update}` in `packages/trpc`, consumed by web and electron renderer.
- Electron v2 renderer: read from the same tRPC path instead of local-db. V1 local-db read stays for v1 UI only (per `project_v1_sunset` memory; v1 dies, don't evolve).

Exit criteria:
- A user's ringtone choice syncs across devices.
- Migration generated via drizzle-kit (follow DB migration rules in AGENTS.md — spin up Neon branch, don't hand-edit migrations).

## Phase 4: Custom ringtone (single slot)

Status: later

- Schema: reuse `userSettings.selected_ringtone_id` — value `"custom"` means "use the user's custom upload." A parallel column `custom_ringtone_r2_key text` (nullable) stores the upload location.
- Host-service endpoint `POST /ringtones/custom` — accept a single file (multipart), validate size + extension (v1 rules: ≤20MB, `.mp3`/`.wav`/`.ogg`), stream to R2 at `ringtones/custom/<userId>`, upsert `custom_ringtone_r2_key` + display name.
- Host-service endpoint `GET /ringtones/custom/url` — returns a short-lived signed URL.
- Client: `getRingtoneBlob(id)` reads blob from IndexedDB; on miss, fetches signed URL → caches → returns. `playRingtone` uses the blob via `URL.createObjectURL`.
- Settings UI: "Upload custom sound" button + preview + remove. Replaces existing custom on upload (v1 semantics — single slot).

Exit criteria:
- User uploads a `.mp3` in web, selects it, triggers a hook event → correct sound plays.
- Uploading replaces the previous custom ringtone.
- Custom ringtone selection persists and syncs across devices.

## Phase 5: v1 → v2 custom ringtone migration

Status: later

- One-shot on first v2 boot of desktop: if `~/.superset/assets/ringtones/notification-custom.{ext}` exists, POST it to host-service `/ringtones/custom`, then delete the local file.
- Read display name from sibling `notification-custom.json`.
- Migration flag in local-db so this runs exactly once per device.

Exit criteria:
- Existing users with a v1 custom ringtone find it preserved in v2 without any manual action.

## Phase 6: Retire electron main playback

Status: later (after web + desktop v2 stable)

- Remove `apps/desktop/src/main/lib/notifications/server.ts` (localhost hook server).
- Remove `apps/desktop/src/main/lib/play-sound.ts` (`afplay`/`paplay` shell-outs).
- Remove `apps/desktop/src/main/lib/custom-ringtones.ts` (local FS).
- Keep v1 UI paths that still use these working until the v1 sunset (per `project_v1_sunset`). If v1 is already off by this point, delete outright.

Exit criteria:
- No electron main code plays audio.
- Electron renderer and web renderer share one sound path.

## Risks and open questions

- **Missed events while disconnected.** WebSocket is lossy on reconnect. If "I missed 3 completions" matters, persist hook events in host-service and replay with a `since` cursor. If not, fire-and-forget is fine — propose fire-and-forget, revisit if complaints.
- **Autoplay policy.** Mobile Safari is stricter about unprimed audio than desktop Chrome. If the user's first interaction is returning to a backgrounded tab after a hook fires, the sound may be blocked. The `Notification` toast still fires, which degrades gracefully.
- **Off-machine host-service + desktop.** The electron renderer talks to a remote host-service exactly like a browser does — no new IPC needed. But the hook endpoint is now over the network, so the hook token must not leak (scope it per-workspace, short-lived).
- **Multi-device simultaneous play.** If a user has web + desktop open on the same workspace, both play. Cross-device dedup is out of scope — a notification on two devices is arguably correct behavior, same as email.

## Sequencing

Phases 1 + 2 + 3 are the minimum to declare "client-side playback working with v1 parity minus custom ringtone." Ship those together. Phase 4 + 5 come after, gated on whether anyone actually used the v1 custom-upload feature (worth checking telemetry before investing in R2).
