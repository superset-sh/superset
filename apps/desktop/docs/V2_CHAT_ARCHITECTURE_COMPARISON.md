# V2 Chat Architecture Comparison: T3 Code · OpenCode · Superset

**Date:** 2026-04-21
**Purpose:** Side-by-side architectural reference for the three chat implementations we study. Pairs with the two refactor proposals:
- `apps/desktop/plans/20260421-0200-v2-chat-t3code-refactor.md`
- `apps/desktop/plans/20260421-v2-chat-opencode-rebuild.md`

This document is descriptive, not prescriptive. It does not pick a direction — it gives you the three pictures so you can.

---

## 1. Executive summary

| | T3 Code | OpenCode | Superset v2 |
|---|---|---|---|
| **Transport** | WebSocket RPC + event streams (Effect `Stream`) | HTTP SSE via `/event` endpoint on the local opencode server | tRPC pull queries over HTTPS (per-workspace host-service) |
| **State model** | Event-sourced server (event log + projections) | In-process server state, per-directory, streamed out | Polled server state; no event log |
| **Push or pull?** | Push (one subscribe per focused thread, plus one all-thread shell stream) | Push (one SSE connection, fan-out by event type) | **Pull at 60 fps** (two refetch queries) |
| **Client store** | Normalized Zustand (`messageByThreadId` + `messageIdsByThreadId`, etc.) | SolidJS `createStore` with `produce`/`reconcile`, slices per `sessionID` / `messageID` | tRPC cache + React `useState` + a handful of Zustand/React DB pieces |
| **Message unit** | Role-typed messages (`user`, `assistant`) with in-message `content[]` parts; turn ids are first-class | **Message split from Part**: `Message` (user or assistant) + `Part[]` keyed by `messageID`; turns derived by `parentID` | Messages with nested `content[]` parts; turn boundary computed at render time via "last user message" scan |
| **Streaming** | `thread.message.assistant.delta` events mutate a specific `messageId` in place | SSE `message.updated` + `part.updated` events apply patches to `parts[messageID]` | No streaming path; polling produces a fresh message array each tick |
| **Optimism** | Client mints `messageId`; server echoes same id | Client builds local `UserMessage` + `Part[]` with `opt-<ULID>`; server confirm replaces by id | **Text-content equality** match between polled history and optimistic message |
| **Transition hack** | None — synthetic `"working"` row | None — paced rendering + `busy` status; parts render in place | `withoutActiveTurnAssistantHistory` strips assistant messages after the last user during streaming |
| **Docks (approvals, questions, plans)** | Mix: approvals are events, rendered in timeline context | **Dedicated dock stack above composer** (permission/question/plan/todo/revert each a component) | Rendered as inline timeline messages (`PendingApprovalMessage`, `PendingPlanApprovalMessage`, `PendingQuestionMessage`) |
| **Timeline rendering** | `computeStableMessagesTimelineRows` preserves row identity; `React.memo`-friendly | Windowed history (`createSessionHistoryWindow`), staging (`createTimelineStaging`), paced text (`createPacedValue`), `content-visibility:auto` on inactive turns | Flat list, no windowing, no memoized rows; `ChatMessageList` re-renders on every poll |
| **Optimistic layers** | One (server ack via event) | One (server replaces `opt-<ULID>` entry) | **Two overlapping** (`optimisticUserMessage` + `transientUserTurn`) |
| **UI framework** | React + Zustand + TanStack Router | SolidJS + `solid-js/store` + TanStack Solid Query | React + Zustand + TanStack React Query + TanStack DB |

---

## 2. T3 Code

### 2.1 One-paragraph summary

Event-sourced server over SQLite, WebSocket RPC with typed Effect streams, normalized Zustand client store. A focused thread maintains a **snapshot-then-events** subscription; a separate all-threads "shell" stream keeps the sidebar warm. Every state write on the client goes through one reducer path (`writeThreadState`) that preserves reference identity on unchanged fields. Timeline rows go through a second reference-preserving diff (`computeStableMessagesTimelineRows`). Streaming is native: `thread.message.assistant.delta { messageId, delta }` events append text to the specific `messageId` in place.

### 2.2 Diagram

```
 ┌──────────────────────────── T3 CODE SERVER ──────────────────────────────┐
 │                                                                           │
 │   Client commands         OrchestrationCommand (Schema union)             │
 │   ─────────▶              dispatchCommand(cmd)                            │
 │                                    │                                      │
 │                                    ▼                                      │
 │                           ┌───────────────┐   append                     │
 │                           │  Event Store  │◀──── OrchestrationEvent      │
 │                           │  (SQLite log) │      { threadId, seq, ts }   │
 │                           └───────┬───────┘                              │
 │                                   │ fan-out                               │
 │         ┌────────────┬────────────┼───────────┬──────────────┐           │
 │         ▼            ▼            ▼           ▼              ▼           │
 │   ProjectionThreads  ProjectionThreadMessages ...    ShellSummary etc.   │
 │   (materialized views for fast reads / sidebar)                          │
 │                                                                          │
 │   subscribeThread({threadId}) = Stream<                                  │
 │     { kind:"snapshot", snapshot } | { kind:"event", event }              │
 │   >   (Effect Stream over WebSocket frames)                              │
 │                                                                          │
 └────────────────────────────┬─────────────────────────────────────────────┘
                              │ WS RPC (Effect)
                              │   • dispatchCommand (unary)
                              │   • subscribeThread (stream)
                              │   • replayEvents (unary, for reconnect)
                              ▼
 ┌──────────────────────────── T3 CODE CLIENT ──────────────────────────────┐
 │                                                                           │
 │   runtime/service.ts                                                     │
 │   ────────────────                                                       │
 │   attachThreadDetailSubscription(threadId)                               │
 │   ├─ ref-counted; evicted when idle; reconnects on WS drop               │
 │   └─ on event ─▶ applyEnvironmentThreadDetailEvent                       │
 │                                                                          │
 │   ┌─────────────────────── Zustand store.ts ────────────────────────┐    │
 │   │                                                                  │    │
 │   │  writeThreadState(state, nextThread, previousThread)             │    │
 │   │    per-field structural equality → only changed slices mutate    │    │
 │   │                                                                  │    │
 │   │  normalized slices:                                              │    │
 │   │    messageIdsByThreadId   messageByThreadId                      │    │
 │   │    threadShellById        threadSessionById                      │    │
 │   │    threadTurnStateById    proposedPlanIdsByThreadId / ByThreadId │    │
 │   │    activityIdsByThreadId / ByThreadId                            │    │
 │   │    turnDiffIdsByThreadId / turnDiffSummaryByThreadId             │    │
 │   │                                                                  │    │
 │   └──────────────────────────────┬───────────────────────────────────┘    │
 │                                  │ useStore(selector, shallow)            │
 │                                  ▼                                        │
 │   MessagesTimeline.logic.ts                                               │
 │   ─────────────────────────                                               │
 │   deriveMessagesTimelineRows  →  MessagesTimelineRow[]                    │
 │        kind: "message"|"work"|"proposed-plan"|"working"                   │
 │                                  │                                        │
 │                                  ▼                                        │
 │   computeStableMessagesTimelineRows(rows, previous)                       │
 │        isRowUnchanged: per-variant shallow field check                    │
 │        → unchanged rows keep object identity → React.memo skips render    │
 │                                  │                                        │
 │                                  ▼                                        │
 │   <Turn ... > / <UserMessage> / <AssistantParts> / <WorkingRow>           │
 │                                                                           │
 └───────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Key code anchors

- Event schema: `packages/contracts/src/orchestration.ts:933-1214` — `OrchestrationEvent` union (`thread.created`, `thread.message-sent`, `thread.message.assistant.delta`, `thread.message.assistant.complete`, `thread.turn-diff-completed`, …).
- Dispatch: `src/components/ChatView.tsx:2595-2611` — client mints `messageId` and `commandId`, sends `thread.turn.start`.
- Subscribe: `src/environments/runtime/service.ts:163-236` — ref-counted subscription lifecycle.
- Store reducer: `src/store.ts:567-675` — `writeThreadState`, per-field equality.
- Stable rows: `src/components/chat/MessagesTimeline.logic.ts:110-240` — diff-preserving row reconciliation, synthetic `"working"` row.

### 2.4 Streaming model

A single assistant message stream is three events:

```
thread.message-sent { messageId, role:"assistant", turnId, at }  // once
thread.message.assistant.delta { messageId, delta }              // many, additive
thread.message.assistant.complete { messageId, at }              // once
```

The reducer looks up `messageByThreadId[threadId][messageId]`, produces a new message object with `text + delta`, writes it. The **list** (`messageIdsByThreadId[threadId]`) is unchanged — same reference — so every row except the one streaming skips re-render.

### 2.5 Why it doesn't flash

1. No polling. Events fire only when state actually changes.
2. Reference identity preserved per field → React.memo works by default.
3. Turn boundaries are a first-class concept (`turnId`), so streaming doesn't race with "strip during streaming" hacks.
4. A synthetic `"working"` row represents "a turn is in flight" — real assistant messages always render in place; no filter-based transition.

---

## 3. OpenCode

### 3.1 One-paragraph summary

OpenCode splits every chat record into a **`Message` header** and a **flat `Part[]` keyed by `messageID`**. Server is a Hono HTTP server backed by an Effect pub/sub bus; clients consume a single SSE stream and reduce events into a SolidJS `createStore` keyed by `sessionID` and `messageID`. Timeline is aggressively optimized: history windowing, frame-staged mounting, paced typewriter text, stable-vs-live markdown split, and `content-visibility: auto` on inactive turns. Overlays (approvals, questions, plans, todos, revert) are **docks above the composer**, not inline messages. Optimism is per-id: client mints the user `messageId`, server echoes it back.

### 3.2 Diagram

```
 ┌────────────────────────── OPENCODE SERVER ───────────────────────────────┐
 │                                                                           │
 │   packages/opencode/src/server/server.ts  (Hono + @hono/bun)              │
 │   ─────────────────────────────────────────                              │
 │   Routes: /session   /pty   /file   /mcp   /config   /provider           │
 │           /event  ◀────── SSE subscription to Bus.subscribeAllCallback   │
 │                                                                          │
 │   Effect PubSub (packages/opencode/src/bus/index.ts)                     │
 │   ──────────────────────────────────────────────────                     │
 │   Bus.publish(def, props)                                                │
 │     ├─ wildcard PubSub   (feeds /event SSE)                              │
 │     └─ typed    PubSub   (feeds subscribe(def, cb) callers)              │
 │                                                                          │
 │   Event definitions (across modules; each via BusEvent.define):          │
 │     session.updated     session.deleted    session.idle                  │
 │     message.updated     message.removed                                  │
 │     part.updated        part.removed                                     │
 │     permission.updated  permission.replied                               │
 │     question.updated                                                     │
 │     todo.updated                                                         │
 │     session.error                                                        │
 │                                                                          │
 │   Storage: per-project SQLite ("Instance" per directory)                 │
 │     messages are persisted; parts are keyed by messageID                 │
 │                                                                          │
 └──────────────────────────────────┬───────────────────────────────────────┘
                                    │ HTTP + SSE
                                    │   • GET  /event            (SSE stream)
                                    │   • POST /session.send     (unary)
                                    │   • POST /session.revert   (unary)
                                    │   • GET  /session.history  (unary)
                                    ▼
 ┌────────────────────────── OPENCODE CLIENT ───────────────────────────────┐
 │  (SolidJS + solid-js/store + TanStack Solid Query)                       │
 │                                                                           │
 │   context/global-sync/bootstrap.ts                                       │
 │   ───────────────────────────────                                        │
 │   · Mount → GET /event (SSE) → applyGlobalEvent / applyDirectoryEvent    │
 │   · Query once: providers, projects, config                              │
 │                                                                          │
 │   context/global-sync/event-reducer.ts                                   │
 │   ─────────────────────────────────────                                  │
 │   applyDirectoryEvent(event) switches on type:                           │
 │     "message.updated" → setStore.session.message[sessionID][idx] = msg   │
 │     "part.updated"    → setStore.session.part[messageID][partIdx]...     │
 │     "session.idle"    → setStore.session.status[sessionID] = {idle}      │
 │     "permission.*"    → setStore.permission_request[...] = req            │
 │   uses produce() + reconcile(..., { key: "id" }) for list diffs          │
 │                                                                          │
 │   ┌──────────────── SolidJS createStore ──────────────────────────────┐  │
 │   │                                                                    │  │
 │   │   sync.data = {                                                    │  │
 │   │     message:          { [sessionID]: Message[] }                   │  │
 │   │     part:             { [messageID]: Part[] }                      │  │
 │   │     session_status:   { [sessionID]: SessionStatus }               │  │
 │   │     session_diff:     { [sessionID]: FileDiff[] }                  │  │
 │   │     session_todo:     { [sessionID]: Todo[] }                      │  │
 │   │     permission:       { [sessionID]: PermissionRequest }           │  │
 │   │     question:         { [sessionID]: QuestionRequest  }            │  │
 │   │   }                                                                │  │
 │   │                                                                    │  │
 │   └────────────────────────────┬───────────────────────────────────────┘  │
 │                                │ createMemo selectors                     │
 │                                ▼                                          │
 │                                                                           │
 │   pages/session.tsx                                                       │
 │   ─────────────────                                                       │
 │   · createSessionHistoryWindow   (turnInit=10, turnBatch=8)              │
 │   · createAutoScroll             (userScrolled-aware, nested-opt-out)    │
 │   · createSessionHashScroll      (#message-<id> deep links)              │
 │                                                                          │
 │   pages/session/message-timeline.tsx                                     │
 │   ───────────────────────────────────                                    │
 │   · createTimelineStaging(init=1, batch=3) — frame-staged mount          │
 │   · content-visibility: auto + contain-intrinsic-size on inactive turns  │
 │                                                                          │
 │   pages/session/session-turn.tsx                                         │
 │   ────────────────────────────                                           │
 │   Turn = { user: UserMessage, assistants: AssistantMessage[], parts }    │
 │   Grouped by parentID (assistant.parentID === user.id)                   │
 │                                                                          │
 │   ui/message-part.tsx   PART_MAPPING registry                            │
 │   ──────────────────────────────────────────                              │
 │     text      → createPacedValue(text, live) → MarkdownStream             │
 │     reasoning → ReasoningPart (collapsible)                              │
 │     tool      → ToolPart (switches on tool name)                         │
 │     file/image/agent → respective                                        │
 │                                                                          │
 │   pages/session/composer/session-composer-region.tsx                     │
 │   ────────────────────────────────────────────────                       │
 │   DOCK STACK (above composer, not in timeline):                          │
 │     FollowupDock | PermissionDock | QuestionDock | PlanDock |            │
 │     TodoDock | RevertDock                                                │
 │   composer builds Part[] via buildRequestParts(editorDoc, attachments)   │
 │   submit path: addOptimistic(opt-ULID) → POST /session.send → id echo    │
 │                                                                          │
 └───────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Key code anchors

- Server bus: `packages/opencode/src/bus/index.ts` — Effect `PubSub`, typed + wildcard channels.
- Server event endpoint: `packages/opencode/src/server/server.ts` — Hono `/event` SSE subscription via `Bus.subscribeAllCallback`.
- Client store bootstrap: `packages/app/src/context/global-sync/bootstrap.ts` — `retry()`-wrapped initial loads, SSE reconnect.
- Client reducer: `packages/app/src/context/global-sync/event-reducer.ts` — `produce()` + `reconcile(..., { key: "id" })` list merges, `SKIP_PARTS` filter.
- Timeline: `packages/app/src/pages/session/message-timeline.tsx`, `session-turn.tsx` — windowing, staging.
- Part renderer: `packages/ui/src/components/message-part.tsx` — `PART_MAPPING`, `createPacedValue`.
- Docks: `packages/app/src/pages/session/composer/` — `session-followup-dock`, `session-permission-dock`, `session-question-dock`, `session-plan-dock`, `session-todo-dock`, `session-revert-dock`.

### 3.4 Streaming model

Streaming text lands as part updates. Pseudocode of the reducer:

```
case "part.updated": {
   const { sessionID, messageID, part } = event.properties;
   setStore("session", "part", messageID, produce(parts => {
     const idx = parts.findIndex(p => p.id === part.id);
     if (idx >= 0) parts[idx] = part;
     else          parts.push(part);
   }));
   break;
}
```

`createPacedValue(text, live)` on the client then doles out characters at ~24 ms/chunk snapped to whitespace. `MarkdownStream` further splits the rendered text into a stable prefix + a live trailing section so existing DOM doesn't rebuild as tokens land.

### 3.5 Why it's fast and fluid

1. One SSE connection, one reducer, one store — the entire client is a reduce-over-events pipeline.
2. List reconciliation is keyed by id (`reconcile(..., { key: "id" })`), so insertions/updates are minimal DOM work.
3. Windowing (10 + 8), staging (1 + 3 per frame), and `content-visibility: auto` keep the initial render cheap even on 500-turn sessions.
4. Docks carry ephemeral overlays (approvals, questions, plans) out of the message stream — the timeline never has to filter them back out.

---

## 4. Superset v2 (current)

### 4.1 One-paragraph summary

Per-workspace host-service exposes a tRPC chat router. The v2 chat pane calls two queries (`getDisplayState`, `listMessages`) with `refetchInterval: 1000/60 ≈ 16 ms` and renders results through a 995-line `ChatPaneInterface.tsx`. Messages are a flat array of `{ role, content: Part[] }` objects; the boundary between "still streaming" and "just completed" is detected per frame by `withoutActiveTurnAssistantHistory`, which filters out assistant messages after the last user message while `isRunning`. Optimistic user messages are matched against polled history by **text-content equality**, so repeated prompts collide. Approvals / questions / plans render as inline timeline messages.

### 4.2 Diagram

```
 ┌─────────────────── SUPERSET HOST SERVICE (per workspace) ────────────────┐
 │                                                                           │
 │   packages/host-service/src/trpc/router/chat/chat.ts                     │
 │   ────────────────────────────────────────────────                        │
 │   protected procedures (all request/response):                           │
 │     getDisplayState   (query) ────┐                                      │
 │     listMessages      (query) ────┤ POLLED                               │
 │     sendMessage       (mutation)                                         │
 │     restartFromMessage (mutation)                                        │
 │     stop              (mutation)                                         │
 │     respondToApproval (mutation)                                         │
 │     respondToQuestion (mutation)                                         │
 │     respondToPlan     (mutation)                                         │
 │     getSlashCommands  (query)                                            │
 │     resolveSlashCommand / previewSlashCommand (mutations)                │
 │                                                                          │
 │   Runtime: mastracode ChatRuntimeService                                 │
 │   ──────────────────────────────────────                                 │
 │   · Per-session Runtime held in-memory                                   │
 │   · Harness-driven; hooks into mastracode internal events                │
 │   · No event emission to the outer world (events happen internally)      │
 │                                                                          │
 └──────────────────────────┬───────────────────────────────────────────────┘
                            │ tRPC / HTTPS via @superset/workspace-client
                            │   (workspace-scoped per-host URL)
                            ▼
 ┌───────────────────────── SUPERSET RENDERER ──────────────────────────────┐
 │                                                                           │
 │   ChatPane.tsx                                                            │
 │   ─────────────                                                           │
 │   useCallback([ctx])-based wrapper around:                               │
 │                                                                          │
 │   useWorkspaceChatController.ts        useWorkspaceChatDisplay.ts        │
 │   ─────────────────────────────        ─────────────────────────         │
 │   sessions list (useLiveQuery)         getDisplayState.useQuery({        │
 │   getOrCreateSession (apiTrpc)           refetchInterval: 1000/60        │
 │   handleNewChat / Delete etc             refetchIntervalInBackground })  │
 │                                        listMessages.useQuery({ ... })    │
 │                                        ◀─── 60 fps poll                  │
 │                                                                          │
 │                                        currentMessage / isRunning /      │
 │                                        messages  ── every ~16 ms ───▶    │
 │                                                                          │
 │                     ┌── withoutActiveTurnAssistantHistory ──┐             │
 │                     │  if (isRunning && currentMessage) {   │             │
 │                     │    strip assistant msgs after last    │             │
 │                     │    user message index                  │             │
 │                     │  }                                     │             │
 │                     └───────────────────────────────────────┘             │
 │                                                                          │
 │                     ┌── optimisticUserMessage dedup ────────┐             │
 │                     │  if historical.some(m =>              │             │
 │                     │       m.text === optimistic.text)     │             │
 │                     │    clear optimistic                    │             │
 │                     │  ← BREAKS on repeated prompts          │             │
 │                     └───────────────────────────────────────┘             │
 │                                                                          │
 │                                  │                                        │
 │                                  ▼                                        │
 │   ChatPaneInterface.tsx (995 lines)                                       │
 │   ─────────────────────────────────                                       │
 │   · useState ~12× (drafts, focus, editing ids, model picker, …)           │
 │   · TanStack DB live queries for chat preferences                         │
 │   · getVisibleMessagesWithPendingUserTurn + transientUserTurn state       │
 │     ← SECOND optimistic layer, overlapping with the first                 │
 │                                                                          │
 │                                  │                                        │
 │                                  ▼                                        │
 │   ChatMessageList.tsx                                                     │
 │   ─────────────────────                                                   │
 │   flat list, no windowing, no React.memo on rows;                        │
 │   new message-array identity every poll → every row re-renders           │
 │                                                                          │
 │   Inline overlay messages:                                               │
 │     PendingApprovalMessage                                               │
 │     PendingPlanApprovalMessage                                           │
 │     PendingQuestionMessage                                               │
 │   rendered AS timeline entries, not as docks                             │
 │                                                                          │
 │   Composer: ChatInputFooter.tsx (+ TiptapPromptEditor via adapter)       │
 │   single path; dataSource adapter added 2026-04-21 to decouple v1/v2     │
 │                                                                          │
 └───────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Key code anchors

- Router: `packages/host-service/src/trpc/router/chat/chat.ts` — no subscriptions, all request/response.
- Poll config: `apps/desktop/.../ChatPane/components/WorkspaceChatInterface/ChatPaneInterface.tsx:287` — `fps: 60`.
- Poll consumers: `.../ChatPane/hooks/useWorkspaceChatDisplay/useWorkspaceChatDisplay.ts:127-143` — `getDisplayState` + `listMessages` queries.
- Strip hack: same file, lines 60-83 — `withoutActiveTurnAssistantHistory`.
- Text-based optimism: same file, lines 168-196 — equality over `part.text === optimisticText`.
- Second optimistic layer: `.../WorkspaceChatInterface/utils/transientUserTurn/transientUserTurn.ts` + `getVisibleMessagesWithPendingUserTurn`.
- Inline overlay messages: `.../ChatMessageList/components/PendingApprovalMessage/`, `PendingPlanApprovalMessage/`, `PendingQuestionMessage/`.

### 4.4 Streaming model

There isn't one. The server produces tokens internally in mastracode; the client observes them only by polling. Token-to-paint latency is bounded below by `1000/fps` ms + request time; what the user sees as "streaming" is the accumulated text in `getDisplayState.data.currentMessage.text`, fetched every poll and replaced wholesale.

### 4.5 Known failure modes this architecture produces

1. **60-Hz re-render flash.** New object identities per poll → full tree re-render.
2. **Duplicate assistant bubble on turn boundary.** `isRunning` and the final assistant message land on different frames; for 1–2 frames both the streaming copy (`currentMessage`) and the final copy (last entry in `messages`) render.
3. **Lost user turn on repeated identical prompts.** Text-equality optimistic match fires against the previous identical message, clearing the optimistic before the server echoes the new one.
4. **Two-layer optimism races.** `optimisticUserMessage` in the display hook and `transientUserTurn` in the interface can be in different phases at the same time.
5. **Inline approval messages conflate history with blocking UI.** Once resolved they remain in the timeline looking like historical messages.

---

## 5. Side-by-side: the same concept across all three

### 5.1 How server state reaches the UI

```
  ┌─────────────┐   T3 Code:   event store + WS Stream<snapshot|event>
  │   SERVER    │
  │   (state)   │   OpenCode:  per-directory store + SSE wildcard stream
  │             │
  │             │   Superset:  mastracode runtime, polled via tRPC queries
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ T3 Code                                                              │
  │  subscribeThread({threadId}) ━━━━stream━━━▶ applyEvent(e) ▶ Zustand  │
  │  (ref-counted, evicts when idle, replay on reconnect)               │
  ├─────────────────────────────────────────────────────────────────────┤
  │ OpenCode                                                             │
  │  GET /event (SSE wildcard) ━━━━━━━━━━━━▶ applyDirectoryEvent ▶ Store │
  │  (single connection, typed reducer per event.type)                   │
  ├─────────────────────────────────────────────────────────────────────┤
  │ Superset v2                                                          │
  │  getDisplayState.useQuery({refetchInterval:16ms}) ━▶ TanStack cache  │
  │  listMessages.useQuery({refetchInterval:16ms})    ━▶ TanStack cache  │
  │  (pull; no push; 120 requests/sec)                                   │
  └─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Message representation

```
  T3 Code:
      Thread ─▶ messages: ChatMessage[]
                             ├─ role: "user"|"assistant"
                             ├─ content: Part[]         (embedded parts)
                             ├─ turnId
                             └─ stopReason / errorMessage

  OpenCode:
      sync.data.message[sessionID]: Message[]           (header only)
      sync.data.part[messageID]:    Part[]              (SEPARATE TABLE, keyed)
        Message = { id, role, parentID?, modelID, ... }
        Part    = text | reasoning | tool | file | image | agent

  Superset v2:
      messages: ChatMessage[]                            (same as T3 shape-wise)
                 └─ content: Part[]
                     ├─ type: "text"|"image"|"file"|"tool_use"|"tool_result"|"thinking"
                     └─ …
      pending overlays:  not in messages; rendered as *separate* message types
                         PendingApprovalMessage, PendingPlanApprovalMessage,
                         PendingQuestionMessage (inline in timeline)
```

OpenCode's split is the structural outlier and the main reason its streaming is cheap: you mutate `parts[messageID]` without touching the `Message[]` list.

### 5.3 Turn model

```
  T3 Code:   turn is a first-class entity on the server (turnId carried on events)
             client timeline groups by turnId for the synthetic "working" row

  OpenCode:  turn is a virtual grouping derived on the client:
             Turn = { user: UserMessage, assistants: AssistantMessage[] }
             assistants filtered where assistant.parentID === user.id

  Superset:  no turn abstraction
             "current turn start" computed per render as findLastUserMessageIndex(messages)
             → race between isRunning transition and new user message arrival
```

### 5.4 Optimistic send

```
  T3 Code:
     client mints messageId (nanoid/uuid)
     dispatch ── { type:"thread.turn.start", messageId, text, ... } ──▶
     server persists with that messageId; events carry the same id
     optimistic row in store uses the same id → server echo is an upsert

  OpenCode:
     client builds { message: UserMessage(id:"opt-<ULID>"), parts: Part[] }
     sync.addOptimistic(sessionID, message, parts)
     POST /session.send ── { optID, parts } ──▶
     server persists + emits "message.updated"/"part.updated"; same id
     optimistic becomes the persisted row; no replace/remove hop

  Superset v2:
     client builds optimistic user message with content text + files
     in-memory useState setOptimisticUserMessage(optimistic)
     mutation sendMessage({ sessionId, workspaceId, payload }) ──▶
     on each poll: historicalMessages.some(m => m.text === optimisticText)
       ↑ TEXT COMPARE: clears the optimistic when it sees ANY user message
         with matching text, including ones from prior turns
```

### 5.5 Streaming display

```
  T3 Code:
     event: thread.message.assistant.delta { messageId, delta }
     reducer: state.messageByThreadId[tid][mid].content += delta
     UI: exactly that one message row's props change; React.memo elsewhere

  OpenCode:
     event: part.updated { messageID, part }
     reducer: setStore("session","part",messageID, produce(...))
     UI: createPacedValue smooths token bursts; MarkdownStream splits
         stable prefix from live tail so the top doesn't rebuild

  Superset v2:
     (no streaming events)
     poll: getDisplayState returns currentMessage with cumulative text
     poll: listMessages returns complete-or-inflight history
     UI: withoutActiveTurnAssistantHistory hides assistant after last user
         while streaming; when the poll catches the completed message,
         a 1–2 frame window shows BOTH the streaming view AND the completed
         copy → the "duplicate assistant bubble" bug
```

### 5.6 Render pipeline

```
  T3 Code:
     deriveMessagesTimelineRows
        → computeStableMessagesTimelineRows (per-variant shallow diff)
           → rows keep object identity when unchanged
              → React.memo rows skip render

  OpenCode:
     createMemo over store slices
     createSessionHistoryWindow (init=10, batch=8, prefetch buffer 16)
     createTimelineStaging     (init=1, batch=3 per rAF)
     content-visibility: auto on inactive turns
     createPacedValue + MarkdownStream on streaming text
     ToolPart dispatch by tool name within a single Parts registry

  Superset v2:
     flat ChatMessageList
     no memoization of rows
     every poll → every row re-renders
     inline overlay components for Approval/Question/Plan mixed into the list
```

### 5.7 Overlays (approval, question, plan)

```
  T3 Code:
     events carry them; timeline renders approval/question context next to
     the tool call that caused them; no dedicated overlay component tree

  OpenCode:
     Dock stack above composer:
        FollowupDock | PermissionDock | QuestionDock | PlanDock |
        TodoDock | RevertDock
     Overlays are transient UI; once answered they leave no trace in the
     timeline — the resolved state is implicit in what the assistant said next.

  Superset v2:
     Inline messages in the timeline:
        PendingApprovalMessage, PendingPlanApprovalMessage,
        PendingQuestionMessage
     → answered overlays remain in message history, visually indistinguishable
       from real assistant turns
```

---

## 6. Transport table

| | T3 Code | OpenCode | Superset v2 |
|---|---|---|---|
| Protocol | WebSocket | HTTP + SSE | HTTPS tRPC |
| Runtime | Effect `Stream` | Hono route returning `Response` with `text/event-stream` | tRPC React Query `useQuery` with `refetchInterval` |
| Connection cardinality | One WS per focused thread (ref-counted) + one "shell" WS | One SSE per app instance (wildcard) | Two HTTP requests per 16 ms |
| Auth | WS token in connect | Bearer in header | Bearer in header |
| Reconnect | `replayEvents({ from: seq })` | Client re-runs bootstrap queries + reopens SSE | N/A (every request is fresh) |
| Backpressure | Effect Stream natural | SSE + client-side event buffering | N/A |

---

## 7. State model table

| | T3 Code | OpenCode | Superset v2 |
|---|---|---|---|
| Client store | Zustand | SolidJS `createStore` | TanStack Query cache + `useState` + small Zustand pieces |
| Normalization | `xxxIdsByThreadId` + `xxxByThreadId` pairs per entity | `message[sessionID]` + `part[messageID]` + overlay slices | Flat arrays returned per query |
| Reference stability | Enforced per-field in `writeThreadState` | `produce` + `reconcile({ key:"id" })` for lists | None — new references per poll |
| Selector memoization | `useStore(selector, shallow)` | `createMemo` | React deps |
| Persistence | Thread state server-side event log | Per-project SQLite | Session metadata in cloud DB; runtime in mastracode SQLite |

---

## 8. Rendering strategy table

| | T3 Code | OpenCode | Superset v2 |
|---|---|---|---|
| Windowing | — | `createSessionHistoryWindow` (init 10 + batch 8) | — |
| Staging | — | `createTimelineStaging` (init 1 + batch 3 per rAF) | — |
| Paced text | — | `createPacedValue` (~24 ms/chunk, whitespace-snapped) | — |
| Live-vs-stable markdown | — | `MarkdownStream` (morphdom on live tail only) | — |
| `content-visibility: auto` | — | Yes, on inactive turns | — |
| Row identity | Reference-preserved via `computeStableMessagesTimelineRows` | Keyed list reconciliation via `reconcile(..., { key:"id" })` | None |
| Overlay placement | Mixed into timeline next to originating tool | Dock stack above composer | Inline timeline entries |

---

## 9. Optimistic-send table

| | T3 Code | OpenCode | Superset v2 |
|---|---|---|---|
| Who mints the id | Client | Client (`opt-<ULID>`, later replaced by server id) | Server |
| Reconciliation key | `messageId` | `optID` → server id | Text content of part |
| Layers | 1 (store) | 1 (store via `addOptimistic`) | 2 (`optimisticUserMessage` + `transientUserTurn`) |
| Repeated identical prompts | Safe (ids differ) | Safe (ids differ) | Breaks (text equality) |

---

## 10. Whistle-stop synthesis

If the goal is to stop the visible bugs (flash, duplicated assistant, lost turn on repeated prompts) with the smallest change, the **T3 Code** pattern is the narrower port:

- Add a typed event bus on our host-service (we already have `git:changed` / `fs:events` infrastructure to extend).
- Client subscribes per session; no polling.
- Normalized Zustand store + stable-row diff.
- Id-based optimistic dedup.

Scope: data layer only. Components stay roughly the same. Estimated 5 phases, see `20260421-0200-v2-chat-t3code-refactor.md`.

If the goal is to **also** clean up the component tree — get docks out of the timeline, window long histories, pace streaming text, split stable from live markdown, collapse the two optimism layers into one — the **OpenCode** model rewrites the surface. It's more work but the end state is simpler: `Message + Part[]` split, `PART_MAPPING` registry, dock stack above composer, windowing + staging + paced markdown.

Scope: whole chat surface, shared types, streaming transport, and composer. Estimated 6 phases, see `20260421-v2-chat-opencode-rebuild.md`.

The two plans are compatible — T3-style can be Phase 1 infrastructure, OpenCode-style can be Phase 2 UI — but they don't *have* to be combined. Either alone fixes the current bugs.
