# v2 Chat Refactor — T3 Code-Inspired Architecture

**Date:** 2026-04-21
**Scope:** Full refactor of the v2 workspace chat pane data layer (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/**`) plus corresponding host-service surface.
**Non-scope:** v1 chat is untouched; runtime/provider (mastracode) and UI component styling stay.

---

## 1. Why

The v2 chat pane has three structural problems that produce the visible bugs (flashing, lost turns, duplicated assistant messages, message gap on repeated prompts):

1. **Pull-only, 60 Hz polling.** `ChatPaneInterface.tsx:287` passes `fps: 60` to `useWorkspaceChatDisplay`, which refetches both `workspaceTrpc.chat.getDisplayState` and `workspaceTrpc.chat.listMessages` every ~16 ms. TanStack Query hands back fresh object identities per response; the entire 995-line interface plus every message row re-renders.
2. **Text-content-based optimistic dedup.** `useWorkspaceChatDisplay.ts:168-196` clears the optimistic user message by asking "does any user message with this exact text exist in the polled history?". Repeated identical prompts (`"hi"` three times) clear each other's optimistic state prematurely — the second send's optimistic vanishes the instant the poll lands, before the server has echoed it. Result: missing user-turn window, assistant response visually attached to the wrong turn.
3. **"Strip assistant during streaming" transition hack.** `withoutActiveTurnAssistantHistory` (same file, lines 60-83) hides assistant messages after the last user message while `isRunning && currentMessage`. At 60 Hz polling the `isRunning` flag and the final assistant message arrive on different frames, producing one or two frames where both the streaming copy and the completed copy render — the duplicated assistant message we saw in the screenshot.

T3 Code (v0.0.20, Electron Alpha build) ships a chat that doesn't exhibit any of these. The extracted source (`/Applications/T3 Code (Alpha).app/Contents/Resources/app.asar` via sourcemaps, 226 client files + 227 server files) shows why: event-sourced server, push-based WS stream, normalized Zustand store, ID-keyed stable rows. This plan ports those patterns into the v2 chat pane.

---

## 2. The T3 Code pattern (what we're adopting)

### 2.1 Server = event store + projections

T3's server (`packages/contracts/src/orchestration.ts:933-1214`) defines a closed union of typed events:

```
thread.created, thread.deleted, thread.archived, thread.meta-updated,
thread.runtime-mode-set, thread.interaction-mode-set, thread.message-sent,
thread.turn-start-requested, thread.turn-interrupt-requested,
thread.approval-response-requested, thread.user-input-response-requested,
thread.session-set, thread.proposed-plan-upserted, thread.turn-diff-completed,
thread.activity-appended, thread.reverted
```

Every write is an **append-only event** persisted to `OrchestrationEventStore` (SQLite, migration `001_OrchestrationEvents.ts`). Read-side **projections** (`ProjectionThreads`, `ProjectionThreadMessages`, `ProjectionThreadSessions`, `ProjectionThreadProposedPlans`, `ProjectionThreadShellSummary` …) are derived tables that snapshot current state for fast reads. Streaming assistant responses are two event shapes:

- `thread.message.assistant.delta { messageId, delta }` — appended text chunk
- `thread.message.assistant.complete { messageId }` — final flush

Deltas are **keyed by `messageId`** — the client mutates the same message in place as it grows, never replaces it.

### 2.2 Client = WebSocket RPC + orchestration event stream

`src/rpc/wsRpcClient.ts` exposes three orchestration methods:

- `dispatchCommand(cmd)` — unary request/response for client-originated commands (`thread.turn.start`, `thread.approval.respond`, etc.). The client **mints the `commandId` and `messageId` locally** (`src/components/ChatView.tsx:2595-2611`) so the optimistic row has the same id the server will persist.
- `subscribeThread({ threadId })` — long-lived `Stream.Stream` of `{ kind: "snapshot", snapshot } | { kind: "event", event }`. First frame is a full snapshot, subsequent frames are deltas.
- `replayEvents({ from })` — used for re-hydration after reconnect.

Subscription lifecycle is centralized in `src/environments/runtime/service.ts:163-236`: reference-counted, evicted when idle, auto-reattaches on connection drop. Entry point is `attachThreadDetailSubscription` — one call-site routes every subscribed thread.

### 2.3 Zustand store as the single source of truth

`src/store.ts` holds a **normalized** environment state:

```ts
messageIdsByThreadId: Record<ThreadId, MessageId[]>
messageByThreadId:    Record<ThreadId, Record<MessageId, Message>>
threadShellById, threadSessionById, threadTurnStateById
proposedPlanIdsByThreadId, proposedPlanByThreadId
activityIdsByThreadId, activityByThreadId
turnDiffIdsByThreadId, turnDiffSummaryByThreadId
```

`writeThreadState(state, nextThread, previousThread)` (`src/store.ts:567-675`) does structural equality per field before writing — if a message hasn't changed, its previous reference is kept. Every event handler funnels through this single write path, so the store *never* produces new object references for unchanged entries.

### 2.4 Stable timeline rows with ID-keyed diff

`src/components/chat/MessagesTimeline.logic.ts:194-240` has a `computeStableMessagesTimelineRows(rows, previous)` helper:

```ts
function isRowUnchanged(a, b) {
  if (a.kind !== b.kind || a.id !== b.id) return false;
  switch (a.kind) {
    case "message":
      return a.message === b.message  // reference equality, thanks to step 2.3
          && a.durationStart === b.durationStart
          && a.showCompletionDivider === b.showCompletionDivider
          && a.showAssistantCopyButton === b.showAssistantCopyButton
          && a.assistantTurnDiffSummary === b.assistantTurnDiffSummary
          && a.revertTurnCount === b.revertTurnCount;
    ...
  }
}
```

Rows are keyed by `id`, reused from the previous render when unchanged. Wrap each row in `React.memo` and untouched messages literally don't re-render even when new events land.

### 2.5 Synthetic "working" row, not a filter hack

The streaming indicator is a row, not a hidden message:

```ts
if (input.isWorking) {
  nextRows.push({ kind: "working", id: "working-indicator-row", createdAt: input.activeTurnStartedAt });
}
```

Real assistant messages render normally as deltas arrive. There is no "hide the assistant after the last user message" logic, so there is no transition-boundary race.

### 2.6 ID-keyed local dispatch reconciliation

`src/components/ChatView.logic.ts:284-358` defines `LocalDispatchSnapshot`:

```ts
{ startedAt, preparingWorktree, latestTurnTurnId, latestTurnRequestedAt,
  latestTurnStartedAt, latestTurnCompletedAt,
  sessionOrchestrationStatus, sessionUpdatedAt }
```

and `hasServerAcknowledgedLocalDispatch(...)` — the optimistic user turn is cleared when any tracked field on the active turn changes (id or timestamp). Text content is never consulted. Identical prompts are perfectly distinguishable because each has its own `turnId`.

---

## 3. Target architecture for Superset v2 chat

### 3.1 Runtime / provider — unchanged

We keep `mastracode` in `packages/host-service/src/runtime/chat/chat.ts`. Mastracode already emits turn/tool/message events internally; we just need to forward them. This is **not** a provider rewrite.

### 3.2 Add a chat event stream on the host service

**New file:** `packages/host-service/src/runtime/chat/events.ts` — in-process emitter. Each `chat-runtime` session instance owns an `EventEmitter` that translates mastracode's internal hook callbacks into a typed union:

```ts
export type ChatEvent =
  | { type: "session.started"; sessionId: string; at: string }
  | { type: "session.stopped"; sessionId: string; reason: "user" | "error" | "completed" }
  | { type: "turn.started"; sessionId: string; turnId: string; userMessageId: string; at: string }
  | { type: "turn.completed"; sessionId: string; turnId: string; at: string }
  | { type: "turn.interrupted"; sessionId: string; turnId: string; at: string }
  | { type: "message.user.appended"; sessionId: string; message: UserMessage }
  | { type: "message.assistant.started"; sessionId: string; messageId: string; turnId: string; at: string }
  | { type: "message.assistant.delta"; sessionId: string; messageId: string; delta: string }
  | { type: "message.assistant.completed"; sessionId: string; messageId: string; at: string }
  | { type: "message.assistant.error"; sessionId: string; messageId: string; error: string }
  | { type: "approval.requested"; sessionId: string; approvalId: string; category: string; ... }
  | { type: "approval.resolved"; sessionId: string; approvalId: string; decision: ApprovalDecision }
  | { type: "question.requested"; sessionId: string; questionId: string; ... }
  | { type: "question.resolved"; sessionId: string; questionId: string; answer: string }
  | { type: "plan.proposed"; sessionId: string; planId: string; plan: ProposedPlan }
  | { type: "plan.resolved"; sessionId: string; planId: string; response: PlanResponse }
  | { type: "error"; sessionId: string; message: string };
```

Each event carries the server-assigned id and timestamp. Client-minted message ids on user turns are preserved (see §3.4).

### 3.3 Expose it over the existing workspace event bus

Superset already has a WebSocket event bus (`@superset/workspace-client` → `getEventBus`, consumed via `renderer/hooks/host-service/useWorkspaceEvent`). It's wired today for `git:changed` and `fs:events`. **Add `chat:events`** with a session-scoped payload.

- **Server side:** in the chat runtime, after creating the runtime session, bridge mastracode hooks → `ChatEvent` → event bus channel `chat:events:{sessionId}`. One listener per active session; cleanup on session destroy.
- **Client side:** a new hook `useChatEvents(sessionId, (event) => ...)` built on top of `useWorkspaceEvent("chat:events", workspaceId, ...)` with a sessionId filter.
- **Replay on reconnect:** add `chat.replayEvents({ sessionId, since: eventSeq })` tRPC procedure. Every event carries a monotonically increasing per-session seq. Client tracks the last seq it applied; on reconnect (via `useWorkspaceHostUrl` reconnect) it calls `replayEvents` to catch up before re-subscribing.

**Why reuse the event bus instead of tRPC subscriptions?** We already ship the bus, the authz/token flow (`getHostServiceWsToken`), reconnect handling, and React hooks. One transport is less surface than two.

### 3.4 Client commands keep minting the message id

Today `workspaceTrpc.chat.sendMessage` takes the payload and returns the server-assigned message id. Change the input to accept a client-minted `userMessageId: string` (uuid). The host service uses that id when persisting. The client's optimistic row is created with the **same** id, so the reconciliation is pure identity: when the server emits `message.user.appended` with `messageId === optimisticId`, drop the optimistic bit. No text compare, no count compare.

Same pattern for `restartFromMessage` (edit/resend): client mints the new user message id, server uses it.

### 3.5 Normalized client store

**New file:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/state/chatStore.ts`.

Zustand store keyed by sessionId. State shape modeled on T3's `writeThreadState`:

```ts
interface ChatSessionState {
  sessionId: string;
  workspaceId: string;

  // Core identity lists — drive ordering. Small, frequently updated.
  messageIdsBySession: Record<string, string[]>;
  turnIdsBySession: Record<string, string[]>;
  activityIdsBySession: Record<string, string[]>;

  // Content tables — only the touched entry's reference changes per event.
  messageBySession: Record<string, Record<string, ChatMessage>>;
  turnBySession:    Record<string, Record<string, ChatTurn>>;
  activityBySession:Record<string, Record<string, ChatActivity>>;
  proposedPlanBySession: Record<string, Record<string, ProposedPlan>>;

  // Session-level state — changes rarely, separate keys.
  sessionStatusBySession: Record<string, SessionStatus>;
  pendingApprovalBySession: Record<string, PendingApproval | null>;
  pendingQuestionBySession: Record<string, PendingQuestion | null>;

  // Client-only: in-flight optimistic messages keyed by user-minted id.
  optimisticMessageBySession: Record<string, Record<string, OptimisticMessage>>;

  // Event replay cursor per session.
  lastAppliedSeqBySession: Record<string, number>;

  // Mutators — all writes go through these.
  applyEvent: (event: ChatEvent, seq: number) => void;
  applySnapshot: (sessionId: string, snapshot: ChatSnapshot) => void;
  registerOptimisticUserMessage: (sessionId: string, msg: OptimisticMessage) => void;
  clearOptimisticUserMessage: (sessionId: string, messageId: string) => void;
}
```

`applyEvent` is the **only** write path for server data. Structure mirrors T3's `writeThreadState`:

- For `message.assistant.delta`: if the target `messageId` exists, produce a new object with text appended and update `messageBySession[sessionId][messageId]`. Lists (`messageIdsBySession`) unchanged — same reference.
- For `message.assistant.started` / `message.user.appended`: append to `messageIdsBySession`, add entry to `messageBySession`. All unrelated session/thread tables untouched.
- For `turn.started` / `turn.completed` / `turn.interrupted`: update `turnBySession` only. Never touches `messageBySession`.

Result: components that subscribe to a specific message id (`messageBySession[sessionId][messageId]`) only re-render when that exact message changes. A streaming delta on message A does not cause message B to re-render.

### 3.6 Selectors + stable rows

Mirror `computeStableMessagesTimelineRows`. New file alongside the store: `state/chatSelectors.ts`.

```ts
export function selectTimelineRows(
  state: ChatSessionState,
  sessionId: string,
  previous: StableRowsState,
): StableRowsState {
  const ids = state.messageIdsBySession[sessionId] ?? [];
  const rows = ids.map((id) => ({
    kind: "message" as const,
    id,
    message: state.messageBySession[sessionId]?.[id],
    // ...derived fields
  }));
  // ...+ optimistic + working indicator
  return reconcileStableRows(rows, previous);
}
```

Subscribe with Zustand's `useStore(selector, shallow)` plus a local `useRef<StableRowsState>` for the previous state. Wrap the row component in `React.memo` with default shallow equality — unchanged rows skip render entirely.

### 3.7 Drop polling entirely

Delete `fps`, `refetchInterval`, `refetchIntervalInBackground` from `useWorkspaceChatDisplay`. The hook becomes a thin adapter that:

1. Runs `workspaceTrpc.chat.getSnapshot.useQuery(...)` once on mount (bootstrap).
2. Calls `applySnapshot` into the store.
3. Subscribes to `chat:events:{sessionId}` via `useWorkspaceEvent`; every event → `store.applyEvent(event, seq)`.
4. Returns selectors into the store for the surface the UI needs.

`getDisplayState` and `listMessages` queries go away. Their content is derived from the store.

### 3.8 Delete the transition-boundary hack

`withoutActiveTurnAssistantHistory` is gone. Assistant messages render as they are. The UI's "working" affordance becomes a synthetic row computed in `selectTimelineRows` when `sessionStatusBySession[id] === "running"` and no assistant message is currently receiving deltas.

---

## 4. Implementation phases

Each phase is independently shippable. Phases 1 and 2 together fix the three visible bugs; phases 3–5 are the architectural polish.

### Phase 0 — scaffolding (no behavior change)

- Introduce the client store file with no consumers yet.
- Introduce `chatSelectors.ts` with the stable-rows helper, tested in isolation.
- Introduce `ChatEvent` types in a shared contract file (likely `packages/host-service/src/contracts/chat-events.ts`, re-exported to renderer via `@superset/workspace-client`).

**Ships nothing user-visible. Unit tests for the store + reducers only.**

### Phase 1 — host-service event bridge + bootstrap snapshot

- Add `packages/host-service/src/runtime/chat/events.ts` with a per-session `EventEmitter`.
- Patch the existing chat runtime (`packages/host-service/src/runtime/chat/chat.ts`) to translate mastracode hook invocations into `ChatEvent`s and emit them.
- Add new tRPC procedure `chat.getSnapshot` that returns `{ messages, turns, activities, pendingApproval, pendingQuestion, status, lastEventSeq }`.
- Add new tRPC procedure `chat.replayEvents({ sessionId, since })` returning `ChatEvent[]` with seq numbers.
- Bridge `ChatEvent` emissions to the existing workspace event bus as channel `chat:events`.
- Extend `renderer/hooks/host-service/useWorkspaceEvent` to accept `"chat:events"` (overload).

**Ships nothing user-visible; the old queries still drive the UI. New endpoints exist and unit-tested.**

### Phase 2 — switch ChatPane to event-driven reads (the user-visible fix)

- Rewrite `useWorkspaceChatDisplay` to: bootstrap via `getSnapshot`, subscribe via `chat:events`, apply via the store from Phase 0. Delete polling config. Delete `withoutActiveTurnAssistantHistory`.
- Change `workspaceTrpc.chat.sendMessage` input to require `userMessageId`. Mint it in the client (`crypto.randomUUID()`) before dispatching. Optimistic row uses the same id.
- Replace the `optimisticUserMessage` text-matching useEffect with id-based clearing: in `applyEvent` for `message.user.appended`, if `optimisticMessageBySession[sessionId][event.message.id]` exists, delete it.
- Rewrite `ChatPaneInterface.tsx` to consume store selectors instead of `useChatDisplay`'s return shape. Keep all the existing sub-components (MessageList, ChatInputFooter, etc.); they receive props from selectors now.

**Ships the real fix**: no more polling, no more text-dedup, no more transition hack. The three screenshot bugs should be resolved after this phase.

### Phase 3 — stable rows + React.memo on message components

- Apply `computeStableMessagesTimelineRows` at the ChatMessageList boundary.
- Wrap every message row component (`AssistantMessage`, `UserMessage`, `ToolPreviewMessage`, `PendingApprovalMessage`, etc., in `ChatMessageList/components/`) in `React.memo` with the default shallow check. Given the store guarantees reference stability, this actually works — no custom equality needed.

**Ships**: eliminates message-row re-renders on unrelated updates. Perceived snappiness improves, CPU drops during streaming.

### Phase 4 — unify the two optimistic layers

`ChatPaneInterface.tsx` currently maintains a second "pending user turn" (`getVisibleMessagesWithPendingUserTurn`, `shouldClearPendingUserTurn`) on top of the optimistic state in the display hook. Collapse to one: the store owns optimism. Delete `utils/transientUserTurn/**`.

**Ships**: simpler reasoning, no two-layer race.

### Phase 5 — reconnect + event replay

- Client tracks `lastAppliedSeqBySession`. On WS disconnect/reconnect events from the bus, call `chat.replayEvents({ sessionId, since: lastAppliedSeqBySession })` before resubscribing.
- If the replay gap is bigger than a threshold (say, 500 events), fall back to `getSnapshot` + full reset.

**Ships**: correctness on flaky networks, backgrounded-for-5-minutes tabs, host-service restarts.

---

## 5. File-by-file deltas

New:
- `packages/host-service/src/contracts/chat-events.ts` — event union + seq helpers.
- `packages/host-service/src/runtime/chat/events.ts` — per-session emitter + event-seq counter.
- `apps/desktop/src/renderer/.../ChatPane/state/chatStore.ts` — Zustand store.
- `apps/desktop/src/renderer/.../ChatPane/state/chatStore.test.ts` — reducer tests (one test per event type, plus ordering/idempotency).
- `apps/desktop/src/renderer/.../ChatPane/state/chatSelectors.ts` — `selectTimelineRows`, `selectActiveTurn`, etc.
- `apps/desktop/src/renderer/.../ChatPane/state/chatSelectors.test.ts`.
- `apps/desktop/src/renderer/hooks/host-service/useChatEvents/**` — chat-events hook.

Modified:
- `packages/host-service/src/trpc/router/chat/chat.ts` — add `getSnapshot`, `replayEvents`. `sendMessage` input gets `userMessageId`. Deprecate `getDisplayState`, `listMessages` (keep for one release).
- `packages/host-service/src/runtime/chat/chat.ts` — emit events; keep existing query methods backed by in-memory projection.
- `apps/desktop/src/renderer/hooks/host-service/useWorkspaceEvent/useWorkspaceEvent.ts` — `"chat:events"` overload.
- `apps/desktop/src/renderer/.../ChatPane/hooks/useWorkspaceChatDisplay/useWorkspaceChatDisplay.ts` — event-driven rewrite.
- `apps/desktop/src/renderer/.../ChatPane/components/WorkspaceChatInterface/ChatPaneInterface.tsx` — consume store selectors; delete `withoutActiveTurnAssistantHistory` callsites.
- `apps/desktop/src/renderer/.../ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/**` — wrap rows in `React.memo`.

Deleted (Phase 4):
- `apps/desktop/src/renderer/.../WorkspaceChatInterface/utils/transientUserTurn/**`
- `apps/desktop/src/renderer/.../WorkspaceChatInterface/utils/optimisticUserMessage/**` (functionality absorbed into store).

---

## 6. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Event bridge misses a mastracode hook and state goes stale | Keep the old `listMessages` / `getDisplayState` queries behind a feature flag for one release as a fallback. Compare store vs. authoritative poll in a dev-only invariant check. |
| Replay endpoint returns gigabytes of events for long-running sessions | Enforce a hard cap (500 events). Fall back to full `getSnapshot` when exceeded. Events are small (tens of bytes of JSON each) so the practical cap is never hit in normal use. |
| Event seq collisions across restarts of the host-service | Store seq in the session's own memory. On host-service restart, session is reset — no cross-restart replay. Snapshot endpoint returns a new session's `lastEventSeq: 0`. |
| Zustand store subscription + React concurrent mode tearing | Use `useSyncExternalStoreWithSelector` (via Zustand's built-in `useStore` hook with `equalityFn`). Same pattern as existing v2 workspace stores. |
| Breaking v1 chat | v1 lives in `renderer/components/Chat/ChatInterface/**` and uses `chatServiceTrpc` over electron IPC. This plan doesn't touch any of it. |
| Existing v2 users with sessionIds that were created pre-refactor | Event bridge works against the same mastracode runtime, same session ids. No data migration needed. Snapshot endpoint returns current state whether or not we've been emitting events. |

---

## 7. Out of scope

- **Provider changes.** mastracode stays. If we want to swap providers (Claude Agent SDK, Codex, etc. like T3 does), that's a separate effort.
- **Event persistence on the server.** T3 persists events to SQLite. We don't need to for phase 1–5: the host-service is ephemeral per workspace and mastracode already persists conversation state to its own SQLite. If we later want cross-restart replay, revisit.
- **Sidebar/thread summary projection.** T3's "shell stream" pre-computes sidebar data server-side. Our session list lives in the cloud DB and doesn't need the same treatment.
- **Effect framework.** T3 uses Effect for server & some client plumbing. Adopting Effect is a much bigger call than this refactor; we model the pattern in plain TypeScript.

---

## 8. Success criteria

1. Sending `"hi"` three times in a row produces three distinct user turns with three distinct assistant responses, no missing turns, no duplicated assistant bubbles.
2. Chrome DevTools Profiler: during a streaming assistant response, only the actively-streaming message row re-renders at stream cadence. Unrelated rows render 0 times.
3. Network tab: no recurring polling requests to `chat.getDisplayState` or `chat.listMessages`. One `getSnapshot` at mount, one WS connection, one `replayEvents` per reconnect.
4. `bun test` passes including the new store/selector tests.
5. Manual test: disconnect WiFi mid-stream, reconnect — chat catches up to the completed response without duplicates.
