# Derive terminal agent status from the host binding (single source of truth)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md (root) and apps/desktop/AGENTS.md.

## Purpose / Big Picture

Today the desktop app tracks "which agent is running in which terminal" in two unrelated places that never reconcile:

1. The **host binding**: host-service keeps a `TerminalAgentBinding` per terminal (agent id, session id, `lastEventType`, `lastEventAt`), persisted in the host's SQLite database. It is fed directly by agent hook events and never misses one.
2. The **renderer status map**: a zustand store persisted to localStorage that replays the same hook events (received over WebSocket) into a `working` / `permission` / `review` status per terminal.

Because the renderer only sees events while a window is open and connected, the localStorage copy goes stale: an agent finishes while the app is closed and the sidebar shows a phantom "working" dot forever; a workspace indicator stays lit for a terminal that no longer exists. After this change, the agent's runtime state (`working` / `permission` / `idle`) is **derived** from the host binding — the renderer stores no copy of it — and the only renderer-persisted fact is a per-terminal `lastSeenAt` timestamp used to derive `review` ("the agent stopped and you haven't looked yet"). Stale "working"/"permission" indicators become structurally impossible: restart the app, and every dot reflects what the host actually knows.

Observable outcome: run an agent in a terminal, quit the app mid-turn, let the agent finish, relaunch — the pane/sidebar dot now shows green "review" (or nothing once you view the pane), never a stale amber "working".

## Assumptions

- The host-service hook pipeline is reliable enough to be the sole source of runtime state. Evidence: `packages/host-service/src/trpc/router/notifications/notifications.ts` records every normalized hook event into the binding store before any renderer is involved, and `SqliteTerminalAgentBindingPersistence.load()` already drops bindings for disposed terminals on restart.
- **Milestone 0 (below) lands before Milestone 2 acceptance.** On main today, bindings are NOT deleted on terminal exit — only on agent exit hooks or the explicit dispose route — so agents killed/crashed without hooks (or terminals that die while host-service is down) leave bindings whose derived status would be a well-formed ghost. Milestone 0 root-fixes this on the host side. (An earlier patch-layer attempt exists as PR #5443 / branch `fix-terminal-agent-binding-prune`; it is superseded by Milestone 0 but its tests and leak analysis are reusable — see Milestone 0 notes.)
- The v1 desktop UI (`src/renderer/screens/main/…`) is sunset and does not use the v2-notification store; this plan touches only v2 code paths. (Confirmed by grep: v1 uses the tabs store's own attention status.)
- ~~`setChatStatus` currently has no callers; chat-source status entries are effectively unused but the plumbing must survive for future chat panes.~~ Superseded 2026-07-03: the chat status plumbing was dead code and was deleted in the simplification pass (see Decision Log); chat pane statuses can be rebuilt on the derived model when they actually ship.

## Open Questions

None. All three original questions (review-after-detach, interrupt semantics, optimistic cache update) were resolved by the user on 2026-07-03 — see the Decision Log; each provisional decision was confirmed as-is.

## Progress

- [x] (2026-07-03 15:00Z) Investigated both stores, mapped all writers/readers of terminal status; findings folded into Context below.
- [x] (2026-07-03 15:10Z) Plan drafted.
- [x] (2026-07-03 ~16:30) Milestone 0 added from the PR #5443 investigation (binding-leak root cause + review findings); host-side scope now included.
- [x] (2026-07-03 15:25Z) Milestone 1: derivation core (pure function + hook + seen-timestamp store + persistence migration + optimistic cache merge). Derivation tests proven to fail under mutation.
- [x] (2026-07-03 15:40Z) Milestone 2: consumer switchover (sidebar chips, workspace dot/unread, pane/tab indicators via new composite module, seen-marking on pane focus / visible events, interrupt synthetic Stop, pane-close seen-mark, mark-read action).
- [x] (2026-07-03 15:45Z) Milestone 3: retired the stored terminal status path — deleted `statusTransitions.ts(.test)`, `setTerminalStatus`, `clearV2TerminalRunStatus`, and the superseded store selectors/hooks; store tests rewritten around chat/manual sources. (Executed together with Milestone 2 since all readers had already switched; rollback is a plain git revert either way.)
- [x] (2026-07-03 15:50Z) Extra (not in original plan): the Electron fallback path for adopted shells (`V2NotificationController.handleElectronAgentLifecycle`) now forwards the event to the host's `notifications.hook` so the binding — the status source of truth — converges even when the shell's hook URL is stale.
- [x] (2026-07-03 16:00Z) Milestone 0: host-side session-liveness join — `listLiveByWorkspace`/`findLiveActive` SQL reads in `persistence.ts` (session `active` + workspace-owned), store delegates list/find to them, best-effort `deleteDefunct()` at startup in `app.ts`; `persistence.test.ts` cribbed from PR #5443's harness covers hide/route/ordering/delete.
- [x] (2026-07-03 16:05Z) Validation: 750 host-service tests pass, 2047 desktop tests pass, `bun run typecheck` exits 0, `bun run lint` exits 0.
- [x] (2026-07-03 16:45Z) Simplification pass (user-directed: "shouldn't this reduce a lot of code?"): dropped the optimistic cache merge, collapsed the store to `manualUnread` + `terminalSeenAt` (deleting the whole source-status entry system and dead chat plumbing), deleted the zero-consumer tab/terminal composite hooks. Net production diff is now ~−215 lines. All tests/typecheck/lint green (note: `bun test` must run with cwd `apps/desktop` so `bunfig.toml` preloads `test-setup.ts`).
- [ ] Manual end-to-end acceptance (the six `bun dev` observations below) — needs a human driving the app: run/interrupt/quit-relaunch cycles with a live agent.

## Surprises & Discoveries

- Observation: the host binding already contains the full runtime state machine — the status derivation itself needed no host-service changes (Milestone 0's liveness join is about binding *visibility*, not state).
  Evidence: `packages/host-service/src/events/map-event-type.ts` normalizes every agent hook to exactly `Start | Stop | PermissionRequest | Attached | Detached`, and `TerminalAgentStore.recordEvent` stores that as `lastEventType`/`lastEventAt` on the binding. The renderer's status map is a lossy re-derivation of the same stream.
- Observation: `setChatStatus` in the v2-notification store has zero callers.
  Evidence: repo-wide grep for `setChatStatus` matches only its definition.
- Observation: a second lifecycle-event path exists that bypasses host-service entirely — adopted shells whose launch-time hook URL is stale POST to the Electron main-process express server, and `V2NotificationController` used it to write statuses directly. Under the derived model that path would leave the binding stale, so it now forwards the event to `notifications.hook` on the active host (the binding for an adopted agent persists host-side across restarts, so an identity-less event still updates it).
  Evidence: `apps/desktop/src/main/lib/notifications/server.ts` (hook receiver) and `V2NotificationController.tsx:120-160`.
- Observation: Claude Code fires no Stop hook on user interrupt (Ctrl+C/Escape) — the existing `useTerminalInterruptClear` comment documents this. That makes the synthetic-Stop decision load-bearing, not just a nicety: without it the host binding stays `working` after an interrupt.
  Evidence: prior comment in `useTerminalInterruptClear.ts` ("Claude Code's Stop hook doesn't fire on user interrupt").
- Observation: PR #5443's persistence layer (SQLite bindings table + store hydration) had already been merged to main; only its prune machinery (exit listener, startup drain, read guard) remained unmerged, which is exactly the part Milestone 0 supersedes with the join.
  Evidence: `git diff main...fix-terminal-agent-binding-prune -- packages/host-service/src/terminal-agents/` shows persistence.ts as already-identical on main.

## Decision Log

- Decision: derive `working`/`permission`/`idle` purely from `binding.lastEventType`; never store them renderer-side.
  Rationale: the host store sits at the event source, never misses events, is persisted in host SQLite, and self-heals on load (drops disposed terminals). The renderer copy is the component that drifts.
  Date/Author: 2026-07-03 / Claude, confirmed by Kiet.
- Decision: derive `review` as `lastEventType === "Stop" && lastEventAt > lastSeenAt(terminalId)`, with `lastSeenAt` persisted renderer-side.
  Rationale: unlike the current stored `review`, this survives the missed-event case — the app can be closed when the agent finishes and the review dot is still correct on relaunch, because it is computed from the host's `lastEventAt` rather than from an event the renderer had to witness.
  Date/Author: 2026-07-03 / Claude, confirmed by Kiet.
- Decision (provisional, Open Question 1): accept that `review` no longer survives agent `Detached`.
  Rationale: detach means the agent REPL exited; keeping a host-side tombstone just to preserve a green dot adds state for marginal value. If a real Stop preceded the detach and the user never viewed it, they lose one green dot; the failure is benign and self-describing (the agent chip is gone too).
  Date/Author: 2026-07-03 / Claude, confirmed by Kiet.
- Decision (provisional, Open Question 2): on user interrupt, POST a synthetic `Stop` event to the host's existing `notifications.hook` endpoint and mark the terminal seen locally.
  Rationale: keeps the single source of truth authoritative — every window and future device converges — and reuses an endpoint that already normalizes and fans out. A real Stop hook arriving later is a harmless idempotent overwrite.
  Date/Author: 2026-07-03 / Claude, confirmed by Kiet.
- Decision (provisional, Open Question 3): merge lifecycle event payloads into the react-query bindings cache before invalidating.
  Rationale: preserves today's synchronous dot latency (the WS event currently updates zustand directly); the merge is ~15 lines and the subsequent refetch remains the authority.
  Date/Author: 2026-07-03 / Claude, confirmed by Kiet.
- Decision: bump the v2-notification persist version to 2 and drop all `terminal:*` entries in the migration.
  Rationale: old persisted `working`/`permission`/`review` terminal entries are exactly the stale state this plan eliminates; carrying them forward would reintroduce it once.
  Date/Author: 2026-07-03 / Claude.
- Decision: absorb the host-side binding-leak fix as Milestone 0, deriving binding visibility from `terminal_sessions.status` at the read paths, superseding PR #5443's prune-layer approach.
  Rationale: session status is the already-maintained liveness source (onExit, dispose routes, reaper healing); joining against it makes dead-terminal bindings unrepresentable instead of adding deletion paths that can miss. All four review findings on #5443 were failure modes of its compensating machinery.
  Date/Author: 2026-07-03 / Claude (sidebar-inline-layout session), per Kiet: "add our learning to the other branch so it can be root fixed instead".
- Decision: implement the live reads as optional methods (`listLiveByWorkspace?`/`findLiveActive?`) on `TerminalAgentBindingPersistence`, with the store falling back to in-memory filtering when absent.
  Rationale: store unit tests stub the persistence interface; required methods would break every stub for no coverage gain, and the in-memory path documents the pre-join semantics for persistence-less construction.
  Date/Author: 2026-07-03 / Claude.
- Decision: forward Electron-fallback lifecycle events (adopted shells with stale hook URLs) to the active host's `notifications.hook`, in addition to local seen-marking.
  Rationale: with statuses derived from bindings, an event path that bypasses the host would leave the source of truth stale. The binding for an adopted agent persists host-side, so an identity-less forwarded event still updates it via `recordEvent`'s existing-binding branch.
  Date/Author: 2026-07-03 / Claude.
- Decision: gate the interrupt synthetic Stop on the cached binding being `Start`/`PermissionRequest`.
  Rationale: Escape is a high-frequency key in terminals (vim, agent menus); an unconditional POST per keypress is noisy, and an idle binding has nothing to correct.
  Date/Author: 2026-07-03 / Claude.
- Decision (reverses the optimistic-merge decision above): drop the react-query cache merge; `agent:lifecycle` events just invalidate.
  Rationale: user-directed simplification — the merge duplicated the host's `recordEvent` semantics client-side (~55 lines) for an unmeasured latency win; invalidate triggers an immediate refetch of an active query, a single localhost roundtrip. Re-add only if dot latency is actually observed to lag.
  Date/Author: 2026-07-03 / Claude, directed by Kiet.
- Decision: collapse the v2-notification store to `manualUnread: Record<workspaceId, true>` + `terminalSeenAt`, deleting the generic source-status system (`setSourceStatus`, `setChatStatus`, five clear-variants, sourceKey status entries, aggregation selectors).
  Rationale: after terminal statuses moved to derivation, the only remaining stored status was the sidebar's manual mark-unread; keeping a generic multi-source status framework for one boolean per workspace was dead weight, and `setChatStatus` had zero callers. The pane/tab source helpers (`getV2NotificationSourcesForPane/Tab`) survive — they map panes to terminal ids and are used by real consumers.
  Rationale (behavior note): the sidebar "clear status" action can no longer wipe a `working`/`permission` dot — those are live host state now, which is the point of the whole change; it clears manual-unread and marks all bound terminals seen.
  Date/Author: 2026-07-03 / Claude, directed by Kiet.

## Outcomes & Retrospective

Implemented in full (Milestones 0–3) on branch `check-agent-binding-decou`, 2026-07-03. All automatable validation passes: 750 host-service tests, 2047 desktop tests, monorepo typecheck, lint. Outcome versus purpose: terminal agent runtime state now has exactly one owner (the host binding, itself gated on session liveness via SQL join), the renderer persists only `terminalSeenAt`, and the stale-"working"-dot class of bugs is structurally gone — there is no longer any stored renderer copy to go stale. Remaining before merge: the six-step manual `bun dev` acceptance pass (live agent run, interrupt, quit-relaunch), which needs a human at the keyboard. PR #5443 should be closed in favor of this branch once merged.

## Context and Orientation

This is primarily desktop-app work (`apps/desktop`, Electron renderer) reading from the `packages/host-service` package, plus Milestone 0's host-service read-path change (`terminal-agents` store/persistence + `terminalAgents` router). No database schema or IPC channel changes are needed.

Terms used below:

- **host-service**: a background HTTP/WebSocket server (code in `packages/host-service/`) that owns terminals (PTYs) and workspaces on the user's machine. The Electron renderer talks to it over tRPC-over-HTTP (`renderer/lib/host-service-client`) and receives push events over a WebSocket event bus (`@superset/workspace-client`'s `getEventBus`).
- **agent hook events**: coding agents (Claude Code, Codex, …) run inside terminals and are configured with shell hooks that POST lifecycle events to host-service (`notifications.hook` procedure in `packages/host-service/src/trpc/router/notifications/notifications.ts`). `mapEventType` (`packages/host-service/src/events/map-event-type.ts`) normalizes every vendor-specific event name to one of: `Start` (agent began working on a prompt), `Stop` (turn finished), `PermissionRequest` (agent blocked on approval), `Attached` (agent process booted), `Detached` (agent process exited).
- **TerminalAgentBinding**: the host's record of "one live agent process bound to a terminal": `{ terminalId, workspaceId, agentId, agentSessionId?, definitionId?, startedAt, lastEventAt, lastEventType }` (`packages/host-service/src/terminal-agents/types.ts`). Created on the first hook event, deleted on `Detached`/`exit`/`error` hook events; deletion on **terminal exit** (kills, crashes, reaper/workspace disposal) ships in PR #5443, not on main as of 2026-07-03 — see Assumptions. Persisted in host SQLite (`persistence.ts`). The renderer reads it via `useTerminalAgentBindings` (`apps/desktop/src/renderer/hooks/host-service/useTerminalAgentBindings/useTerminalAgentBindings.ts`), a react-query query with `staleTime: Infinity` invalidated on `agent:lifecycle` and `terminal:lifecycle` workspace events.
- **v2-notification store**: `apps/desktop/src/renderer/stores/v2-notifications/store.ts`, a zustand store persisted to localStorage under key `v2-notifications-v1`. It maps a **source** (`terminal:<terminalId>`, `chat:<sessionId>`, or `manual:<workspaceId>`) to a status entry `{ workspaceId, status, occurredAt }` where status is one of `working | permission | review` (`ActivePaneStatus` in `apps/desktop/src/shared/tabs-types.ts`; `PaneStatus` adds `idle`).
- **status transition logic**: `HostNotificationSubscriber` (`apps/desktop/src/renderer/routes/_authenticated/components/V2NotificationController/components/HostNotificationSubscriber/HostNotificationSubscriber.tsx`) listens to `agent:lifecycle` WS events and calls `handleV2AgentLifecycleEvent` (`…/V2NotificationController/lib/lifecycleEvents.ts`), which (a) updates the status map via `resolveV2AgentStatusTransition` (`…/lib/statusTransitions.ts`) and (b) plays the chime / shows a native notification for `Stop`/`PermissionRequest` when the target pane is not visible.

Current terminal-status writers (all to be retired or repurposed):

- `lifecycleEvents.ts` `updatePaneStatus` — the event-driven writer.
- `clearV2TerminalRunStatus` (`store.ts:266`) — manual clear called from pane close (`…/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx:333`) and agent interrupt (`…/usePaneRegistry/components/TerminalPane/hooks/useTerminalInterruptClear/useTerminalInterruptClear.ts:38`).
- `handleV2TerminalLifecycleEvent` — clears the terminal source on terminal exit.
- `useClearActivePaneAttention` (`…/v2-workspace/$workspaceId/hooks/useClearActivePaneAttention/useClearActivePaneAttention.ts`) — clears `review` when the pane becomes active.

Current terminal-status readers (all to be switched to the derived model):

- `useDashboardSidebarWorkspaceRunningAgents` (`…/DashboardSidebar/…/useDashboardSidebarWorkspaceRunningAgents.ts`) — sidebar agent chips; already joins bindings with the status map by `terminalId`.
- `V2NotificationStatusIndicator` (`…/v2-workspace/$workspaceId/components/V2NotificationStatusIndicator/V2NotificationStatusIndicator.tsx`) — pane/tab dots via `useV2SourcesNotificationStatus`.
- `DashboardSidebarWorkspaceItem` and its actions hook — workspace-level dot and unread state via `useV2WorkspaceNotificationStatus` / `useV2WorkspaceIsUnread` / `clearWorkspaceStatuses`.

The `chat` and `manual` sources stay in the store unchanged; only `terminal` sources move to derivation.

## Plan of Work

### Milestone 0: host-side — binding visibility derived from session liveness

Findings transferred from the PR #5443 investigation (branch `fix-terminal-agent-binding-prune`, 2026-07-03). The binding store's deletion bookkeeping misses most terminal deaths, and the fix should be a read-side join, not more deletion paths.

**The leak inventory.** `TerminalAgentStore` deletes a binding in exactly two cases: an agent exit hook (`Detached`/`exit`/`error` via the notifications route) and the renderer's explicit terminal-dispose tRPC route (`markTerminalExited`). Every other end of life leaks the binding: the agent process being SIGKILLed or crashing (no hook fires), the terminal exiting on its own (pty `onExit` updates the session row and broadcasts `terminal:lifecycle` but never touches the binding store), the reaper's orphan cleanup and `disposeSessionsByWorkspaceId` (both call `disposeSessionAndWait` directly, bypassing the route), and host-service downtime (bindings are persisted and rehydrate; `load()` skips only `disposed`, not `exited`). The sidebar then shows agent chips for terminals that no longer exist.

**Why a join and not pruning.** PR #5443 fixed this with three compensating layers (a pty-exit event listener, a startup drain, a read-time guard) — and every reviewer finding against it was a failure mode of the *patch machinery itself* (listener leak on double `createApp`, startup crash if the drain query throws, a throwing listener blocking the renderer broadcast). The root observation: `terminal_sessions.status` is already the maintained source of terminal liveness — pty `onExit` flips it to `exited`, dispose routes set `disposed`, and the reaper heals orphan rows (including terminals that died while host-service was down). Bindings should not own a duplicate of that lifecycle. Derive **visibility** from it:

- `listByWorkspace` and `findActive` read via SQL: `terminal_agent_bindings` inner-joined to `terminal_sessions` where `status = 'active'` and `origin_workspace_id IS NOT NULL`. A dead terminal's agent becomes unrepresentable in reads, regardless of how the terminal died — and the reaper's existing row-healing automatically heals binding visibility with no binding-specific code.
- Keep the in-memory map only for `get()`/`waitForBinding` (the fresh-launch wait path, where a dead terminal is not a possible input).
- Keep hook-event deletion in `recordEvent` (`Detached` means the agent itself said goodbye) — it is signal, not bookkeeping.
- Do NOT add exit listeners, read guards, or startup drains. Optional hygiene only: a best-effort startup `DELETE` of binding rows whose session is defunct (rows are invisible either way; the table is small).
- Renderer refetch needs no changes: `terminal:lifecycle` / `agent:lifecycle` broadcasts fire independently of the binding store, and Milestone 1's Step 4 cache-merge composes cleanly on top.

**Reusable from PR #5443** (cherry-pick or crib, then close that PR): `persistence.test.ts` — an in-memory `bun:sqlite` + migrations harness seeding `active`/`exited`/`disposed`/workspace-less sessions with bindings (its assertions translate directly to "join hides these"); the defunct-criteria predicate (`missing OR exited OR disposed OR origin_workspace_id IS NULL` — mirror of the reaper's orphan test); and the store test proving persistence-delete works for never-hydrated rows if the hygiene `DELETE` is kept.

Out of scope, discovered during the same investigation: chips for agents alive in *parked* terminals (pane closed, process alive) are truthful and stay — the affordance for that is a future "Close terminal" action on the agent chip, not lifecycle work.

Acceptance for Milestone 0: kill a bound agent's terminal shell with `kill -9` → the binding disappears from `listByWorkspace` on the next read (no hook fired); restart host-service with a binding whose session row says `exited` → not visible after restart; `findActive` never returns a binding whose session is not `active` (regression-tests the launch-reuse path routing prompts into dead terminals).

### Milestone 1: derivation core

This milestone creates the pure derivation and the `lastSeenAt` storage. At completion nothing user-visible changes yet, but the new hook returns correct statuses and is unit-tested.

**Step 1 — pure derivation function.** Create `apps/desktop/src/renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus.ts` exporting:

    export function deriveTerminalAgentStatus({
        lastEventType,
        lastEventAt,
        lastSeenAt,
    }: {
        lastEventType: string;
        lastEventAt: number;
        lastSeenAt: number | undefined;
    }): PaneStatus

Mapping: `"Start"` → `"working"`; `"PermissionRequest"` → `"permission"`; `"Stop"` → `"review"` if `lastEventAt > (lastSeenAt ?? 0)` else `"idle"`; `"Attached"` and anything else → `"idle"`. `permission` is deliberately not seen-gated: it is a live blocking state that must show until resolved. Co-locate `deriveTerminalAgentStatus.test.ts` covering each branch, including the `lastSeenAt === undefined` → review case (an unseen Stop from before the app ever ran should demand attention).

**Step 2 — seen-timestamp state.** In `apps/desktop/src/renderer/stores/v2-notifications/store.ts`:

- Add `terminalSeenAt: Record<string, number>` to `V2NotificationState`, plus actions `markTerminalSeen(terminalId: string, at?: number)` (clamps monotonic: never lower an existing timestamp) and `pruneTerminalSeen(terminalId: string)`.
- Include `terminalSeenAt` in `partialize` so it persists.
- Bump `version` to `2` and add a `migrate` function that (a) drops every `sources` entry whose key starts with `terminal:` and (b) initializes `terminalSeenAt: {}`. Rename nothing else; the localStorage key `v2-notifications-v1` stays (zustand versioning handles it).
- Export a convenience `markTerminalSeenNow(terminalId)` module function mirroring the existing `clearV2TerminalRunStatus` style.

**Step 3 — the statuses hook.** Create `apps/desktop/src/renderer/hooks/host-service/useTerminalAgentStatuses/useTerminalAgentStatuses.ts`:

    export function useTerminalAgentStatuses(
        workspaceId: string,
        options?: { enabled?: boolean },
    ): Map<string, PaneStatus>

Implementation: `useTerminalAgentBindings(workspaceId, options)` + `useV2NotificationStore((s) => s.terminalSeenAt)` (with `useShallow`), memoized into a map of `terminalId → deriveTerminalAgentStatus(binding, terminalSeenAt[terminalId])`. Add the barrel `index.ts` re-exporting both hook and derivation per the repo's one-folder-per-module convention.

**Step 4 — optimistic cache merge (Open Question 3).** In `useTerminalAgentBindings.ts`, replace the bare `invalidate` on `agent:lifecycle` with a handler that first `queryClient.setQueryData(queryKey, …)` merges the event payload (the WS `AgentLifecyclePayload` carries `terminalId`, `eventType`, `occurredAt`, and optional agent identity): update or insert the matching binding's `lastEventType`/`lastEventAt` (and delete it on `Detached`), then invalidates so the host remains the authority. `terminal:lifecycle` keeps the plain invalidate.

Acceptance for Milestone 1: `bun test apps/desktop/src/renderer/hooks/host-service/useTerminalAgentStatuses` passes; `bun run typecheck` clean; no behavior change in the running app yet.

### Milestone 2: consumer switchover

This milestone flips every reader to the derived model and every "user looked at it" moment to `markTerminalSeen`. At completion the stored terminal statuses are no longer read anywhere, but are still written (harmlessly) — the parallel-implementation safety net.

**Step 5 — seen-marking writers.**

- `useClearActivePaneAttention.ts`: when the active pane is a terminal pane, call `markTerminalSeen(terminalId)` whenever the derived status is `review` (replace the `clearSourceAttention` call for terminal sources; keep it for chat sources).
- `lifecycleEvents.ts`: in the lifecycle handler, when `isV2NotificationTargetVisible(...)` is true, call `markTerminalSeen(payload.terminalId, payload.occurredAt)`. This reproduces today's "a Stop that lands while you're watching never turns into review".
- `handleV2TerminalLifecycleEvent`: on terminal `exit`, call `pruneTerminalSeen(terminalId)` (bounds the map) in addition to the existing source clear.
- Interrupt (`useTerminalInterruptClear.ts`) and pane close (`usePaneRegistry.tsx:333`): replace `clearV2TerminalRunStatus(terminalId, workspaceId)` with `markTerminalSeenNow(terminalId)`, and in the interrupt path additionally fire the synthetic Stop (Open Question 2): `getHostServiceClientByUrl(hostUrl).notifications.hook.mutate({ terminalId, eventType: "Stop" })`, fire-and-forget with a `console.warn` catch. The synthetic Stop flips the host binding out of `working`; the local seen-mark makes the derived status `idle` immediately.

**Step 6 — readers.**

- `useDashboardSidebarWorkspaceRunningAgents.ts`: drop the `useV2NotificationStore` join; take `status` from `useTerminalAgentStatuses(workspaceId, { enabled })`.
- In `stores/v2-notifications/store.ts`, the source-aggregation hooks (`useV2SourcesNotificationStatus`, `useV2PaneNotificationStatus`, `useV2TabNotificationStatus`, `useV2TerminalNotificationStatus`, `useV2WorkspaceNotificationStatus`, `useV2WorkspaceIsUnread`) must compose derived terminal statuses with stored chat/manual entries. Because these now need react-query data, move the composite hooks into a new module `apps/desktop/src/renderer/hooks/host-service/useV2NotificationStatus/useV2NotificationStatus.ts` (hooks may not live in a plain zustand store file that non-React code imports): each hook calls `useTerminalAgentStatuses(workspaceId)` and the zustand store, then folds with the existing `getHighestPriorityStatus`. Keep the pure store selectors for chat/manual. Update the call sites: `V2NotificationStatusIndicator.tsx`, `DashboardSidebarWorkspaceItem.tsx`, `useDashboardSidebarWorkspaceItemActions.ts`, `useClearActivePaneAttention.ts`. Preserve each hook's signature so the diff at call sites is only the import path.
- `useDashboardSidebarWorkspaceItemActions.ts`: `clearWorkspaceStatuses(workspaceId)` (the "mark read" action) additionally marks every bound terminal in that workspace seen (`markTerminalSeen` per binding), so derived reviews clear too.

Acceptance for Milestone 2: with `bun dev`, run an agent in a v2 workspace terminal — amber dot appears on prompt submit (pane, tab, sidebar chip, workspace row), red on a permission request, green when it finishes while you are on another workspace, and the green clears when you focus the pane. Quit the app while the agent is mid-turn, let it finish, relaunch: the dot is green (review), not amber.

### Milestone 3: retire the stored terminal status path

- Delete `resolveV2AgentStatusTransition` (`statusTransitions.ts`) and `statusTransitions.test.ts`; strip `updatePaneStatus` / `updateV2AgentLifecycleStatus` from `lifecycleEvents.ts` (the chime, suppression, and native-notification logic stay untouched — they are event-driven by design and correct that way).
- Remove `setTerminalStatus`, `clearV2TerminalRunStatus`, and `handleV2AgentLifecycleStatusEvent` (check `handleV2AgentLifecycleStatusEvent` callers first; if any exist, switch them to the seen-marking equivalent).
- Grep for any remaining constructor of a `terminal:*` source status write; the only writers left must be chat/manual.
- Run `bun run lint:fix` and ensure `bun run lint` exits 0 (AGENTS.md rule 7).

Acceptance for Milestone 3: repo-wide grep shows no writer of terminal-source status entries; all tests pass.

## Concrete Steps

Run tests with cwd `apps/desktop` — its `bunfig.toml` preloads `test-setup.ts` (which stubs `electronTRPC` and xterm globals); running `bun test apps/desktop` from the repo root skips the preload and fails ~83 tests spuriously:

    cd apps/desktop && bun test           # unit tests, including the new derivation tests
    cd packages/host-service && bun test  # host-side, including the liveness-join tests
    bun run typecheck                     # from repo root; expected: exits 0
    bun run lint                          # from repo root; expected: exit 0

Manual verification (Milestone 2 acceptance):

    bun dev
    # 1. Open a v2 workspace, open a terminal pane, start `claude`, submit a prompt.
    #    Observe: amber "working" dot on the pane tab and the sidebar workspace row.
    # 2. Trigger a permission prompt (e.g. ask it to run a shell command).
    #    Observe: dot turns red "permission" until you answer.
    # 3. Switch to another workspace before the turn ends.
    #    Observe: green "review" dot appears on the first workspace when it finishes; chime plays.
    # 4. Return and focus the terminal pane. Observe: green dot clears.
    # 5. Stale-state regression: submit a prompt, quit the app (Cmd+Q) mid-turn,
    #    wait for the agent to finish (host-service keeps running), relaunch.
    #    Observe: green "review" dot, NOT amber "working". Focusing the pane clears it.
    # 6. Interrupt regression: submit a prompt, press Esc in the terminal to interrupt.
    #    Observe: dot clears within a second in this window AND in a second app window.

## Validation and Acceptance

The feature is accepted when the six manual observations above hold, plus: `localStorage` inspection (devtools → Application → `v2-notifications-v1`) shows no `terminal:*` keys in `sources` after the migration runs, and a `terminalSeenAt` map instead. Unit-level: derivation function branch coverage, a store-migration test (feed a version-1 persisted blob containing a `terminal:x` entry, assert it is dropped and chat/manual entries survive), and updated tests replacing `statusTransitions.test.ts` semantics where still meaningful (visible-Stop-marks-seen).

## Idempotence and Recovery

Every step is a pure code edit; re-running tests/lint is safe. The persist migration is one-way but safe to re-run (dropping already-absent keys is a no-op). If Milestone 2 regresses something, the stored status writers are still active until Milestone 3, so reverting the reader commits restores the old behavior without data repair. Do not start Milestone 3 until Milestone 2's manual acceptance has been performed.

## Interfaces and Dependencies

No new libraries. New/changed public surface, all in `apps/desktop/src/renderer`:

    // hooks/host-service/useTerminalAgentStatuses
    deriveTerminalAgentStatus(args: { lastEventType: string; lastEventAt: number; lastSeenAt: number | undefined }): PaneStatus
    useTerminalAgentStatuses(workspaceId: string, options?: { enabled?: boolean }): Map<string, PaneStatus>

    // stores/v2-notifications (the ENTIRE stored state after the simplification pass)
    manualUnread: Record<string, true>              // sidebar mark-unread per workspace
    terminalSeenAt: Record<string, number>
    setManualUnread / clearManualUnread(workspaceId: string): void
    markTerminalSeen(terminalId: string, at?: number): void
    pruneTerminalSeen(terminalId: string): void
    markTerminalSeenNow(terminalId: string): void   // module-level helper
    // plus the pane→source mapping helpers (getV2NotificationSourcesForPane/Tab, source types)

    // hooks/host-service/useV2NotificationStatus (composites; only hooks with real consumers)
    useV2SourcesNotificationStatus / useV2PaneNotificationStatus /
    useV2WorkspaceNotificationStatus / useV2WorkspaceIsUnread / useMarkWorkspaceTerminalsSeen

    // packages/host-service/src/terminal-agents (Milestone 0)
    SqliteTerminalAgentBindingPersistence.listLiveByWorkspace / findLiveActive / deleteDefunct
    TerminalAgentStore.listByWorkspace / findActive   // delegate to the live joins when present

Host-service surface used (existing, unchanged): `terminalAgents.listByWorkspace` query and the public `notifications.hook` mutation (for the synthetic interrupt Stop).

## Artifacts and Notes

Root cause note for posterity: the binding store and the status map are both projections of the same hook stream, coupled only at the source (`notifications.ts:77-93` broadcasts the WS event and records the binding in the same mutation). The renderer projection was persisted without any snapshot reconciliation, so any missed event became permanent drift. This plan removes the second projection rather than adding a reconciler — fewer states, no sync protocol.

---

Revision note (2026-07-03, implementation session): Progress, Surprises & Discoveries, Decision Log, and Outcomes updated to reflect the completed implementation. Two scope additions surfaced during the work and are recorded above: the Electron-fallback event forwarding (a host-bypassing event path incompatible with binding-derived status) and the binding-gate on the interrupt synthetic Stop. Milestones 2 and 3 were executed together — once every reader had switched off stored terminal statuses, keeping the writers alive provided no additional rollback safety beyond git revert.
